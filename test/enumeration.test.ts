import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { Glob, Ripgrep } from "../effect-watch-plus.js"
import { populate } from "./enumeration-cases.js"

test("native and real scoped ripgrep implement the same complete file consumer", async () => {
  const scratch = await mkdtemp("/tmp/opencode/plus-enumeration-")
  const root = join(scratch, "root")
  await populate(root, join(scratch, "outside"))
  // rg --follow reports broken links as traversal errors, not a partial success.
  // The separate error test verifies code 2 remains a failure.
  await rm(join(root, "broken"))
  await writeFile(join(root, ".gitignore"), "ignored/\n")
  try {
    await Effect.runPromise(Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const native = Glob.nativeBackend()
      const rg = Ripgrep.make({ executable: "rg", spawner, inspect: Glob.inspect })
      for (const request of [
        { root, kind: "files" as const, patterns: ["**/*.{ts,js}"] },
        { root, kind: "files" as const, patterns: ["**/*.ts"], symlinks: "follow" as const, dot: true },
        { root, kind: "files" as const, patterns: ["**/*"], exclude: ["src", "alias/**", ".git/**"], dot: true }
      ]) {
        const expected = yield* native.enumerate(request)
        const actual = yield* rg.enumerate(request)
        expect(actual.entries).toEqual(expected.entries)
        expect(actual.kind).toBe("scanned")
        expect(actual.complete).toBe(true)
      }
      const unsupported = yield* rg.enumerate({ root }).pipe(Effect.result)
      expect(unsupported._tag).toBe("Failure")
      const ignored = yield* rg.enumerate({ root, kind: "files", policy: "gitignore", patterns: ["**/*.ts"] })
      expect(ignored.entries.some((entry) => entry.path.startsWith("ignored/"))).toBe(false)
      const literal = yield* native.enumerate({ root, kind: "files", patterns: ["**/*.ts"] })
      expect(literal.entries.some((entry) => entry.path === "ignored/inside.ts")).toBe(true)
      const fs = yield* FileSystem.FileSystem
      const decorated = Glob.make(fs, native, () => root)
      expect(Glob.supports(decorated)).toBe(true)
      expect(yield* decorated.glob("src/*.ts")).toEqual(["src/a.ts"])
      const metadata = yield* native.enumerate({ root, patterns: ["root.ts"], metadata: true })
      expect(metadata.entries[0]?.size).toBeGreaterThan(0)
      yield* Effect.promise(() => symlink(".", join(root, "cycle")))
      const cycled = yield* native.enumerate({ root, patterns: ["**/*.ts"], symlinks: "follow", kind: "files" })
      expect(cycled.entries.some((entry) => entry.path.startsWith("cycle/"))).toBe(false)
    }).pipe(Effect.provide(NodeServices.layer)))
  } finally { await rm(scratch, { recursive: true, force: true }) }
})

test("ripgrep errors, output budgets, invalid framing and deadline never return partial baselines", async () => {
  const root = await mkdtemp("/tmp/opencode/rg-budget-")
  const executable = join(root, "peer")
  try {
    for (const script of [
      'process.stdout.write("ok.ts\\0"); process.stderr.write("permission denied"); process.exitCode=2',
      'process.stdout.write("x".repeat(100))',
      'process.stdout.write("not-terminated")',
      'process.stdout.write("../escape\\0")',
      'setInterval(()=>{},1000)'
    ]) {
      await writeFile(executable, `#!${process.execPath}\n${script}\n`)
      await chmod(executable, 0o755)
      const result = await Effect.runPromise(Effect.gen(function*() {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
        return yield* Ripgrep.make({ executable, spawner, inspect: Glob.inspect, maxOutputBytes: 32, timeoutMs: 500 })
          .enumerate({ root, kind: "files" }).pipe(Effect.result)
      }).pipe(Effect.provide(NodeServices.layer)))
      expect(result._tag).toBe("Failure")
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}, 10_000)
