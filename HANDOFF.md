# Build handoff: effect-watch-plus

2026-10-10, GPT-6 Astra. The user wants reusable Effect-native watch capabilities
with a good native default and a Watchman provider that can optimize them.
Proceed to implementation after reading the contract; another broad research
wave is not the next deliverable.

## Destination

Build **a small scoped Effect service over a pluggable observation source**.
Its native source delegates to existing Effect `FileSystem.watch`, including
recursive support. It does not port Parcel, replace filesystem internals or
implement a native recursive watcher.

The authoritative cross-library brief is [design/watch/contract.md](design/watch/contract.md).
It defines ownership, native limitations, notices, readiness quality and enhanced
operations. Implementation names are adjustable; keep the semantics and package
dependency direction consistent with that document.

Before this handoff, the repo contained empty `README.md`/`effect-watch-plus.ts`
and a package skeleton whose test script fails intentionally. The handoff adds documentation,
not a working library. Inspect status before editing; establish real dependency,
build, typecheck, test and export configuration as the first implementation stage.

## First useful API

Offer `WatchPlus.open(interest)` as a scoped Effect yielding an observation with
an initial readiness-quality Effect and a notice stream. An interest is an exact
file, direct entries, or recursive directory, with normalized target/ignore policy.

Use `Hint(path, path-or-subtree)` for ordinary changes and `Resync(root, reason)`
for known observation gaps. Consumers can use a reconciliation helper accepting
their own read/scan and update operation. It performs initial reload, coalesces
later dirtiness, and reruns if events arrive during a reload. Do not require a
generic inventory scan for every consumer or turn every atomic save into resync.

This is a service/Layer plus small helpers, **not a wrapping WatchBackend**.
Effect's native fallback lives outside that interface; Plus must consume a
captured filesystem service without replacing it and recursing into itself.

## Required capabilities

| Capability | Native implementation | Watchman optimization |
| --- | --- | --- |
| Recursive observation | Use Effect's existing recursive option | Daemon subscription |
| File atomic saves | Observe parent, filter basename | Parent/root subscription and mapping |
| Missing targets/root replacement | Existing-ancestor watch; reanchor; bounded topology checks as needed | Root/cancellation/identity handling, supplemented where daemon coverage is insufficient |
| Ignores/selection | Normalize and filter locally | Proven pathname pushdown plus residual filtering |
| Coalescing/pressure | Bounded dirty-path sets; latched resync on loss | Preserve daemon batches and catch up where possible |
| Sharing | Identical native anchor leases | Canonical root manager and named interests |
| Initial readiness | Honest best-effort; no native registration acknowledgement | Confirmed attach |
| Known-gap recovery | Reacquire plus caller reconciliation | Compatible clock catch-up, otherwise reconciliation |
| Aligned inventory | Optional later scan/diff helper for inventory consumers | Complete query/baseline/subscribe bundle |

Native silently dropped notifications cannot always be detected. Expose optional
periodic reconciliation/fresh-read policy where consumers need eventual repair.
Do not promise a durable event log, exactly-once delivery, rename identity,
atomic content snapshots or a native attach barrier.

## Build sequence

1. **Small contract and native slice.** Pin/test Effect 4.0.1 initially. Capture
   `FileSystem` and `Path` services. Implement file/entries/tree requests,
   normalization and documented local ignore semantics. Demonstrate real native
   create/edit/delete and nested paths through the public service.
2. **Resilient scopes and topology.** Parent-anchor files; test atomic replacement
   followed by another edit. Handle missing parents, target recreation, unexpected
   stream completion/errors and cancellation during acquisition. Share identical
   anchors without affecting sibling handles on release. Bound buffering.
3. **Reconciliation helper.** Initial read, batched path dirtiness, known-loss
   resync, and no lost rerun when changes arrive during the read. Keep domain
   contents with the caller. Test a consumer's final state, not callback counts.
4. **Optional Watchman adapter.** Add `effect-watch-plus/watchman` as a separate
   export with an optional Watchman peer dependency. Translate its enriched
   observation into the same generic contract. No Watchman import in core/native.
   Run the same high-level consumer conformance tests against both providers.
5. **Stronger operations when used.** An aligned inventory operation is a whole
   baseline+stream contract; generic snapshot/clock/watch functions cannot be
   selected independently. Begin with Watchman's compatible daemon inventory;
   a full native inventory engine is not necessary for the first OpenCode port.

Two reasonable module groupings are source/topology/reconcile under `src/watch/`,
or observation/provider/reconciliation subdomains under `src/`. Pick one compact
domain grouping; don't build a framework/registry around a two-provider problem.

Commit coherent stages with `jj`. Standard scripts should test this repository
directly; OpenCode's monorepo commands are not this package's build system.

## Source anchors and concrete native traps

Initial source authority is the installed Effect **4.0.1** in
`/home/rektide/src/opencode-watchman/node_modules/.bun/`, specifically:

```text
effect@4.0.1/node_modules/effect/src/FileSystem.ts
@effect+platform-node-shared@4.0.1+ff18a43d1df18ff8/node_modules/@effect/platform-node-shared/src/NodeFileSystem.ts
```

The Node provider stats before watching; missing targets never reach a custom
WatchBackend. Construction/consumption exposes no registration acknowledgement.
Null filenames are dropped. Rename classification does asynchronous stat and
can reorder/misclassify notifications. Callbacks ordinarily carry relative names,
including a basename for file watches; normalize against the actual anchor.
Asynchronous watcher errors fail and close ends the stream. Scope releases the
watcher. Synchronous `NFS.watch` setup throws instead become defects in a forked
callback-setup fiber; the pinned callback implementation does not forward that
failure to the queue. Plus cannot promise detection/retry of every setup failure.
Test this boundary and identify a narrow upstream Effect fix if needed, rather
than building a replacement native watcher.

A Sol investigator tested the underlying native behavior on Linux/Bun: direct
file watching detached after atomic replacement; parent watching continued.
Replacing a directory also detached its watcher while its ancestor watcher saw
the replacement. These are motivation for keepers, not cross-platform guarantees.

There is no requirement to fork Effect before starting. Do not use a sleep,
`yieldNow`, or a started fiber as proof the OS listener was installed. A later
small Effect readiness enhancement can strengthen the native source.

## Adjacent work and explicit limits

[Watchman handoff](file:///home/rektide/src/effect-watchman/HANDOFF.md) describes the
independent manager/backend/enriched API. The generic protocol and its adapter
live here; Watchman never imports this package. A Watchman manager provided to
both surfaces must remain one shared resource owner.

[OpenCode plan](file:///home/rektide/src/opencode-watchman/design/filesystem-watch/README.md)
starts fresh at `v2@origin` `4617210822bd` on `effect-watch`. Core already uses
Effect; it will be a thin consumer. GUI users remain Promise/Solid based and
receive typed notifications. No OpenCode imports or env names in this library.

First cut excludes overlapping-root optimization, recursive symlink traversal,
persistent/portable clocks, a mandatory generic indexing engine, remote filesystem
transport and Parcel. OpenCode initially leaves FFF's internal watcher and
TUI-local watchers in place. Those omissions must remain visible in benefit claims.

## Next-session completion receipt

Give actual package entrypoints and a working native example, commit IDs,
Effect/runtime versions, public-surface test commands/results, atomic-save and
cleanup evidence, the Watchman adapter's status, and remaining limitations.
Do not label skipped daemon tests or proposed APIs as implemented behavior.
