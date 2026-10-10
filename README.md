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
  basename, and survive replacement of that file while parent coverage holds.
  Directory requests and initially missing targets fail. The native decorator
   snapshots the parent's device/inode identity, stats its lexical path once
   before each event and every 100 ms, and fails on observed loss
  (`UnexpectedEof` for changed identity; filesystem errors for failed checks).
  Identity-unavailable filesystems fail explicitly. Guards are scoped and retain
   only one parent snapshot per stream; they never rearm or fabricate events.
   Ancestor replacement is detected if the parent path disappears or resolves
   to a different inode; an ancestor move preserving that parent is not a loss.
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
Polling is not an acquisition acknowledgement or continuous coverage proof:
brief detach/restore gaps, inode reuse and losses hidden upstream can escape
detection. This is a native-decorator improvement, not a stronger recovery promise
required of every v1 provider. Initially missing interests and full topology
recovery need a later jointly versioned opt-in; no such options exist here.

The same checked view works with independent enhanced providers such as
`effect-watchman`; **WatchPlus.layer is not required** for those providers.
No Parcel, OpenCode import or Effect runtime dependency is bundled.

## Optional authoritative reads

`WatchPlus.reconcile(dirtiness, read)` is an ordinary Stream helper, not a
service or requirement for watch callers. It also works with native filesystems:

```ts
import { Effect, FileSystem, Stream } from "effect"
import { WatchPlus } from "effect-watch-plus"

const values = Stream.unwrap(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  return WatchPlus.reconcile(
    fs.watch("/my/config-directory"),
    fs.readFileString("/my/config-directory/settings.json")
  )
}))
// Provide your native or enhanced filesystem layer as usual.
const program = values.pipe(Stream.runForEach((value) => Effect.log(value)))
```

The first read needs no hint. Subsequent hints coalesce into one pending dirty
token, with reads serialized. A hint received while a read is running leaves a
rerun pending **even if that read returns an older value**. Reads are
backpressured (Effect's merge can start one read ahead of downstream demand);
intermediate values need not appear. This
bounds the helper's dirty state, not upstream native buffering or caller data.
The background watcher and active read are interrupted on stream disposal.

Read/watch typed errors propagate unchanged and end the stream;
watch completion fails with `PlatformError/UnexpectedEof`. Nothing retries by
default. A caller may compose `values.pipe(Stream.retry(yourReopenPolicy))`:
reopening re-executes the watch and initial authoritative read. Choose which
errors to retry explicitly; do not indiscriminately swallow permanent read or
configuration failures. Effect's Stream retry schedule resets after an emitted
value, so a retry count is not a total lifetime reopen budget.
Retry alone requires a replayable source: a provider with a terminal owner, such
as Watchman's manager after socket failure, requires the caller to rebuild its
owning layer before reopening.

Subscription and the initial read run concurrently, **not behind an OS readiness
barrier**. The rerun guarantee applies to hints the stream actually receives;
startup gaps, upstream-dropped events and hidden losses still require caller
reconciliation policy. No synthetic WatchEvent or app-owned cache is introduced.

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
