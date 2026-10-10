import { expect, test } from "bun:test"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Deferred, Effect, Fiber, FileSystem, Layer, Queue, Schedule, Stream } from "effect"
import { WatchPlus } from "../effect-watch-plus.js"

const base = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)

test("native consumer reruns an authoritative read when another edit arrives during it", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    // This consumer intentionally uses the native FileSystem, not WatchPlus.layer.
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped({
      directory: process.env.WATCH_TEST_DIRECTORY ?? "/home/rektide/tmp-opencode", prefix: "watch-reconcile-"
    })
    const target = directory + "/config"
    yield* fs.writeFileString(target, "initial")
    const observed = yield* Queue.make<void>()
    const hold = yield* Deferred.make<void>()
    const captured = yield* Deferred.make<void>()
    const final = yield* Deferred.make<void>()
    const values: Array<string> = []
    const reads: Array<string> = []
    const read = Effect.gen(function*() {
      const value = yield* fs.readFileString(target)
      reads.push(value)
      if (value === "held") {
        yield* Deferred.succeed(captured, undefined)
        yield* Deferred.await(hold)
      }
      return value
    })
    const consumer = yield* WatchPlus.reconcile(
      fs.watch(directory).pipe(Stream.tap(() => Queue.offer(observed, undefined))), read
    ).pipe(Stream.runForEach((value) => Effect.gen(function*() {
      values.push(value)
      if (value === "final") yield* Deferred.succeed(final, undefined)
    })), Effect.forkScoped)
    const writer = yield* Effect.forever(fs.writeFileString(target, "probe").pipe(
      Effect.andThen(Effect.sleep("10 millis"))
    )).pipe(Effect.forkScoped)
    yield* Queue.take(observed).pipe(Effect.timeout("2 seconds"))
    yield* Fiber.interrupt(writer)
    yield* fs.writeFileString(directory + "/staged", "held")
    yield* fs.rename(directory + "/staged", target)
    yield* Deferred.await(captured).pipe(Effect.timeout("2 seconds"))
    // Drain prior hints; now the read is suspended with a captured old value.
    yield* Queue.clear(observed)
    yield* fs.writeFileString(directory + "/staged", "final")
    yield* fs.rename(directory + "/staged", target)
    yield* Queue.take(observed).pipe(Effect.timeout("2 seconds"))
    yield* Deferred.succeed(hold, undefined)
    yield* Deferred.await(final).pipe(Effect.timeout("2 seconds"))
    expect(values).toContain("held")
    expect(values.at(-1)).toBe("final")
    expect(reads.at(-1)).toBe("final")
    yield* Fiber.interrupt(consumer)
  })).pipe(Effect.provide(base)))
})

test("initial read runs without a hint and burst hints during a read coalesce to one rerun", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const hints = yield* Queue.make<void>()
    const entered = yield* Deferred.make<void>()
    const hold = yield* Deferred.make<void>()
    const processed = yield* Deferred.make<void>()
    const rerun = yield* Deferred.make<void>()
    const reads: Array<number> = []
    const stream = WatchPlus.reconcile(Stream.fromQueue(hints).pipe(Stream.tap(() => {
      return Queue.size(hints).pipe(Effect.flatMap((size) => size === 0 ? Deferred.succeed(processed, undefined) : Effect.void))
    })), Effect.gen(function*() {
      reads.push(reads.length + 1)
      if (reads.length === 1) {
        yield* Deferred.succeed(entered, undefined)
        yield* Deferred.await(hold)
      }
      return reads.length
    }))
    const values: Array<number> = []
    const consumer = yield* stream.pipe(Stream.runForEach((value) => Effect.gen(function*() {
      values.push(value)
      if (value === 2) yield* Deferred.succeed(rerun, undefined)
    })), Effect.forkScoped)
    yield* Deferred.await(entered).pipe(Effect.timeout("2 seconds"))
    yield* Queue.offerAll(hints, Array.from({ length: 100 }, () => undefined))
    yield* Deferred.await(processed).pipe(Effect.timeout("2 seconds"))
    yield* Deferred.succeed(hold, undefined)
    yield* Deferred.await(rerun).pipe(Effect.timeout("2 seconds"))
    // Leave downstream pulling: a backlog of uncoalesced hints would rerun here.
    yield* Effect.sleep("50 millis")
    expect(values).toEqual([1, 2])
    expect(reads.length).toBe(2)
    yield* Fiber.interrupt(consumer)
  })))
})

