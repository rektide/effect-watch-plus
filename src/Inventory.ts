import type { Effect, Scope, Stream, PlatformError } from "effect"
import type { Entry } from "./Enumeration.js"

/** Structural, backend-neutral source contract. No disk supplementation or link following. */
export const TypeId = "~effect-watch/inventory/v1"

export type LexicalEntry = Omit<Entry, "targetType">
export type SourceError = PlatformError.PlatformError
export interface InventoryBudgets {
  readonly maxQueuedRows?: number | undefined
  readonly maxQueuedBytes?: number | undefined
  readonly maxBaselineBytes?: number | undefined
  readonly maxPairAttempts?: number | undefined
  readonly pairRetryMs?: number | undefined
}
export interface InventoryProfile {
  /** Absolute approved directory; daemon coverage, all lexical kinds, dotfiles, metadata, no follow. */
  readonly root: string
  readonly budgets?: InventoryBudgets | undefined
}
export type InventoryChange =
  | { readonly type: "present"; readonly entry: LexicalEntry }
  | { readonly type: "removed"; readonly path: string }
export type InventoryEvent =
  | { readonly type: "invalidated"; readonly epoch: number; readonly reason: string }
  | { readonly type: "baseline"; readonly epoch: number; readonly entries: ReadonlyArray<LexicalEntry> }
  | { readonly type: "changes"; readonly epoch: number; readonly sequence: number; readonly changes: ReadonlyArray<InventoryChange> }
export interface SourceState {
  readonly state: "acquiring" | "active" | "repairing" | "failed" | "closed"
  readonly epoch: number
  readonly reason?: string | undefined
}
export interface ObservedInventory {
  /** One consumer per view. Queued preceding-epoch events are cleared on invalidation. */
  readonly events: Stream.Stream<InventoryEvent, SourceError>
  readonly state: Effect.Effect<SourceState>
  /** Requests asynchronous replacement; completion means requested, not ready. Terminal views cannot restart. */
  readonly rebaseline: (reason: string) => Effect.Effect<void, SourceError>
}
export interface InventorySource {
  readonly open: (profile: InventoryProfile) => Effect.Effect<ObservedInventory, SourceError, Scope.Scope>
}
export interface Capability {
  readonly [TypeId]: InventorySource
}
export function supports(value: object): value is Capability {
  return TypeId in value
}
