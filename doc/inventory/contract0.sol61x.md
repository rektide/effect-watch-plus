---
type: ImplementationReceipt
title: Observed lexical inventory contract — Gate A
description: Backend-neutral, scoped source contract for one daemon-owned baseline and epoch-tagged changes.
resource: /doc/inventory/contract0.sol61x.md
status: implemented and locally checked
author: GPT-6.1 Sol xhigh
model: openai/gpt-6.1-sol#xhigh
date: 2026-10-27
sources:
  - resource: "opencode://ses_e84c4d1f6ffeiIscq0sLlVo9iS"
    title: Implement the accepted Gate A structural contract and coordinate its Watchman implementation
  - resource: "file:///home/rektide/src/opencode-watch-rebuild/design/filesystem-watch/source-owned-design0.glm53m.md"
    title: Accepted source-owned design, source semantics and budgets
  - resource: /src/Inventory.ts
    title: Public contract and capability discovery
  - resource: /src/Enumeration.ts
    title: Existing lexical entry vocabulary reused by the source contract
---

# Observed lexical inventory contract

`effect-watch-plus/inventory` exports a structural contract without a backend,
FFF, or host dependency. Effect imports are type-only. Capability discovery uses
`TypeId = "~effect-watch/inventory/v1"` and `supports(object)`; the property value
is an `InventorySource`.

- `open({ root, budgets? })` returns a scope-owned `ObservedInventory` immediately.
  Acquisition proceeds asynchronously. The fixed profile is daemon coverage,
  all lexical kinds and dotfiles, metadata, and no link following or local
  supplementation. There is deliberately no configurable selection dialect here.
- `events` has one consumer per view: `baseline`, `changes`, `invalidated`.
  Every event carries its view epoch; changes additionally carry a local sequence.
  Invalidation clears undelivered prior-epoch events. Already delivered work
  remains the consumer's responsibility to reject by epoch.
- `state` reports acquiring/active/repairing/failed/closed, epoch and optional
  reason. `rebaseline(reason)` requests replacement; it does not await readiness.
  A terminal view must be reacquired, not restarted.
- `SourceError` is Effect's `PlatformError`; `LexicalEntry` reuses enumeration's
  path/kind/optional size/mtime vocabulary without target classification.
- Per-open budgets name queued rows/bytes, baseline bytes, pairing attempts and
  retry pacing. The implementing backend owns defaults and validates them.

Watchman implementation and usage:
[Gate A receipt](file:///home/rektide/src/effect-watchman/doc/inventory/observed-source0.sol61x.md).
This contract does not promise portable clocks, durable replay, multiple stream
consumers, or synchronous freshness with disk.

Checks: `bun run build`, `bun run typecheck`, `bun test ./test` (28 passed).
