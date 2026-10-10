# effect-watch-plus

Additive watch options for Effect **4.0.1**. Ordinary filesystem methods and
`fs.watch(path, { recursive })` remain usable. A checked typed view enables
enhancements without globally making unsupported native options typecheck.

```ts
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Effect, Layer, Stream } from "effect"
import { WatchPlus } from "effect-watch-plus"

const filesystem = WatchPlus.layer.pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
)

const program = Effect.gen(function*() {
  const fs = yield* WatchPlus.fileSystem
  yield* fs.watch(".", {
    recursive: true,
    ignore: ["node_modules", ".git"]
  }).pipe(Stream.runForEach((event) => Effect.log(event)))
}).pipe(Effect.provide(filesystem))
```

- `ignore`: literal relative paths/subtrees, **not globs** or Git-ignore syntax.
  For directories, paths are relative to that directory; for files, to their
  parent. Dotfiles are included, matching is case-sensitive, and trailing
  separators/`.` segments normalize. Absolute, empty and escaping ignores fail.
- `followReplacements: true`: watch an **existing file's parent**, select the
  basename, and survive replacement of that file. Directory requests fail;
  missing targets and replaced parents are not handled in this baseline.
  It watches the lexical entry, not writes through symbolic links to a referent.
- `WatchPlus.fileSystem`: returns the same filesystem object with enhanced
  option types, or fails with `PlatformError/BadArgument` if not installed.
  Ordinary callers can still use Effect's `FileSystem.FileSystem` service.
- `WatchPlus.make(fs, path)`: pure decoration for explicit composition/testing.
  It captures the input filesystem and changes only `watch`.

Streams are lazy, scoped, and emit ordinary Effect Create/Update/Remove **hints**.
Enhanced unexpected completion fails with `PlatformError/UnexpectedEof`; errors
propagate. Reconcile before restarting after known loss. No ready/resync event,
automatic retry, initial inventory, end-to-end memory bound or exactly-once claim.
Native null-name drops and synchronous setup defects remain upstream limitations.

The same checked view works with independent enhanced providers such as
`effect-watchman`; **WatchPlus.layer is not required** for those providers.
No Parcel, OpenCode import or Effect runtime dependency is bundled.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test
bun examples/native.ts /directory/to/watch
```

Live tests accept `WATCH_TEST_DIRECTORY` to choose temporary storage.
[Contract](design/watch/contract.md), [gate/evidence](design/watch/additive-gate.md),
and [next-stage handoff](HANDOFF.md) describe scope and remaining work.
