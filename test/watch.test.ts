import { expect, test } from "bun:test"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Deferred, Effect, Fiber, FileSystem, Layer, Path, PlatformError, Stream } from "effect"
import { WatchPlus } from "../effect-watch-plus.js"

const base = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
const enhanced = WatchPlus.layer.pipe(Layer.provide(base))

const temporary = (fs: FileSystem.FileSystem) => fs.makeTempDirectoryScoped({
  directory: process.env.WATCH_TEST_DIRECTORY, prefix: "watch-plus-"
})

test("checked view is the same object; ordinary calls and non-watch functions are unchanged", async () => {
  await Effect.runPromise(Effect.gen(function*() {
    const original = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const calls: Array<FileSystem.WatchOptions | undefined> = []
    const fs = WatchPlus.make({ ...original, watch: (_target, options) => {
      calls.push(options)
      return Stream.empty
    } }, path)
    expect(fs.readFileString).toBe(original.readFileString)
    fs.watch("unchanged")
    fs.watch("unchanged", { recursive: true })
    expect(calls).toEqual([undefined, { recursive: true }])
    const viewed = yield* WatchPlus.fileSystem.pipe(Effect.provideService(FileSystem.FileSystem, fs))
    expect(viewed).toBe(fs)
    // @ts-expect-error native options deliberately remain unaugmented
    original.watch("target", { ignore: ["ignored"] })
    // @ts-expect-error the enhanced view rejects misspelled enhancements
    viewed.watch("target", { ignroe: ["ignored"] })
    viewed.watch("target", { followReplacements: true })
  }).pipe(Effect.provide(base)))
})

test("unenhanced filesystem fails explicitly", async () => {
  const result = await Effect.runPromise(WatchPlus.fileSystem.pipe(Effect.result, Effect.provide(base)))
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("BadArgument")
})

test("recursive literal filters include tombstones, nested paths, dotfiles and sibling boundaries", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* temporary(fs)
    const calls: Array<string> = []
    const watched = WatchPlus.make({ ...fs, watch: (anchor, options) => {
      calls.push(`${anchor}:${options?.recursive}`)
      return Stream.fromArray<FileSystem.WatchEvent>([
        { _tag: "Remove", path: "ignored/deep/deleted" },
        { _tag: "Create", path: "ignored" },
        { _tag: "Update", path: "ignored-sibling/keep" },
        { _tag: "Remove", path: "nested/deleted" },
        { _tag: "Update", path: path.join(target, ".config") }
      ])
    } }, path)
    const result = yield* watched.watch(target, { recursive: true, ignore: ["./ignored/"] }).pipe(Stream.take(3), Stream.runCollect)
    expect(result.map((event) => event.path)).toEqual(["ignored-sibling/keep", "nested/deleted", path.join(target, ".config")])
    expect(calls).toEqual([`${target}:true`])
  })).pipe(Effect.provide(base)))
})

test("invalid ignores and directory replacement promises fail instead of being ignored", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* WatchPlus.fileSystem
    const target = yield* temporary(fs)
    for (const ignore of ["", "../outside", "/absolute"]) {
      const result = yield* fs.watch(target, { ignore: [ignore] }).pipe(Stream.runDrain, Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("BadArgument")
    }
    const result = yield* fs.watch(target, { followReplacements: true }).pipe(Stream.runDrain, Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("BadArgument")
    const missing = yield* fs.watch(target + "/missing", { followReplacements: true }).pipe(Stream.runDrain, Effect.result)
    expect(missing._tag).toBe("Failure")
    if (missing._tag === "Failure") expect(missing.failure.reason._tag).toBe("NotFound")
  })).pipe(Effect.provide(enhanced)))
})

test("known completion fails; source errors propagate without a silent retry", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* temporary(fs)
    const ended = WatchPlus.make({ ...fs, watch: () => Stream.empty }, path)
    const result = yield* ended.watch(target, { ignore: [] }).pipe(Stream.runDrain, Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.reason._tag).toBe("UnexpectedEof")
    const error = PlatformError.systemError({ module: "Test", method: "watch", _tag: "Unknown" })
    const failed = WatchPlus.make({ ...fs, watch: () => Stream.fail(error) }, path)
    const failure = yield* failed.watch(target, { ignore: [] }).pipe(Stream.runDrain, Effect.result)
    expect(failure._tag).toBe("Failure")
    if (failure._tag === "Failure") expect(failure.failure).toBe(error)
  })).pipe(Effect.provide(base)))
})

