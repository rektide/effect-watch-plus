# Watch Plus / Watchman composition contract

Proposed implementation contract, 2026-10-10. Owner: `effect-watch-plus`.
Prepared by GPT-6 Astra with independent Sol-medium source/design investigations
`ses_ed7f6ce6fffeqBoXpACAUJbt20` (native/Plus) and
`ses_ed7f6ce67ffeCV306SgxMXCWvj` (Watchman/enrichment).

This is a build brief, not an implemented or released API. Names in sketches
can be adjusted during implementation; ownership and guarantees are deliberate.

## Decision

Build **a scoped Effect observation service with a pluggable source**. The
default source consumes Effect's existing `FileSystem.watch`. Do not wrap or
replace `FileSystem` inside Watch Plus, and do not rebuild native recursion.

`effect-watchman` provides a normal Effect `WatchBackend` and its own stronger
Watchman observation API. An optional `effect-watch-plus/watchman` adapter uses
those stronger operations. Consumers get a stable high-level interface; source
capabilities improve its implementation without being mandatory for native use.

```text
effect-watch-plus/core ──────────────→ Effect
    native source ──────────────────→ supplied Effect FileSystem.watch
effect-watch-plus/watchman ──────────→ effect-watch-plus/core
                         └──────────→ effect-watchman
effect-watchman ─────────────────────→ Effect / runtime transport
    standard WatchBackend + enhanced observations share one manager
```

Watchman does not import Watch Plus, even for types. Plus owns the generic
provider interface and the translation. `effect-watchman` is an optional peer
for the adapter export, never an eagerly imported dependency of Plus's native
entrypoint. Use one Effect peer identity. No contract-only third package and no
Parcel dependency are necessary.

## Why a service rather than a backend decorator?

Effect 4.0.1's backend implements:

```text
register(path, stat, options?) → Option<Stream<WatchEvent, PlatformError>>
```

The Node filesystem calls `stat` first, invokes `register` if a backend was
provided when its Layer was constructed, and falls back to its own native code
when the answer is `None`. Native behavior therefore is not itself a backend
value that a generic decorator can simply delegate to. The interface also
cannot carry per-request ignores, readiness strength or reconciliation notices.

Plus captures an already-constructed filesystem and exposes its own service.
It never replaces that filesystem, avoiding a `fs.watch → Plus → fs.watch`
cycle. The Watchman adapter talks directly to the shared Watchman manager. Its
standard Effect backend uses the same manager rather than a second resource pool.

At host composition:

- **native:** construct Effect's filesystem without a Watchman backend; build
  Plus from that filesystem;
- **watchman:** construct one Watchman manager; provide its backend while
  building the Effect filesystem if ordinary `fs.watch` users need it, and
  provide its enhanced source to Plus;
- never call a filesystem that was already configured with Watchman a forced
  native provider merely because the Plus adapter is named `fromFileSystem`.

No mutation of global services or monkey-patching of `FileSystem.watch`.

## Public concepts

### Interest

A request declares an absolute **lexical** target and one of:

- exact file;
- direct directory entries, optionally selected names;
- directory tree using existing `recursive: true` support.

It may include a documented ignore policy and coalescing options. File existence
is not required at request time. Keep target identity distinct from the current
native watch anchor and the daemon's canonical root. A lexical symlink alias can
be followed/re-resolved deliberately without promising recursive symlink traversal.

Do not inherit Parcel's ignore language by accident. Start with literal subtree
exclusions and a documented pathname-glob matcher. Specify dotfiles, separators,
case handling, absolute/relative ignores and subtree boundaries. Arbitrary
application predicates remain local. Git-ignore semantics are a separate concern.

### Scoped observation

Conceptual consumer shape:

```text
WatchPlus.open(interest): Effect<Observation, WatchError, Scope>

Observation:
  ready: Effect<Readiness, WatchError>
  notices: Stream<Notice, WatchError>
```

Acquisition starts the owned observation task and creates its delivery buffer;
consumption must not be necessary to start the underlying observation. Scope
owns both immediately, including partial acquisition and any background fibers.
One returned handle has one documented stream-consumption lifetime. Sharing
occurs through multiple handles, not accidental concurrent consumption of the
same queue. Releasing one handle leaves sibling consumers alive.

`ready` answers initial startup **quality**, not universal filesystem freshness:

