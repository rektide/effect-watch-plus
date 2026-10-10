# Additive Effect watch contract

Current bounded implementation contract, 2026-10-10, GPT-6.1 Sol.
The user-selected additive direction replaces the mandatory `WatchPlus.open`
observation-service architecture preserved at Plus `27a8bdf3` / Watchman
`a31fda8d`. Those commits are design history, not current constraints.
[The architecture gate](additive-gate.md) passed before package implementation.

## Public vocabulary and composition

The operation remains **`fs.watch(path, options)`**. Standard options/events
remain Effect's `recursive` and Create/Update/Remove. Version 1 enhances options:

```ts
interface WatchOptions extends FileSystem.WatchOptions {
  readonly ignore?: ReadonlyArray<string> | undefined
  readonly followReplacements?: boolean | undefined
}
```

An enhanced filesystem extends Effect's service with the wider watch signature
and `readonly ["~effect-watch/options/v1"]: true`. This versioned marker is a
provider's complete contract promise. Plus and Watchman export structurally
compatible option/filesystem types and checked accessors. They need no shared
runtime service, global mutation, registry, or third contract package.

```ts
const fs = yield* WatchPlus.fileSystem // checked typed view of Effect's service
fs.watch(target)
fs.watch(target, { recursive: true })
fs.watch(target, { recursive: true, ignore: ["generated"] })
fs.watch(existingFile, { followReplacements: true })
```

The accessor returns the **same object** already at Effect's FileSystem key.
It fails with `PlatformError/BadArgument` if the marker is absent. It is not an
observation acquisition API and installs nothing. Independent Watchman users
may use `Watchman.fileSystem` instead; the signature and behavior are identical.
Ordinary consumers can keep yielding `FileSystem.FileSystem` unchanged.

Do not globally augment Effect's WatchOptions. That would let an unenhanced
native filesystem silently ignore requested options. TypeScript structural
assignment can still allow prebuilt excess-property variables on base Effect;
those calls are not a supported way to request enhancements. Future vocabulary
must add a checked/versioned contract, rather than promising new semantics on
providers implementing only v1. A marker is a trusted provider contract, not a
security validator for arbitrary JS implementations.

### Native decoration

```ts
const filesystem = WatchPlus.layer.pipe(
  Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
)
```

Plus captures an **already constructed** filesystem and Path, then replaces
only watch in its Layer output. Watch closures call the captured input, not a
filesystem fetched from the replaced context. Non-watch functions retain their
identities. Unenhanced calls delegate unchanged, including native recursion.
If the input already uses a Watchman backend, it is not a forced-native layer.

### Independent Watchman

Watchman directly implements the same options with its captured backend. The
current seam is `Watchman.fromBackend`, requiring Effect FileSystem, Path and
WatchBackend. It never calls the captured filesystem's watch and never constructs
Plus's layer. Backend `None` fails explicitly, not native fallback. The next
daemon manager stage supplies one scoped backend/manager, shared with any base
filesystem using it. The decorator creates no managers or background tasks.

```text
effect-watch-plus → Effect peer
effect-watchman   → Effect peer (later runtime transport)
application      → either provider; one Effect identity
```

No dependency between the two packages is needed for v1. Their small structural
contract is recorded here and proved using installed public package exports.
Any future common helper export must not make a Plus policy runtime mandatory
for Watchman. Optional richer operations can preserve daemon information directly.

## Exact v1 semantics

**Ignore** is a list of literal paths; each excludes itself and descendants on
a path-segment boundary. Directory-relative for directory watches; parent-relative
for files. Includes dotfiles, case-sensitive matching, platform Path separators,
normalization of `.` and trailing separators. Empty, absolute and escaping
exclusions fail with BadArgument. Wildcard characters are literal. No glob,
Git-ignore, filesystem identity or recursive symlink traversal promise.
Native uses local filtering; Watchman currently also filters locally. Proven
pathname-safe daemon pushdown can optimize it later, retaining residual filtering.
Never discard deletion tombstones with `exists` filters.

**Follow replacements** requires an existing file (`stat` reports File).
It observes the lexical parent nonrecursively and selects the
basename. Inode replacement of the file leaves that parent observation intact.
Ignores apply after file selection. Parent disappearance/replacement, missing
targets and directory lifecycle resilience are **not** implemented. Recursive
selection has no extra meaning for this single-file parent anchor.
Following writes through a symbolic link is not supported, even when its referent
has a different name within the same parent. This option observes the lexical
directory entry, not symlink identity.

**Paths** retain the underlying Effect event's pathname convention. Pinned Node
returns anchor-relative callbacks, including basename for files; absolute backend
paths also filter correctly. This layer does not silently change standard events
into absolute-path notices. A daemon backend must map names to the logical anchor
namespace and reject escaping wire paths before publishing typed watch events.

**Ownership** is stream consumption scoped. Nothing is acquired by constructing
a watch stream. Closing/interruption releases the source scope. Separate streams
have separate leases; releasing one does not release its sibling. Native anchor
sharing is not implemented; backend/manager sharing is Layer-owned. No detached
tasks, live-service restarts or hidden daemon autospawn are part of the baseline.

**Loss**: source errors propagate. Enhanced native and all direct Watchman stream
completions fail with PlatformError/UnexpectedEof. Known loss is never fabricated
as `Update(root)` or silently retried into success. The caller should reconcile
before reopening; optional reconciliation helpers can later own that loop.

## Guarantees ordinary watch cannot express

There is no installation acknowledgement, initial inventory, resync marker,
cursor, baseline-to-delta ordering or application-applied checkpoint in the base
event union. Scoped implementation does not require a scoped-handle public API,
but richer guarantees require an **optional explicit coherent operation/helper**
or a small clean upstream extension. Do not reconstruct clocks/readiness after
stripping metadata through standard events. Do not weaken loss behavior just to
keep a stream alive. Review each extension's typing and native honesty at its gate.

The baseline cannot fix these pinned native internals:

- Node stats before backend registration; missing targets fail first.
- Optional WatchBackend is captured during filesystem Layer construction.
- Native null filenames are dropped.
- Rename classification asynchronously stats and can reorder/misclassify hints.
- Native callback delivery has an upstream unbounded queue.
- Synchronous `NFS.watch` setup throws in a forked callback setup fiber can fail
  without reaching the stream's queue. No generic retry/readiness fix is claimed.

No sleep/yield/fork-start is an OS registration barrier. Event-observed stimulus
in the native tests establishes only that the test actually saw an event.
Native undocumented losses remain unknowable; eventual reconciliation requires
a separate explicit policy. No durable operation journal, exactly-once events,
rename identity or atomic content snapshot is promised.

## Evidence and next boundaries

Package baseline: Plus `481abfcc`, Watchman `8a5313d4`. Strict typechecks/builds
passed; **8 native/Plus tests**, **6 backend seam tests**. Two tarballs installed
in a third consumer project passed **3 public-export tests**, including the same
consumer on both implementations and resolution of one consumer Effect identity.
See the maintained [consumer proof](consumer-proof.test.ts) and gate receipt.

Next owner boundaries: Plus's missing/replaced topology and caller reconciliation;
Watchman's scoped transport, manager, standard backend and daemon conformance.
No aligned inventory engine or universal service framework is needed to extend
this seam. Parent coordinates later stages and their review. Parcel and OpenCode
source changes are expressly outside this baseline.
