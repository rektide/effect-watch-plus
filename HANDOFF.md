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
- Known enhanced stream completion fails; source failures propagate. No retry
  across loss without caller reconciliation.
- Effect 4.0.1 exact peer/test baseline; native platform packages also pinned to
  4.0.1. No runtime dependencies/bundled duplicate Effect. Bun lock, build,
  typecheck, test, public exports and a native example are working.

Commits: gate `ebdc5af0`; package baseline `481abfcc`.
Watchman gate `c6f11e13`; direct independent seam `8a5313d4`.

## Verification receipt

From each repo: `bun run typecheck`, `bun run build`: passed.
`WATCH_TEST_DIRECTORY=/home/rektide/tmp-opencode bun run test`: Plus **8 passed**,
Watchman **6 passed**. Bun 1.4.2/Linux; Effect/platform-node/shared 4.0.1.
Native recursive nested edits and atomic replacement+later edit passed. Scoped
fixture tests prove laziness, sibling release, no recursive context lookup and
one captured backend owner. These are **not daemon tests**.

Both `bun pm pack` outputs installed in
`/home/rektide/tmp-opencode/watch-additive-consumer`: strict typecheck passed;
**3 public-export tests passed**. Same consumer used `WatchPlus.fileSystem` on
both compositions, with no `WatchPlus.layer` in independent Watchman. Runtime
resolution checked one Effect identity. Maintained source:
[consumer-proof.test.ts](design/watch/consumer-proof.test.ts).

## Next stage for Sol Medium, coordinated by parent

1. Add explicit missing-file/directory and replaced-parent/root policies, without
   overstating native acquisition guarantees. Preserve `fs.watch` vocabulary;
   review any new options/marker version before implementation.
2. Add an optional caller-owned read/reconcile helper. Initial authoritative read,
   coalesced reruns when dirtiness arrives during read, and failure/reopen with
   reconciliation on known loss. Do not invent an app cache or fake root Update.
3. Only when needed, share identical native anchors with scoped independent
   leases and bounded **owned** delivery. Native upstream buffering stays unbounded.
4. Cross-provider consumer conformance as Watchman's real backend lands. No
   mandatory adapter/decorator between Watchman and the application.

Keep these as bounded commits with tests. No time estimates. Parent owns agent
coordination; do not edit the other repo concurrently without assignment.

## Limits / architecture review boundaries

Current missing targets fail. Directory/parent replacement is not repaired.
No readiness barrier, resync union, aligned inventory, clocks, generic retry,
glob matcher, native anchor sharing, or bounded native upstream delivery exists.
Null filenames and synchronous setup defects can be hidden upstream. Future
readiness/buffering support should prefer a small demonstrated Effect companion
change over a replacement native watcher. No native recursion implementation.

Optional stronger helpers/operations must expose their actual guarantee, not make
a new observation service mandatory. Review topology/root identity strategy,
known-loss/reconcile ordering, capability version evolution and memory-bound
claims with the architecture lead. No Parcel, OpenCode edits, live app/server/
daemon restarts, publishing or pushing are authorized here.