- `best-effort`: the native observation task has started; no registration
  acknowledgement is available from the supplied Effect stream;
- `acknowledged`: the provider confirms subscription installation;
- a provider's separately offered aligned inventory operation may additionally
  bind a baseline to subsequent deltas.

Initial caller reconciliation finishing is another fact. Do not describe
`best-effort` as an OS registration barrier, or `acknowledged` as a content
snapshot. An initial readiness Effect completes once; ongoing loss/recovery is
represented in the ordered notices/error behavior, not by reusing that Effect.

### Notices and reconciliation

First-cut notices are small:

```text
Hint { path: absolute lexical path, scope: path | subtree }
Resync { root: affected scope, reason }
```

They describe a need to re-examine state, not an exact journal. A provider may
retain richer internal metadata, but consumers need not understand native event
names or Watchman clocks. Precise create/delete classification is only exposed
by an inventory-owning operation that can support it.

Most edits, creates/deletes, atomic saves and uncertain rename classifications
are ordinary hints. Coalesce them into affected paths/subtrees. A normal atomic
save under a continuously observed parent does not require a whole-root rescan.

`Resync` is necessary when the set of received hints may be incomplete: failed
or unexpectedly completed watcher, reacquired/detached anchor, known queue loss,
Watchman fresh history or a gap that cannot be caught up. Example: a file is
deleted while disconnected; reconnection enumerates only current files. Without
reconciliation, a cached entry for the deleted file can survive indefinitely.

Plus owns handling that situation generically. A helper accepts the caller's
authoritative read/scan and publishes its result after initial load, relevant
hints or resync. It serializes/coalesces reloads and reruns if more dirtiness
arrived during a read. It may offer path/subtree targeting. It does not invent
an application cache or require an inventory scan on every event. Small config
owners can reload their whole domain; GUI owners can reread only loaded state.

After known loss, the notice cannot be dropped or overtaken by a claim that
the consumer is fresh. Provider startup/reconnect is separate from completing
the owner's reload. Fail terminal configuration errors explicitly. Duplicate
hints are acceptable; silent continuity loss is not acceptable when detected.

### Provider ownership and enhanced operations

Plus owns a small provider interface whose mandatory operation opens an
observation with the semantics above. NativeProvider is implemented in Plus.
The optional Watchman adapter implements it using Watchman's own observation
API. A provider owns transport acquisition, continuity and its recovery loop;
Plus owns consumer filtering/coalescing/reconciliation. Do not put a second
independent retry supervisor around an already self-recovering provider.

Optional operations replace an entire coherent activity. The first useful
extension is `openInventory`: baseline metadata plus an ordered delta stream,
all from the same interest, generation, mapping and filter contract. A provider
offers it only for a declared inventory model; a generic scan/diff implementation
can later polyfill it for native users who actually need inventory ownership.
The first native slice only needs caller-owned read/scan reconciliation.

Do not create independently pluggable `snapshot`, `clock` and `watch` functions
that callers combine without a shared boundary. Do not allow a daemon names-only
inventory to silently replace a content-hash or arbitrary stat-based snapshot.
Supported metadata and freshness meanings belong to that operation's contract.

Watchman can also supply:

- acknowledged attach and clock-covered setup;
- canonical root/transport sharing;
- catch-up within a still-valid history window;
- compatible pathname filter pushdown;
- efficient daemon-view inventories.

Prefer actual optional operations and returned guarantee metadata over a bag of
capability booleans that advertise methods which cannot fulfil a given request.

## Native source: concrete capabilities and limits

The pinned Effect 4.0.1 API passes recursive options to native watching. Use it.
The inspected Node implementation also:

- consumes lazily, with `stat` before listener setup;
- exposes no listener-installed acknowledgement;
- emits callback-relative names, resolving file callbacks relative to the
  file's parent for classification;
- drops null filenames before callers can see them;
- classifies rename via asynchronous stat, treating any stat failure as remove;
- ends its stream on watcher close and fails on watcher error;
- closes acquired watchers when their scope ends.

Therefore raw events are hints and may reorder. Plus must normalize against
the **actual anchor**, not blindly append a name to the requested target.

Required generic behavior:

1. Watch a file's parent and filter its basename, surviving atomic inode replacement.
2. Observe an existing ancestor when the target/parents are missing; use native
   recursion for deeper missing paths and reconcile/reanchor as topology changes.