test("stream scopes release separately; decorator never recurses or acquires eagerly", async () => {
  const owners = new Set<number>()
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = yield* temporary(fs)
    const firstReady = yield* Deferred.make<void>()
    const secondReady = yield* Deferred.make<void>()
    const source = { ...fs, watch: () => Stream.unwrap(Effect.gen(function*() {
      const id = owners.has(1) ? 2 : 1
      yield* Effect.acquireRelease(Effect.sync(() => owners.add(id)), () => Effect.sync(() => owners.delete(id)))
      yield* Deferred.succeed(id === 1 ? firstReady : secondReady, undefined)
      return Stream.fromEffect(Effect.never)
    })) }
    const watched = WatchPlus.make(source, path)
    const stream = watched.watch(target, { recursive: true, ignore: [] })
    expect(owners.size).toBe(0)
    const first = yield* stream.pipe(Stream.runDrain, Effect.forkScoped)
    yield* Deferred.await(firstReady).pipe(Effect.timeout("2 seconds"))
    yield* stream.pipe(Stream.runDrain, Effect.forkScoped)
    yield* Deferred.await(secondReady).pipe(Effect.timeout("2 seconds"))
    expect(owners.size).toBe(2)
    yield* Fiber.interrupt(first)
    expect([...owners]).toEqual([2])
  })).pipe(Effect.provide(base)))
  expect(owners.size).toBe(0)
})

test("real native recursive watch sees nested edits and filters nested exclusions", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* WatchPlus.fileSystem
    const target = yield* temporary(fs)
    yield* fs.makeDirectory(target + "/nested/deep", { recursive: true })
    yield* fs.makeDirectory(target + "/ignored/deep", { recursive: true })
    yield* fs.writeFileString(target + "/probe", "before")
    yield* fs.writeFileString(target + "/nested/deep/keep", "before")
    const installed = yield* Deferred.make<void>()
    const nested = yield* Deferred.make<void>()
    const paths: Array<string> = []
    yield* fs.watch(target, { recursive: true, ignore: ["ignored"] }).pipe(Stream.runForEach((event) => Effect.gen(function*() {
      paths.push(event.path)
      if (event.path === "probe") yield* Deferred.succeed(installed, undefined)
      if (event.path === "nested/deep/keep") yield* Deferred.succeed(nested, undefined)
    })), Effect.forkScoped)
    const writer = yield* Effect.forever(fs.writeFileString(target + "/probe", "probe").pipe(Effect.andThen(Effect.sleep("10 millis")))).pipe(Effect.forkScoped)
    yield* Deferred.await(installed).pipe(Effect.timeout("2 seconds"))
    yield* Fiber.interrupt(writer)
    yield* fs.writeFileString(target + "/ignored/deep/hidden", "ignored")
    yield* fs.writeFileString(target + "/nested/deep/keep", "after")
    yield* Deferred.await(nested).pipe(Effect.timeout("2 seconds"))
    expect(paths.some((name) => name.startsWith("ignored"))).toBe(false)
  })).pipe(Effect.provide(enhanced)))
})

test("real native file survives atomic replacement and a following edit", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* WatchPlus.fileSystem
    const directory = yield* temporary(fs)
    const target = directory + "/config"
    yield* fs.writeFileString(target, "before")
    const installed = yield* Deferred.make<void>()
    const replaced = yield* Deferred.make<void>()
    const edited = yield* Deferred.make<void>()
    yield* fs.watch(target, { followReplacements: true }).pipe(Stream.runForEach(() => Effect.gen(function*() {
      const content = yield* fs.readFileString(target)
      if (content === "probe") yield* Deferred.succeed(installed, undefined)
      if (content === "replacement") yield* Deferred.succeed(replaced, undefined)
      if (content === "after") yield* Deferred.succeed(edited, undefined)
    })), Effect.forkScoped)
    // Event-observed startup stimulus, not a timer offered as an attach barrier.
    const writer = yield* Effect.forever(fs.writeFileString(target, "probe").pipe(Effect.andThen(Effect.sleep("10 millis")))).pipe(Effect.forkScoped)
    yield* Deferred.await(installed).pipe(Effect.timeout("2 seconds"))
    yield* Fiber.interrupt(writer)
    yield* fs.writeFileString(directory + "/replacement", "replacement")
    yield* fs.rename(directory + "/replacement", target)
    yield* Deferred.await(replaced).pipe(Effect.timeout("2 seconds"))
    yield* fs.writeFileString(target, "after")
    yield* Deferred.await(edited).pipe(Effect.timeout("2 seconds"))
  })).pipe(Effect.provide(enhanced)))
})
