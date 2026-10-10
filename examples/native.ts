import { NodeFileSystem, NodePath, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Stream } from "effect"
import { WatchPlus } from "../effect-watch-plus.js"

const filesystem = WatchPlus.layer.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)))
const program = Effect.gen(function*() {
  const fs = yield* WatchPlus.fileSystem
  yield* fs.watch(process.argv[2] ?? ".", {
    recursive: true,
    ignore: ["node_modules", ".git"]
  }).pipe(Stream.runForEach((event) => Effect.log(event)))
})

NodeRuntime.runMain(program.pipe(Effect.provide(filesystem)))
