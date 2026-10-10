export * as WatchPlus from "./Watch.js"

import { Effect, FileSystem, Layer, Option, Path, PlatformError, Predicate, Queue, Stream } from "effect"

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

/**
 * Caller-owned authoritative reads, initially and after coalesced dirtiness.
 * A hint received during a read leaves a pending rerun. Reads are serialized
 * and backpressured; Effect's merge may read one ahead. No native-ready guarantee.
 * Read/watch errors propagate; watch completion fails rather than hanging stale.
 * Applying Stream.retry reopens replayable sources with another initial read;
 * terminal provider owners must be rebuilt by the caller.
 */
export function reconcile<A, E, R, EW, RW>(
  dirtiness: Stream.Stream<unknown, EW, RW>,
  read: Effect.Effect<A, E, R>
): Stream.Stream<A, E | EW | PlatformError.PlatformError, R | RW> {
  return Stream.unwrap(Effect.gen(function*() {
    // A dirty bit, not an event backlog. Hints during reads never get cleared by
    // finishing that read: only starting the next read consumes the token.
    const dirty = yield* Queue.make<void>({ capacity: 1, strategy: "sliding" })
    yield* Queue.offer(dirty, undefined)
    return Stream.fromEffectRepeat(Queue.take(dirty).pipe(Effect.andThen(read))).pipe(
      Stream.mergeEffect(dirtiness.pipe(
        Stream.runForEach(() => Queue.offer(dirty, undefined)),
        Effect.andThen(Effect.fail(PlatformError.systemError({
          module: "WatchPlus", method: "reconcile", _tag: "UnexpectedEof",
          description: "Dirtiness stream ended; reconcile before restarting"
        })))
      ))
    )
  }))
}

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
          ? yield* parentGuard(fs, directory, target)
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

/** Stat the lexical anchor path: ancestor changes matter if it no longer resolves to the watched parent. */
function parentGuard(fs: FileSystem.FileSystem, directory: string, target: string) {
  return Effect.gen(function*() {
    const anchor = yield* fs.stat(directory)
    if (anchor.type !== "Directory" || Option.isNone(anchor.ino)) {
      return yield* Effect.fail(PlatformError.badArgument({
        module: "WatchPlus", method: "watch", description: "followReplacements requires directory identity information"
      }))
    }
    const ino = anchor.ino.value
    return Effect.gen(function*() {
      const info = yield* fs.stat(directory)
      if (info.type !== "Directory" || info.dev !== anchor.dev || Option.isNone(info.ino) || info.ino.value !== ino) {
        return yield* Effect.fail(PlatformError.systemError({
          module: "WatchPlus", method: "watch", _tag: "UnexpectedEof", pathOrDescriptor: target,
          description: `Watch parent anchor identity changed: ${directory}; reconcile before restarting`
        }))
      }
    })
  })
}

/** Provide the base filesystem and Path to this layer; it replaces only watch. */
export const layer = Layer.effect(FileSystem.FileSystem, Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return make(fs, path)
}))
