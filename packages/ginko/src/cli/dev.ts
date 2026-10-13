// `pnpm local:dev` (SPEC 5.3, 9, monorepo only): the local Convex backend, the local platform (GINKO_LOCAL=1) and the
// site, started as three child processes. The site's ginko.config.ts is watched; every change is
// pushed to the local platform with the devPush mutation. Ctrl-C stops all of them.
import { spawn, type ChildProcess } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import { platformSchema, serializeSchema, type Schema, type SchemaChange } from '../core/index.ts'
import { loadConfig } from './config.ts'
import { findPlatform, knownTargetError, localDeploymentError, parseResult, readDeploymentTarget, runOnce, targetEnv, type DeploymentTarget } from './local.ts'
import { CliError } from './model.ts'
import { explainRejected } from './report.ts'

export interface DevInput {
  configPath: string
  log: (line: string) => void
}

/** `convex dev` prints one of these lines once the local backend serves functions. */
const CONVEX_READY = /Convex functions ready|Watching for changes/
const READY_TIMEOUT_MS = 180_000
const KILL_AFTER_MS = 5_000

export async function runDev(input: DevInput): Promise<number> {
  const { log } = input
  const siteDir = dirname(input.configPath)
  const platformDir = findPlatform(siteDir)
  const repoDir = dirname(dirname(platformDir))
  // Before any process starts: `convex dev` would contact a cloud deployment first.
  const early = knownTargetError(readDeploymentTarget(platformDir))
  if (early) throw new CliError(early, 'USAGE')
  const env = { ...process.env, GINKO_LOCAL: '1' }
  const children: ChildProcess[] = []
  let watcher: FSWatcher | undefined
  let debounce: NodeJS.Timeout | undefined
  let stopping = false

  let finish: (code: number) => void = () => undefined
  const exited = new Promise<number>((done) => { finish = done })

  // Each child leads its own process group, so one signal stops its own children too.
  const stop = (code: number) => {
    if (stopping) return
    stopping = true
    watcher?.close()
    clearTimeout(debounce)
    for (const child of children) if (child.exitCode === null && child.pid) process.kill(-child.pid, 'SIGTERM')
    setTimeout(() => {
      for (const child of children) if (child.exitCode === null && child.pid) process.kill(-child.pid, 'SIGKILL')
    }, KILL_AFTER_MS).unref()
    finish(code)
  }
  process.once('SIGINT', () => stop(0))
  process.once('SIGTERM', () => stop(0))

  // Output of a child goes to our log with its name in front; a child that ends stops the others.
  const start = (name: string, command: string, args: string[], cwd: string, childEnv: NodeJS.ProcessEnv, onLine?: (line: string) => void) => {
    const child = spawn(command, args, { cwd, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    for (const stream of [child.stdout, child.stderr]) {
      let rest = ''
      stream.setEncoding('utf8').on('data', (chunk: string) => {
        const lines = (rest + chunk).split('\n')
        rest = lines.pop() ?? ''
        for (const line of lines) {
          log(`[${name}] ${line}`)
          onLine?.(line)
        }
      })
    }
    child.once('exit', (code) => {
      if (!stopping) {
        log(`[${name}] stopped (code ${code}). All processes are being stopped.`)
        stop(1)
      }
    })
    return child
  }

  // 1. Local backend. Its functions are up when `convex dev` says so.
  const backend = new Promise<void>((done, fail) => {
    const timer = setTimeout(() => fail(new CliError('The local Convex backend is not ready after 3 minutes.')), READY_TIMEOUT_MS)
    start('convex', 'npx', ['convex', 'dev'], platformDir, { ...env, CONVEX_AGENT_MODE: 'anonymous' }, (line) => {
      if (CONVEX_READY.test(line)) {
        clearTimeout(timer)
        done()
      }
    })
  })
  let target: DeploymentTarget
  try {
    await backend
    // Confirm the deployment that the Convex CLI selected before any write. Only then every command gets it explicitly.
    target = readDeploymentTarget(platformDir)
    const problem = localDeploymentError(target)
    if (problem) throw new CliError(problem, 'USAGE')
    // The platform reads GINKO_LOCAL inside Convex, so the backend needs it too (SPEC 5.3).
    await runOnce('npx', ['convex', 'env', 'set', 'GINKO_LOCAL', '1'], platformDir, targetEnv(target))
  } catch (error) {
    stop(1)
    throw error
  }

  // 2. Local platform and the site.
  start('platform', 'pnpm', ['--filter', '@ginko/platform', 'dev'], repoDir, env)
  start('site', 'pnpm', ['exec', 'nuxt', 'dev'], siteDir, env)

  // 3. Push the schema now and after every change of the config. A failed push is shown, the processes keep running.
  // The watcher starts first, so a save during the first push is not lost.
  let revision = 0
  const pushCurrent = async () => {
    revision++
    try {
      const config = await loadConfig(input.configPath, revision)
      await push(platformSchema(serializeSchema(config)), platformDir, config.site, log, target)
    } catch (error) {
      log(`Schema not pushed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const pushLatest = serialized(pushCurrent, () => stopping)
  watcher = watchFile(input.configPath, () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => { if (!stopping) void pushLatest() }, 200)
  })
  await pushLatest()
  log(`local:dev is running. Config: ${input.configPath}. Press Ctrl-C to stop everything.`)
  log('Changes to files that the config imports take effect only after restarting `pnpm local:dev`.')
  return exited
}

/**
 * Watches the folder of a file and reports changes of that file only. The folder, not the file: an editor
 * that saves by writing a temp file and renaming it over the original replaces the file's inode, and a
 * watcher on the old inode would end silently.
 */
export function watchFile(path: string, onChange: () => void): FSWatcher {
  const name = basename(path)
  return watch(dirname(path), (_event, filename) => {
    if (filename === null || filename === name) onChange()
  })
}

/**
 * At most one run at a time. A call during a run does not start another one; it makes exactly one more
 * run follow, which reads the latest state. Runs therefore finish in order.
 */
export function serialized(run: () => Promise<void>, stopped: () => boolean = () => false): () => Promise<void> {
  let running = false
  let again = false
  return async () => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        await run()
      } while (again && !stopped())
    } finally {
      running = false
    }
  }
}

/** devPush in the local platform. Rejected changes go through and are shown as warnings (SPEC 5.3). */
async function push(schema: Schema, platformDir: string, site: string, log: (line: string) => void, target: DeploymentTarget) {
  const output = await runOnce('npx', ['convex', 'run', 'release:devPush', JSON.stringify({ site, schema })], platformDir, targetEnv(target))
  const result = parseResult(output)
  if (!result) {
    log(`devPush: unexpected answer: ${output.slice(0, 300)}`)
    return
  }
  const warnings = Array.isArray(result.warnings) ? (result.warnings as SchemaChange[]) : []
  if (warnings.length) for (const line of explainRejected(warnings)) log(`Warning: ${line}`)
  log(`Schema pushed to the local platform (version ${String(result.schemaRev)}).`)
}
