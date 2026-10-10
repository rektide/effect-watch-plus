# Additive watch gate — passed

2026-10-10. Architecture/baseline implementation stage, GPT-6.1 Sol.
Supersedes the mandatory observation-service direction in the predecessor
contract (Plus `27a8bdf3`, Watchman `a31fda8d`). User direction: enhance ordinary
Effect `watch(path, options)`, not require observation handles.

## Proven seam

Effect 4.0.1 `FileSystem.WatchOptions` is an interface containing `recursive`.
`FileSystem.watch` is a replaceable function on a structurally typed service.
The Node implementation captures `WatchBackend` during Layer construction,
stats before `register`, and passes options through unchanged. Native fallback
is outside `WatchBackend`, but this does **not** prevent filesystem decoration.
Capture the already-constructed filesystem and replace **only** `watch`.
Closures retain the input filesystem; Layer output replaces the same service key.

The checked typed-view accessor yields that same object with a wider watch
signature. A versioned structural capability marker is the provider's promise
that the enhancement contract is installed, not global mutable state. Providers
can implement it independently. No global module augmentation, second service
identity, monkey patch, unchecked cast, or upstream source change is needed.

Proven consumer shape:

```ts
const fs = yield* WatchPlus.fileSystem
fs.watch(target)
fs.watch(target, { recursive: true })
fs.watch(target, { recursive: true, ignore: ["generated"] })
fs.watch(file, { followReplacements: true })
```

Ordinary callers still use `yield* FileSystem.FileSystem`. Enhanced callers
explicitly select a checked typed view once, **not** a parallel watch operation.
Undecorated filesystems fail the accessor with `PlatformError/BadArgument` rather
than silently ignore options. TypeScript rejects misspelled enhancements.
Structural TypeScript permits excess fields in some prebuilt variables; passing
such values directly to undecorated Effect is not an enhancement promise.
Global augmentation would erase this safety boundary and was rejected.

## Evidence

Initial executable spike:
`/home/rektide/tmp-opencode/watch-additive-gate/gate.test.ts`.
`bun run typecheck` (`tsgo`, strict NodeNext): passed.
`bun test`: **5 passed, 0 failed**, Bun 1.4.2 / Linux, Effect and
platform-node-shared 4.0.1 from the installed consumer dependencies.

- Ordinary watch syntax, recursive/nested subtree filtering and sibling boundary.
- Explicit rejection of an undecorated filesystem.
- Real Node filesystem Layer captures/selects the supplied backend.
- Identical consumer on an independent backend, with no Plus decorator.
- Real native file stream: event-observed startup stimulus, atomic replacement,
  and a subsequent edit all reached the consumer. No sleep claimed readiness.

These are seam proofs, not daemon conformance. The independent backend was a
fixture.

### Maintained baseline and package boundary receipt

Plus package baseline `481abfcc`, Watchman direct seam `8a5313d4`:
`bun run typecheck` and `bun run build` passed in both repositories.
`WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test`: **8 Plus passed**,
**6 Watchman passed**. These include real native nested recursion, file atomic
replacement + later edit, errors/completion, explicit refusal, same-object
checked view, lazy acquisition, sibling cleanup and one Layer-owned backend.

`bun pm pack --destination /home/rektide/tmp-opencode/watch-additive-gate` in each
repo produced installable tarballs. The isolated project
`/home/rektide/tmp-opencode/watch-additive-consumer` installed both tarballs, Effect
4.0.1 and pinned platform-node/shared 4.0.1. Strict typecheck and **3 tests passed**:
same consumer on both implementations, with no Plus decorator in the Watchman
composition, and both package imports resolving the consumer's one Effect identity.
Only public package exports were imported. The maintained
[consumer proof](consumer-proof.test.ts) records that experiment for repetition.
No daemon, OpenCode source, live service, push or publication was used.

## Limits and next stage

Initial enhancements: literal relative subtree ignores and an existing-file
`followReplacements` policy using the parent anchor. Ordinary events remain
Create/Update/Remove hints; no invented resync event or initial inventory.
Known stream failure propagates; enhanced unexpected completion should fail.
Retry across known loss is not transparent without caller reconciliation.
Readiness, aligned inventory and clock/catch-up guarantees cannot fit in the
ordinary event union; optional coherent helpers may expose those later.

Native upstream null-name drops, unbounded callback buffering, asynchronous
rename classification, and unforwarded synchronous setup defects remain limits.
Generic decoration cannot fix them or claim an OS attachment barrier.
Missing targets, replaced parent/directory roots, sharing and transport are not
proved by this gate. Watchman next builds a scoped manager/backend and preserves
the same options directly; it must not need a running Plus policy layer.