3. For a directory root, retain an ancestor/lifecycle interest or an appropriate
   ancestor anchor. Detect identity replacement and rearm detached watches.
4. Keep lifecycle detection outside subscriber ignore filtering. Ignoring an
   event must not prevent the watcher from noticing its own root disappeared.
5. Share identical physical anchor watches within one Layer via scoped leases.
   Apply logical subscriber filtering afterward. Overlapping-root consolidation
   is optional later work.
6. Provide bounded native retry after failures/unexpected completion, plus
   caller-controlled periodic authoritative reconciliation where needed.

A bounded topology check is reasonable for missing/replaced anchors. It does
not repair missed descendants. Native callback loss discarded upstream cannot
be detected immediately by Plus. Periodic reconciliation or a fresh read on use
can repair current state; neither creates an event-completeness guarantee.
Do not secretly turn every recursive watch into a repeated full-tree traversal.

No mandatory Effect fork is required for this first cut. A future generic
readiness/null-notification improvement can strengthen native guarantees; record
it as companion work rather than pretending it is already present.

## Watchman enrichment rules

`effect-watchman` remains useful independently: Effect `WatchBackend` plus its
own typed acquired observations/queries. The adapter is in Plus so Watchman
has no dependency on the high-level policy package.

For aligned inventories, one valid approach is a synchronized daemon query
returning baseline and clock C, followed by subscribe-since C with the same
relative root and compatible filter. Buffer pushes immediately, publish baseline
before deltas, and treat fresh-instance responses as invalidation, not a valid
incremental result. Never wait for a first nonempty files push to establish
readiness: empty nonfresh results may be suppressed; use acknowledgement.

Catch-up returns changed final states/tombstones while history remains valid,
not every intervening operation. A clock can become stale through tombstone GC.
Bind opaque checkpoints to controller/endpoint, canonical root generation,
relative root, mapping, recursion, filter and inventory model. A root-global
latest received clock is not every consumer's applied position. No durable
portable checkpoint format is needed initially.

Safe first pushdown: pathname-stable exact paths, prefixes/depth and literal
subtree ignores. For unproven globs or arbitrary predicates, request a
conservative superset and keep residual local filtering. Test dotfile/case rules.
Never filter deletion tombstones with an `exists` predicate in a delta feed.
State-dependent filters can hide membership exits and need extra tracking.

Query-expression pushdown generally reduces result transport/work, not the
daemon's kernel watches/crawl. Daemon `ignore_dirs`/`ignore_vcs` can already hide
data; report effective coverage and reject/qualify incompatible requests. Do not
rewrite the user's root configuration to achieve the application policy.

## Backpressure, ownership and baseline escape hatch

Bound pending path sets/queues. Coalescing can collapse repeated hints. Once a
consumer has lost deltas, latch resync/failure so it cannot lose the only repair
signal. Slow consumers must not block unrelated roots. No publishing after
release; interrupt and join owned work with bounded cleanup.

Plain Effect `WatchEvent` has no resync signal. The standard Watchman backend
therefore fails on known lost continuity (and may initially fail on all transport
interruptions). Its enhanced observation can use catch-up/resync. Both exports
must use the same manager; the stronger path must not be implemented by trying
to reconstruct stripped metadata from plain `fs.watch` events.

Host force-native and force-Watchman choose complete provider compositions.
Forced native bypasses Watchman configuration/acquisition. Forced Watchman fails
explicitly on configuration/capability problems and never silently returns
`None` to fall back to native. Library code takes options; OpenCode reads env.

## Required first-cut acceptance

- Same high-level consumer example runs on native and enhanced Watchman sources.
- Native file atomic replacement continues delivering subsequent edits.
- Missing targets/root replacement have tested reanchor behavior and documented limits.
- Identical consumers share native anchors; Watchman shares canonical roots.
- Ignores preserve internal topology observation; optimized filters retain deletions.
- Startup quality is truthful; no sleep/yield is called an acquisition barrier.
- Known loss results in resync/error, not quiet stale state; empty Watchman
  catch-up does not hang readiness.
- Scope closure, cancellation during acquisition, sibling release and slow
  consumers cannot leak sockets/fibers or silently discard necessary repair.

Optional after the first useful slice: generic maintained inventories, content
fingerprints, durable cursors, overlapping native-root consolidation, recursive
symlink traversal, universal Promise facade and additional backends. No Parcel
work or API compatibility is required to establish this contract.
