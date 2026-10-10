# Build handoff: additive Watch Plus

2026-10-10, GPT-6.1 Sol. **Architecture gate passed; executable baseline landed.**
Latest user direction supersedes the older mandatory `WatchPlus.open` service and
Plus-only enriched-adapter proposal preserved at `27a8bdf3`. Current authority:
[additive contract](design/watch/contract.md), [gate/evidence](design/watch/additive-gate.md).

## Implemented, not merely proposed

- `import { WatchPlus } from "effect-watch-plus"` (built ESM + declarations).
- `WatchPlus.layer`: capture Effect FileSystem/Path, replace only watch.
- `WatchPlus.fileSystem`: checked same-object typed view, richer ordinary
  `fs.watch(path, options)`; no global WatchOptions augmentation.
- `ignore`: literal relative subtree exclusions, including nested deletions.
- `followReplacements: true`: existing file parent-anchor, survives atomic save
  and following edit. Requests for directories fail rather than silently downgrade.
- Native decorator snapshots parent/lexical-ancestor device/inode identities and
  checks before forwarding events plus every 100 ms. Observed identity change
  fails with `UnexpectedEof`; stat failures propagate. Missing identities fail
  explicitly. Scoped guards do not retry, rearm or synthesize root updates.
- Known enhanced stream completion fails; source failures propagate. No retry
  across loss without caller reconciliation.
- Optional `WatchPlus.reconcile(dirtiness, read)` works with ordinary native and
  enhanced streams. It performs an initial read, serializes subsequent reads,
  and retains one coalesced pending rerun for hints received during a read.
  Typed read/watch failures propagate and completion fails with `UnexpectedEof`;
  disposal interrupts both operations. Caller `Stream.retry(policy)` reopens and
  rereads; no automatic policy or OS acquisition acknowledgement is introduced.
- Effect 4.0.1 exact peer/test baseline; native platform packages also pinned to
  4.0.1. No runtime dependencies/bundled duplicate Effect. Bun lock, build,
  typecheck, test, public exports and a native example are working.

Commits: gate `ebdc5af0`; package baseline `481abfcc`.
Watchman gate `c6f11e13`; direct independent seam `8a5313d4`.
Parent/ancestor identity guard: `09e1c5e4`. Helper implementation is the next
coherent commit after that guard; no pushes or releases were performed.

## Verification receipt

Original baseline, from each repo: `bun run typecheck`, `bun run build`: passed.
`WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test`: Plus **8 passed**,
Watchman **6 passed**. Bun 1.4.2/Linux; Effect/platform-node/shared 4.0.1.
Native recursive nested edits and atomic replacement+later edit passed. Scoped
fixture tests prove laziness, sibling release, no recursive context lookup and
one captured backend owner. These are **not daemon tests**.

Focused Plus implementation: **17 tests passed**, plus typecheck/build. Native
tests now cover parent deletion/replacement, ancestor replacement, sibling
isolation and guard disposal. A native consumer captures an old read, holds it
while a second atomic edit produces a hint, then verifies the final value from a
rerun. Helper fixtures cover initial reads, burst coalescing, unchanged typed
failures, unexpected completion, scope cleanup and explicit reopen/reread.
Default maintained fixture storage is `/home/rektide/tmp-opencode`; the existing
`WATCH_TEST_DIRECTORY` override remains available.
The complete 17-test suite also passed five repetitions (**85 passed**, zero
failures). Built `dist/effect-watch-plus.js` exported the helper and produced an
initial read through the public namespace. No new tarball/reinstall cycle was
needed for this additive namespace export.

Both `bun pm pack` outputs installed in
`/home/rektide/tmp-opencode/watch-additive-consumer`: strict typecheck passed;
**3 public-export tests passed**. Same consumer used `WatchPlus.fileSystem` on
both compositions, with no `WatchPlus.layer` in independent Watchman. Runtime
resolution checked one Effect identity. Maintained source:
[consumer-proof.test.ts](design/watch/consumer-proof.test.ts).

## Next stage for Sol Medium, coordinated by parent

1. Initial missing rejection stays v1 policy. Native existing-file ancestor-loss
   detection is implemented, not recovery. Missing interests and full topology
   recovery remain a later jointly versioned opt-in; review before new options.
2. The optional caller-owned read/reconcile helper is now implemented. Test it
   against independent Watchman's enhanced fs when that backend is ready; no
   mandatory adapter, cache or fake root Update is involved.
3. Only when needed, share identical native anchors with scoped independent
   leases and bounded **owned** delivery. Native upstream buffering stays unbounded.
4. Cross-provider consumer conformance as Watchman's real backend lands. No
   mandatory adapter/decorator between Watchman and the application.

Keep these as bounded commits with tests. No time estimates. Parent owns agent
coordination; do not edit the other repo concurrently without assignment.

## Limits / architecture review boundaries

Current missing targets fail. Directory/parent replacement is not repaired;
observed existing-file parent/ancestor identity loss terminates the native stream.
The polling guard retains one snapshot per lexical ancestor. It cannot prove
continuous coverage or detect every detach/restore gap or inode reuse, and does
not strengthen recovery requirements for all independent v1 providers.
No readiness barrier, resync union, aligned inventory, clocks, automatic retry,
glob matcher, native anchor sharing, or bounded native upstream delivery exists.
Null filenames and synchronous setup defects can be hidden upstream. Future
readiness/buffering support should prefer a small demonstrated Effect companion
change over a replacement native watcher. No native recursion implementation.
The helper's dirty bit is bounded, not the native upstream queue. It cannot
recover changes that produced no received hint; initial read and subscription
are concurrent, not aligned. Caller retry schedules can reset on each emitted
value and need their own explicit failure classification/budget if required.

Optional stronger helpers/operations must expose their actual guarantee, not make
a new observation service mandatory. Review topology/root identity strategy,
known-loss/reconcile ordering, capability version evolution and memory-bound
claims with the architecture lead. No Parcel, OpenCode edits, live app/server/
daemon restarts, publishing or pushing are authorized here.