test("read errors and watch errors preserve their typed identity; completion does not hang", async () => {
  const readError = { _tag: "ReadFailed" } as const
  const readFailure = await Effect.runPromise(WatchPlus.reconcile(
    Stream.never, Effect.fail(readError)
  ).pipe(Stream.runDrain, Effect.result))
  expect(readFailure._tag).toBe("Failure")
  if (readFailure._tag === "Failure") expect(readFailure.failure).toBe(readError)
  const watchError = { _tag: "WatchFailed" } as const
  const watchFailure = await Effect.runPromise(WatchPlus.reconcile(
    Stream.fail(watchError), Effect.never
  ).pipe(Stream.runDrain, Effect.result, Effect.timeout("2 seconds")))
  expect(watchFailure._tag).toBe("Failure")
  if (watchFailure._tag === "Failure") expect(watchFailure.failure).toBe(watchError)
  const completion = await Effect.runPromise(WatchPlus.reconcile(
    Stream.empty, Effect.never
  ).pipe(Stream.runDrain, Effect.result, Effect.timeout("2 seconds")))
  expect(completion._tag).toBe("Failure")
  if (completion._tag === "Failure") expect(completion.failure.reason._tag).toBe("UnexpectedEof")
})

test("scope interruption releases both watch and in-progress read", async () => {
  const owners = new Set<string>()
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const watching = yield* Deferred.make<void>()
    const reading = yield* Deferred.make<void>()
    yield* WatchPlus.reconcile(Stream.unwrap(Effect.gen(function*() {
      yield* Effect.acquireRelease(Effect.sync(() => owners.add("watch")), () => Effect.sync(() => owners.delete("watch")))
      yield* Deferred.succeed(watching, undefined)
      return Stream.never
    })), Effect.scoped(Effect.gen(function*() {
      yield* Effect.acquireRelease(Effect.sync(() => owners.add("read")), () => Effect.sync(() => owners.delete("read")))
      yield* Deferred.succeed(reading, undefined)
      return yield* Effect.never
    }))).pipe(Stream.runDrain, Effect.forkScoped)
    yield* Deferred.await(watching).pipe(Effect.timeout("2 seconds"))
    yield* Deferred.await(reading).pipe(Effect.timeout("2 seconds"))
    expect(owners.size).toBe(2)
  })))
  expect(owners.size).toBe(0)
})

test("an explicit caller retry reopens dirtiness and performs another initial read", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const reopen = yield* Deferred.make<void>()
    const reread = yield* Deferred.make<void>()
    const fail = yield* Deferred.make<void>()
    const attempts: Array<number> = []
    const reads: Array<number> = []
    const source = Stream.unwrap(Effect.gen(function*() {
      attempts.push(attempts.length + 1)
      if (attempts.length === 1) return Stream.fromEffect(Deferred.await(fail).pipe(Effect.andThen(Effect.fail("lost"))))
      yield* Deferred.succeed(reopen, undefined)
      return Stream.never
    }))
    const stream = WatchPlus.reconcile(source, Effect.sync(() => {
      reads.push(reads.length + 1)
      return reads.length
    })).pipe(Stream.retry(Schedule.recurs(1)))
    const consumer = yield* stream.pipe(Stream.runForEach((value) => value === 1
      ? Deferred.succeed(fail, undefined)
      : Deferred.succeed(reread, undefined)), Effect.forkScoped)
    yield* Deferred.await(reopen).pipe(Effect.timeout("2 seconds"))
    // Wait for the second authoritative read, independent of subscription order.
    yield* Deferred.await(reread).pipe(Effect.timeout("2 seconds"))
    expect(attempts.length).toBe(2)
    expect(reads.length).toBe(2)
    yield* Fiber.interrupt(consumer)
  })))
})
