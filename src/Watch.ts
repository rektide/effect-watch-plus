export * as WatchPlus from "./Watch.js"

import { Effect, FileSystem, Layer, Option, Path, PlatformError, Predicate, Stream } from "effect"

/** Structural contract shared with independent enhanced-watch providers. */
export const TypeId = "~effect-watch/options/v1"

export interface WatchOptions extends FileSystem.WatchOptions {
  /** Literal relative paths; each excludes itself and its descendants. Not globs. */
  readonly ignore?: ReadonlyArray<string> | undefined
  /** Watch an existing file's parent so replacing the file does not detach it. */
  readonly followReplacements?: boolean | undefined
}

export interface EnhancedFileSystem extends FileSystem.FileSystem {
  readonly [TypeId]: true
  readonly watch: (path: string, options?: WatchOptions) => Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError>
}

/** A provider marker is a contract promise, not a security check on arbitrary JS. */
export function supports(fs: FileSystem.FileSystem): fs is EnhancedFileSystem {
  return Predicate.hasProperty(fs, TypeId) && fs[TypeId] === true
}

/** The same filesystem object, checked once and viewed with richer option types. */
export const fileSystem = Effect.flatMap(FileSystem.FileSystem, (fs) => supports(fs)
  ? Effect.succeed(fs)
  : Effect.fail(PlatformError.badArgument({
    module: "WatchPlus", method: "fileSystem", description: "Enhanced watch options are not installed"
  })))

/** Capture an already constructed filesystem. No context lookup occurs in watch. */
export function make(fs: FileSystem.FileSystem, path: Path.Path): EnhancedFileSystem {
  return {
    ...fs,
    [TypeId]: true,
    watch(target, options) {
      if (!options?.ignore && !options?.followReplacements) return fs.watch(target, options)
      return Stream.unwrap(Effect.gen(function*() {
        const excluded = (options.ignore ?? []).map((name) => path.relative(".", name))
        if (options.ignore?.some((name) => path.isAbsolute(name)) || excluded.some((name) => name === "" || name === ".." || name.startsWith(".." + path.sep))) {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "WatchPlus", method: "watch", description: "ignore paths must be nonempty relative paths within the watch directory"
          }))
        }
        const info = yield* fs.stat(target)
        if (options.followReplacements && info.type !== "File") {
          return yield* Effect.fail(PlatformError.badArgument({
            module: "WatchPlus", method: "watch", description: "followReplacements requires an existing file"
          }))
        }
        const directory = path.resolve(info.type === "Directory" ? target : path.dirname(target))
        const source = options.followReplacements
          ? fs.watch(directory, { recursive: false })
          : fs.watch(target, { recursive: options.recursive })
        const check = options.followReplacements
          ? yield* parentGuard(fs, path, directory, target)
          : Effect.void
        const filtered = source.pipe(
          Stream.mapEffect((event) => Effect.as(check, event)),
          Stream.filter((event) => {
            const relative = path.relative(directory, path.resolve(directory, event.path))
            return (!options.followReplacements || relative === path.basename(target)) &&
              !excluded.some((name) => relative === name || relative.startsWith(name + path.sep))
          }),
          Stream.concat(Stream.fail(PlatformError.systemError({
            module: "WatchPlus", method: "watch", _tag: "UnexpectedEof", pathOrDescriptor: target,
            description: "Enhanced watcher ended; reconcile before restarting"
          })))
        )
        return options.followReplacements
          ? filtered.pipe(Stream.mergeEffect(Effect.forever(check.pipe(Effect.delay("100 millis")))))
          : filtered
      }))
    }
  }
}

/** Bounded by lexical path depth; never rearm a watcher across identity loss. */
function parentGuard(fs: FileSystem.FileSystem, path: Path.Path, directory: string, target: string) {
  return Effect.gen(function*() {
    const names: Array<string> = []
    for (let name = directory; ; name = path.dirname(name)) {
      names.push(name)
      if (path.dirname(name) === name) break
    }
    const anchors = yield* Effect.forEach(names, (name) => Effect.gen(function*() {
      const info = yield* fs.stat(name)
      if (info.type !== "Directory" || Option.isNone(info.ino)) {
        return yield* Effect.fail(PlatformError.badArgument({
          module: "WatchPlus", method: "watch", description: "followReplacements requires directory identity information"
        }))
      }
      return { name, dev: info.dev, ino: info.ino.value }
    }))
    return Effect.forEach(anchors, (anchor) => Effect.gen(function*() {
      const info = yield* fs.stat(anchor.name)
      if (info.type !== "Directory" || info.dev !== anchor.dev || Option.isNone(info.ino) || info.ino.value !== anchor.ino) {
        return yield* Effect.fail(PlatformError.systemError({
          module: "WatchPlus", method: "watch", _tag: "UnexpectedEof", pathOrDescriptor: target,
          description: `Watch ancestor identity changed: ${anchor.name}; reconcile before restarting`
        }))
      }
    }), { discard: true })
  })
}

/** Provide the base filesystem and Path to this layer; it replaces only watch. */
export const layer = Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return make(fs, path)
}))
