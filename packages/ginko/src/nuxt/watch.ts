import { createHash } from 'node:crypto'
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'

const CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs']
const CONFIG_NAMES = new Set(CONFIG_EXTENSIONS.map((ext) => `ginko.config.${ext}`))

/**
 * The site's `ginko.config.*` files, as absolute paths. `nuxt.config.ts` imports the config, but Nuxt restarts
 * `nuxt dev` only when `nuxt.config` itself changes: adding these to `nuxt.options.watch` restarts it for them too
 * (without it, a new language or page path does nothing until the dev server is restarted by hand).
 */
export function configFilesToWatch(rootDir: string): string[] {
  return CONFIG_EXTENSIONS.map((ext) => join(rootDir, `ginko.config.${ext}`)).filter(existsSync)
}

/** The part of a Nuxt instance the fallback watcher needs. */
interface Lifecycle {
  hook(name: 'ready' | 'close', fn: () => void): unknown
}

/** Process-wide: survives the Nuxt instance that failed to load. Lost with a restarted fork, which is fine. */
interface ConfigWatch {
  up: boolean
  watcher?: FSWatcher
}

declare global {
  var __ginkoConfigWatch: ConfigWatch | undefined
}

/**
 * Dev only. The restart through `nuxt.options.watch` (configFilesToWatch) works only while a Nuxt instance runs. After a
 * save that breaks the config, the next load fails, @nuxt/cli serves the error and watches only nuxt.config.*, so the
 * fixed save reached nobody until a manual restart. This watcher marks an instance up when it is ready and down when it
 * closes; a changed ginko.config.* while no instance is up (the last load failed) calls `restart`. While healthy it does
 * nothing: Nuxt restarts in place. Remove it when @nuxt/cli keeps watching after a failed load (internals/migrations.md).
 */
export function keepConfigWatchedAcrossFailures(nuxt: Lifecycle, rootDir: string, restart: (file: string) => void): void {
  const state = (globalThis.__ginkoConfigWatch ??= { up: false })
  nuxt.hook('ready', () => { state.up = true })
  nuxt.hook('close', () => { state.up = false })
  if (state.watcher) return
  const hashes = new Map<string, string>()
  const hash = (file: string) => existsSync(file) ? createHash('sha1').update(readFileSync(file)).digest('hex') : ''
  for (const name of CONFIG_NAMES) hashes.set(name, hash(join(rootDir, name)))
  let debounce: NodeJS.Timeout | undefined
  // The folder, not the file: editors that save by renaming a temp file replace the inode.
  state.watcher = watch(rootDir, (_event, name) => {
    if (!name || !CONFIG_NAMES.has(name)) return
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      const file = join(rootDir, name)
      const now = hash(file)
      // Content, not events: a save without a change, or a touch, does not restart.
      if (hashes.get(name) === now) return
      hashes.set(name, now)
      if (!state.up) restart(file)
    }, 200)
    debounce.unref()
  })
  state.watcher.unref()
}

/**
 * Asks the `nuxt dev` parent process to restart its fork, with the IPC message @nuxt/cli's own fork sends for a
 * config restart (verified in @nuxt/cli 4.0.1, dev-*.mjs `nuxt:internal:dev:restart`). Without a fork it says what to do.
 */
export function nuxiRestart(file: string): void {
  if (process.env.__NUXT__FORK && process.send) process.send({ type: 'nuxt:internal:dev:restart', reason: { type: 'config', files: [file] } })
  else console.warn(`[ginko] ${basename(file)} changed, but the dev server stopped with an error before. Restart \`nuxt dev\`.`)
}
