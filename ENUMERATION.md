---
type: APIReference
title: Native and ripgrep enumeration
description: Additive complete filesystem baselines and optional placement-aware scoped ripgrep enumeration.
resource: /ENUMERATION.md
status: implemented
author: GPT-6.1 Sol xhigh
date: 2026-10-19
sources:
  - resource: "opencode://ses_ead2c9a29fferY0Og3JRINkhz4"
    title: Shared enumeration contract, native/rg implementation, npm compatibility and scoped-process tests
  - resource: /src/Enumeration.ts
    title: Structural contract shared with independent Watchman
  - resource: /src/Glob.ts
    title: Captured ordinary glob and native baseline layer
  - resource: /src/Ripgrep.ts
    title: Placement-aware scoped ripgrep adapter and byte/deadline budgets
  - resource: /test/enumeration.test.ts
    title: Common consumer and real rg/error/budget verification
  - resource: "file:///home/rektide/src/effect-watchman/ENUMERATION.md"
    title: Independent daemon provider and shared selection semantics
  - resource: "file:///home/rektide/src/effect-watchman/design/watch/enumeration-verification0.sol61x.md"
    title: Exact cross-provider Node and private-daemon execution receipt
---

# Native and ripgrep enumeration

Existing `WatchPlus.layer` remains watch-only. Add `Glob.layer` explicitly to obtain
the separate `~effect-watch/enumeration/v1` checked view. Ordinary two-option glob
still delegates to the captured base filesystem; richer options use the explicit
native provider. There is no global Effect option augmentation.

```ts
import { NodeFileSystem } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { Glob } from "effect-watch-plus"

const filesystem = Glob.layer.pipe(Layer.provide(NodeFileSystem.layer))
const program = Effect.gen(function*() {
  const fs = yield* Glob.fileSystem
  return yield* fs.enumerate({
    root: "/work/project", patterns: ["**/*.{ts,tsx}"],
    exclude: ["node_modules"], kind: "files", dot: true, symlinks: "follow"
  })
}).pipe(Effect.provide(filesystem))
```

`Glob.nativeBackend()` directly supplies the structural Backend. `Glob.make(fs,
backend, cwd)` decorates a captured filesystem with enumerate and richer glob;
it never looks up its own replaced service. All native baselines are complete
scanned baselines, not checkpoints or atomic filesystem snapshots. The native
adapter is explicitly **local Node filesystem** enumeration, not an implicit
implementation for arbitrary remote FileSystems.

## Shared request

An absolute root is required for enumerate. Missing/non-directory roots return a
complete empty scanned baseline by preflight. Names are slash-separated relative
lexical paths, with `.` for the selected root. Patterns support minimatch 10 /
npm glob 13 braces, classes, extglobs, globstar and escapes. Leading !/# are literal.
Excludes match whole relative paths and prune matching directories. Absolute and
parent-segment patterns are unsupported. No implicit watch ignores enter enumeration.

Defaults: patterns `["**/*"]`, kind `all`, dot/nocase/metadata false, policy `literal`,
coverage `filesystem`, symlinks `literal`. The richer **glob method** defaults to
symlinks `glob`; the native layer's ordinary delegated glob remains the base's
original dialect. Ordering is sorted/deduplicated for enumerate.

- `kind:"files"`: regular files and links to regular files.
- `kind:"directories"`: directories and links to directories.
- `kind:"non-directories"`: retain broken links and special entries, exclude real
  directories and links to directories. This is often the discovery nodir view.
- `kind:"all"`: include all lexical entries.
- `symlinks:"literal"`: do not traverse directory links.
- `symlinks:"glob"`: use npm's own default traversal, including literal symlink
  prefixes; this is not the same as never traversing a link.
- `symlinks:"follow"`: recursively traverse directory links, stopping ancestor
  identity cycles without suppressing independent aliases.
- `metadata:true`: lexical size/mtimeMs, not full Effect File.Info.

Native literal/follow traversal uses Dirents: names-only enumeration does not
stat every regular file. Symlink classification and requested metadata use lstat /
stat. The npm-compatibility mode uses the real npm engine and enriches selected
entries. Permission/budget errors are not successful partial inventories.
Native rejects gitignore policy and daemon coverage explicitly.

## Scoped ripgrep adapter

```ts
import { Effect } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { Glob, Ripgrep } from "effect-watch-plus"

const program = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const backend = Ripgrep.make({ executable: "/usr/bin/rg", spawner, inspect: Glob.inspect })
  return yield* backend.enumerate({ root: "/work/project", kind: "files", dot: true })
})
```

The caller owns executable selection and the scoped Effect spawner. No downloader,
environment singleton, OpenCode dependency, binary installation or local spawn is
hidden in this adapter. **inspect must share the spawner's filesystem placement.**
`Glob.inspect` is a convenience for a local spawner only; hosted callers supply a
placement-aware lexical inspector. It returns Entry with target classification
and requested metadata. Inspection is currently per rg candidate (with cached
parent inspection); unlike Watchman names, rg names have no lexical type metadata.

The adapter is explicitly file-only: requests require `kind:"files"`; it cannot
enumerate empty directories, broken links or special entries as a complete
non-directory/all-entry inventory. Compose a native provider explicitly for those
operations. `symlinks:"glob"` is rejected because rg cannot reproduce npm's
pattern-dependent traversal. Literal and follow file profiles work. Rg runs with
--follow to retain file symlinks; literal mode filters linked-directory descendants
using the placement-aware inspector. Consequently rg traversal errors from broken
links or cycles fail even a literal request. This limitation is explicit, not an
excuse to reinterpret exit code 2 as success.

`policy:"literal"` uses --no-ignore. `policy:"gitignore"` explicitly retains rg's
ignore filters. Hidden candidates are enumerated in both profiles; the shared
residual matcher owns dot/pattern semantics, including explicitly dotted names.
No positive rg glob can accidentally override ignore filters. Output is NUL framed,
so newline/space filenames are not split or truncated. Invalid UTF-8, malformed
framing, escaping names, exit errors and exceeded budgets fail the whole baseline.

Defaults: maxOutputBytes 32 MiB, maxStderrBytes 64 KiB, timeoutMs 60s. Stream output,
stderr and exit are consumed concurrently. The child is scope-owned and released
on cancellation, failure or completion; no separate global child process survives.
There is no runtime-error fallback to another provider and no successful truncation.

The same [consumer](test/consumer.ts) runs against native, rg and independent
Watchman. Real-rg tests cover dotfiles, braces, excludes, followed aliases, special
filenames and explicit ignore policy; subprocess peers cover exit 2, byte limits,
bad framing, path escape and deadlines. Followed links and native npm mode are
covered separately. Baseline-to-watch continuity remains outside this slice.

The independent Watchman [verification receipt](file:///home/rektide/src/effect-watchman/design/watch/enumeration-verification0.sol61x.md)
records exact source revisions and the actual Node v26 common-consumer run across
all three providers; this is execution evidence, not a new runtime dependency.
