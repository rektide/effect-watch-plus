export * as Ripgrep from "./Ripgrep.js"

import { isAbsolute } from "node:path"
import { Effect, PlatformError, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import type { Backend, Entry } from "./Enumeration.js"
import { badArgument, failure } from "./Glob.js"
import { safeName, selection } from "./Selection.js"

export interface Options {
  readonly executable: string
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]
  /** Placement-aware lexical inspector. Use Glob.inspect only with local rg. */
  readonly inspect: (root: string, name: string, metadata: boolean) => Effect.Effect<Entry, PlatformError.PlatformError>
  readonly maxOutputBytes?: number | undefined
  readonly maxStderrBytes?: number | undefined
  readonly timeoutMs?: number | undefined
}

/** File-only baseline. NUL framing, scoped process lifetime, no partial success. */
export function make(options: Options): Backend {
  return { enumerate: (request) => Effect.scoped(Effect.gen(function*() {
    if (!isAbsolute(request.root) || request.kind !== "files" || request.coverage === "daemon") {
      return yield* Effect.fail(badArgument("Ripgrep requires an absolute root, explicit kind: files, and filesystem coverage"))
    }
    if (!options.executable || [options.maxOutputBytes ?? 32 * 1024 * 1024, options.maxStderrBytes ?? 64 * 1024, options.timeoutMs ?? 60_000].some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      return yield* Effect.fail(badArgument("Ripgrep executable and positive finite integer budgets are required"))
    }
    const matcher = yield* Effect.try({ try: () => selection(request), catch: (cause) => badArgument(String(cause)) })
    // Always enumerate hidden candidates: explicit .foo patterns can match them
    // even with dot:false. Residual matching owns dot/glob semantics. No positive
    // rg globs override ignore policy. Follow lets us retain file symlinks too.
    const handle = yield* options.spawner.spawn(ChildProcess.make(options.executable, [
      "--files", "--null", "--hidden", "--follow", "--no-config",
      ...(request.policy === "gitignore" ? [] : ["--no-ignore"]), "."
    ], { cwd: request.root, stdin: "ignore", stdout: "pipe", stderr: "pipe" }))
    const collect = (stream: typeof handle.stdout, limit: number) => Effect.gen(function*() {
      const chunks: Array<Uint8Array> = []
      let length = 0
      yield* stream.pipe(Stream.runForEach((chunk) => {
        length += chunk.byteLength
        if (length > limit) return Effect.fail(failure("Ripgrep output-byte budget exceeded"))
        chunks.push(chunk)
        return Effect.void
      }))
      return Buffer.concat(chunks)
    })
    const output = yield* Effect.all({
      stdout: collect(handle.stdout, options.maxOutputBytes ?? 32 * 1024 * 1024),
      stderr: collect(handle.stderr, options.maxStderrBytes ?? 64 * 1024), code: handle.exitCode
    }, { concurrency: "unbounded" })
    if (output.code !== 0 && output.code !== 1) return yield* Effect.fail(failure(`Ripgrep exited ${output.code}: ${new TextDecoder().decode(output.stderr)}`))
    const names = yield* Effect.try({ try: () => {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(output.stdout)
      if (text && !text.endsWith("\0")) throw new Error("Ripgrep returned an unterminated pathname")
      return [...new Set(text.split("\0").filter(Boolean).map((name) => safeName(name.replace(/^\.\//, ""))))]
    }, catch: failure })
    const inspected = new Map<string, Entry>()
    const get = (name: string) => Effect.gen(function*() {
      const cached = inspected.get(name)
      if (cached) return cached
      const entry = yield* options.inspect(request.root, name, request.metadata ?? false)
      inspected.set(name, entry)
      return entry
    })
    const entries: Array<Entry> = []
    for (const name of names) {
      const entry = yield* get(name)
      if (!matcher.accepts(entry)) continue
      if (request.symlinks !== "follow") {
        const parts = name.split("/")
        const parents = yield* Effect.forEach(parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/")), get)
        if (parents.some((entry) => entry.type === "SymbolicLink")) continue
      }
      entries.push(entry)
    }
    return {
      complete: true as const, kind: "scanned" as const, source: "ripgrep" as const, coverage: "filesystem" as const,
      entries: entries.sort((a, b) => a.path.localeCompare(b.path, "en"))
    }
  })).pipe(Effect.timeoutOrElse({ duration: options.timeoutMs ?? 60_000, orElse: () => Effect.fail(failure("Ripgrep enumeration deadline exceeded")) })) }
}
