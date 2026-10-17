import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkSite, type SiteInput } from '../core/index.ts'

const CONFIG_NAMES = new Set(['ts', 'mts', 'js', 'mjs'].map((ext) => `ginko.config.${ext}`))

/** The part of the Nuxt instance the config watcher uses. */
interface DevNuxt {
  hook(name: 'ready' | 'build:done' | 'close', fn: () => void): unknown
  callHook(name: 'restart', options: { hard: true }): unknown
}

/**
 * Dev only. `nuxt.config.ts` imports ginko.config.ts, and Node keeps that import in its module cache for the life of the
 * process: Nuxt's in-place reload reads nuxt.config.ts again, but gets the cached ginko.config.ts, so a saved change did
 * nothing (and a broken one showed no error) until a manual restart. This watcher loads a changed config fresh and runs
 * the checks of the module's setup. A good version restarts the whole dev process with Nuxt's hard restart (as Nuxt does
 * for a changed local module). A broken one is reported in one line, and the server keeps the version it runs.
 * Files that the config imports are not watched, and the check uses their cached version.
 */
export function restartOnConfigChange(nuxt: DevNuxt, rootDir: string): void {
  // @nuxt/cli ignores a hard restart asked for before the dev server is ready (verified in @nuxt/cli 4.0.0 and 4.0.1:
  // a fork's request counts only after it reported ready). A good save made while the server starts waits until then.
  let ready = false
  let pending: string | undefined
  let restarting = false
  const restart = (name: string) => {
    restarting = true
    console.info(`[ginko] ${name} changed: restarting the dev server.`)
    void Promise.resolve(nuxt.callHook('restart', { hard: true })).catch((error: unknown) => console.error('[ginko] The dev server could not restart:', error))
  }
  const hashOf = (file: string) => existsSync(file) ? createHash('sha1').update(readFileSync(file)).digest('hex') : ''
  const hashes = new Map([...CONFIG_NAMES].map((name) => [name, hashOf(join(rootDir, name))]))
  const check = async (name: string) => {
    const file = join(rootDir, name)
    const hash = hashOf(file)
    // Content, not events: a save without a change, or a touch, does nothing. A removed file is left to the next restart.
    if (restarting || !hash || hashes.get(name) === hash) return
    hashes.set(name, hash)
    const problem = await configProblem(file)
    if (problem) console.error(`[ginko] ${name} has an error, the dev server keeps the last good version: ${problem}`)
    else if (ready) restart(name)
    else pending = name
  }
  // One check at a time, in the order of the saves.
  let queue = Promise.resolve()
  let debounce: NodeJS.Timeout | undefined
  // The folder, not the file: editors that save by renaming a temp file replace the inode.
  const watcher = watch(rootDir, (_event, name) => {
    if (!name || !CONFIG_NAMES.has(name)) return
    clearTimeout(debounce)
    debounce = setTimeout(() => { queue = queue.then(() => check(name)).catch((error: unknown) => console.error('[ginko]', error)) }, 100)
  })
  watcher.unref()
  // Ready: the first build is done. Registered at `ready`, after Nitro's own `build:done` that builds the server, so it
  // runs when both are done; @nuxt/cli reports ready a few milliseconds later, the delay leaves room for that.
  let settle: NodeJS.Timeout | undefined
  nuxt.hook('ready', () => nuxt.hook('build:done', () => {
    settle = setTimeout(() => {
      ready = true
      if (pending && !restarting) restart(pending)
    }, 1000)
  }))
  nuxt.hook('close', () => {
    clearTimeout(debounce)
    clearTimeout(settle)
    watcher.close()
  })
}

/**
 * Why the config file cannot serve the site, in one line, or undefined when it can: it must load and pass the checks
 * that make the module's setup fail. Loaded with a new query string, so Node reads the file again instead of returning
 * the cached module (cli/config.ts does the same for `local:dev`).
 */
async function configProblem(file: string): Promise<string | undefined> {
  try {
    const module = await import(`${pathToFileURL(file).href}?ginko=${randomUUID()}`) as { default?: SiteInput }
    const site = module.default
    if (!site?.site || !site.bricks) return 'the default export must be the result of defineSite().'
    const problems = checkSite(site)
    return problems.length ? problems.join(' ') : undefined
  } catch (error) {
    return error instanceof Error ? error.message.split('\n')[0]! : String(error)
  }
}
