import { lstat, readlink, readdir, realpath } from "node:fs/promises"
import { glob } from "glob"
import type { Entry, Request } from "./Enumeration.js"
import { localEntry } from "./Local.js"
import { selection } from "./Selection.js"

/** npm owns pattern-dependent symlink traversal; errors cannot become partials. */
export async function nativeGlob(request: Request, signal: AbortSignal): Promise<Array<Entry>> {
  const matcher = selection(request)
  let failure: unknown
  const guarded = async <A>(read: () => Promise<A>): Promise<A> => {
    signal.throwIfAborted()
    try { return await read() }
    catch (error) {
      if (!(error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(String(error.code)))) failure ??= error
      throw error
    }
  }
  const directory = (path: string) => guarded(() => readdir(path, { withFileTypes: true }))
  const names = await glob([...(request.patterns ?? ["**/*"])], {
    cwd: request.root, dot: request.dot ?? false, nocase: request.nocase ?? false, follow: false, signal,
    ignore: {
      ignored: (path) => matcher.excluded(path.relativePosix() || ".", path.isDirectory()),
      childrenIgnored: (path) => matcher.excluded(path.relativePosix() || ".", true)
    },
    fs: { readdir: (path, _, callback) => { directory(path).then((entries) => callback(null, entries), (error) => callback(error)) },
      promises: { readdir: directory, lstat: (path) => guarded(() => lstat(path)), readlink: (path) => guarded(() => readlink(path)), realpath: (path) => guarded(() => realpath(path)) } }
  })
  if (failure) throw failure
  const entries: Array<Entry> = []
  for (const name of names) {
    signal.throwIfAborted()
    const entry = await localEntry(request.root, name, request.metadata ?? false)
    if (matcher.accepts(entry)) entries.push(entry)
  }
  return entries
}
