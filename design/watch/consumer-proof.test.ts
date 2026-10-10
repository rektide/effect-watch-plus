/**
 * Public-package boundary proof. Copy into an isolated private consumer with
 * Effect/platform-node/platform-node-shared 4.0.1 and both built package tarballs.
 * Run bun test and a strict NodeNext typecheck there, not as a source-repo test.
 * WATCH_TEST_DIRECTORY selects temporary storage. No repository-internal imports.
 */
import { expect, test } from "bun:test"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Option, Stream } from "effect"
import { WatchPlus } from "effect-watch-plus"
import { Watchman } from "effect-watchman"

const options: WatchPlus.WatchOptions = { recursive: true, ignore: ["ignored"] }
const interoperable: Watchman.WatchOptions = options
const reverse: WatchPlus.WatchOptions = interoperable

const consumer = Effect.scoped(Effect.gen(function*() {
  const fs = yield* WatchPlus.fileSystem
  const directory = yield* fs.makeTempDirectoryScoped({
    directory: process.env.WATCH_TEST_DIRECTORY, prefix: "public-watch-"
  })
  const tree = yield* fs.watch(directory, reverse).pipe(Stream.take(2), Stream.runCollect)
  expect(tree.map((event) => event.path)).toEqual(["ignored-sibling/keep", "nested/deleted"])
  yield* fs.writeFileString(directory + "/config", "existing")
  const file = yield* fs.watch(directory + "/config", { followReplacements: true }).pipe(Stream.take(1), Stream.runCollect)
  expect(file.map((event) => event.path)).toEqual(["config"])
}))

const events = () => Stream.fromArray<FileSystem.WatchEvent>([
  { _tag: "Remove", path: "ignored/deep/deleted" },
  { _tag: "Update", path: "ignored-sibling/keep" },
  { _tag: "Remove", path: "nested/deleted" },
  { _tag: "Update", path: "config" }
])

test("installed public exports: native decorator", async () => {
  const fixture = Layer.effect(FileSystem.FileSystem, Effect.map(FileSystem.FileSystem, (fs) => ({
    ...fs, watch: events
  }))).pipe(Layer.provide(NodeFileSystem.layer))
  const filesystem = WatchPlus.layer.pipe(Layer.provide(Layer.mergeAll(fixture, NodePath.layer)))
  await Effect.runPromise(consumer.pipe(Effect.provide(filesystem)))
})

test("installed public exports: independent Watchman, without WatchPlus.layer", async () => {
  const backend = Layer.succeed(FileSystem.WatchBackend, { register: () => Option.some(events()) })
  const filesystem = Watchman.fromBackend.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, backend)))
  await Effect.runPromise(consumer.pipe(Effect.provide(filesystem)))
})

test("packages resolve the consumer's single Effect identity", () => {
  const expected = Bun.resolveSync("effect", import.meta.dir)
  for (const name of ["effect-watch-plus", "effect-watchman"]) {
    const entry = Bun.resolveSync(name, import.meta.dir)
    expect(Bun.resolveSync("effect", entry.slice(0, entry.lastIndexOf("/")))).toBe(expected)
  }
})
