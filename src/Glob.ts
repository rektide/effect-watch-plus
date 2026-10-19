export * as Glob from "./Glob.js"
export * from "./Enumeration.js"

import { isAbsolute } from "node:path"
import { Effect, FileSystem, Layer, PlatformError } from "effect"
import { make, type Backend, type Entry } from "./Enumeration.js"
import { localEntry, walk } from "./Local.js"
import { selection } from "./Selection.js"

export const failure = (cause: unknown) => PlatformError.systemError({ module: "Glob", method: "enumerate", _tag: "Unknown", description: String(cause), cause })
export const badArgument = (description: string) => PlatformError.badArgument({ module: "Glob", method: "enumerate", description })

/** Explicit local-node inspector; pass it to rg only for a local spawner. */
export const inspect = (root: string, name: string, metadata: boolean): Effect.Effect<Entry, PlatformError.PlatformError> => Effect.tryPromise({
  try: () => localEntry(root, name, metadata), catch: failure
})

/** Exact lexical types, dotfiles and optional symlink traversal; no new watcher. */
export function nativeBackend(): Backend {
  return { enumerate: (request) => Effect.gen(function*() {
    if (!isAbsolute(request.root)) return yield* Effect.fail(badArgument("enumerate requires an absolute root"))
    if (request.policy === "gitignore" || request.coverage === "daemon") return yield* Effect.fail(badArgument("Native enumeration supports literal filesystem coverage only"))
    const matcher = yield* Effect.try({ try: () => selection(request), catch: (cause) => badArgument(String(cause)) })
    const present = yield* Effect.tryPromise({ try: () => localEntry(request.root, ".", false).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return false
      throw error
    }), catch: failure })
    if (!present) return { complete: true as const, kind: "scanned" as const, source: "native" as const, coverage: "filesystem" as const, entries: [] }
    const entries = yield* Effect.tryPromise({ try: async (signal) => {
      if (request.symlinks !== "glob") return walk(request, ["."], signal)
      const { nativeGlob } = await import("./GlobNative.js")
      return nativeGlob(request, signal)
    }, catch: failure })
    return {
      complete: true as const, kind: "scanned" as const, source: "native" as const, coverage: "filesystem" as const,
      entries: entries.filter(matcher.accepts).sort((a, b) => a.path.localeCompare(b.path, "en"))
    }
  }) }
}

/** Explicit native baseline layer; ordinary two-option glob stays captured. */
export const layer = Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const enhanced = make(fs, nativeBackend(), () => process.cwd())
  return {
    ...enhanced,
    glob: (pattern: string, options?: Parameters<typeof enhanced.glob>[1]) => options && Object.keys(options).some((key) => key !== "root" && key !== "exclude")
      ? enhanced.glob(pattern, options)
      : fs.glob(pattern, options)
  }
}))
