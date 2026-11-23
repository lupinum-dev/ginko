// The local platform, started as child processes: the local Convex backend (no account), then what the caller adds.
// Two commands use it: `pnpm local:dev` in the monorepo (SPEC 5.3, 9: the platform and a site; the site's
// ginko.config.ts is watched, and every change is pushed to the local platform with the devPush mutation) and
// `ginko-platform dev` in a platform project (the Studio only, ginko-platform.ts). Ctrl-C stops all of them.
import { spawn, type ChildProcess } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { connect } from 'node:net'
import { basename, dirname, join } from 'node:path'
import { platformSchema, serializeSchema, type Schema, type SchemaChange } from '../core/index.ts'
import { connectAgents } from './agent-config.ts'
import { loadConfig } from './config.ts'
import { confirmLocal, knownTargetError, LOCAL_STUDIO, parseEnvFile, parseResult, prepareLocalBackend, readDeploymentTarget, runOnce, targetEnv, type DeploymentTarget } from './local.ts'
import { CliError } from './model.ts'
import { explainRejected } from './report.ts'

export interface DevInput {
  configPath: string
  /** The Convex project, packages/ginko-server (backendAt). */
  backendDir: string
  log: (line: string) => void
}

/** `convex dev` prints one of these lines once the local backend serves functions. */
const CONVEX_READY = /Convex functions ready|Watching for changes/
const READY_TIMEOUT_MS = 180_000
const KILL_AFTER_MS = 5_000
/** With `quiet`, how many of the last lines of each child a failure shows. */
const TAIL_LINES = 40

/** Ctrl-C came before the local platform was ready: nothing failed, and nothing is left running. */
export class StoppedError extends CliError {
  constructor(command: string) {
    super(`${command} stopped before the platform was ready.`, 'USAGE')
  }
}

export interface LocalPlatformInput {
  /** The Convex project (backendAt): `convex dev` runs there and writes .env.local. */
  backendDir: string
  /** The command's name in messages, such as `local:dev`. */
  command: string
  log: (line: string) => void
  /** Called with every output line of `convex dev`, for example to show sign-in codes. */
  onBackendLine?: (line: string) => void
  /** Ports the later processes need; one in use stops this before any process starts. */
  freePorts?: number[]
  /**
   * Keep the output of the children and of the backend setup back until showOutput(); only the last 40 lines of each
   * are kept. A failure before that shows them after its error sentence.
   */
  quiet?: boolean
}

/** The running local platform: a prepared backend, and a way to start more processes that stop together with it. */
export interface LocalPlatform {
  /** The deployment the Convex CLI selected, confirmed local. */
  target: DeploymentTarget
  /** The admin address to sign in with. */
  admin: string
  /**
   * Starts a child with GINKO_LOCAL=1 and `env` added; its output goes to the log with its name in front (and to onLine),
   * and its end stops all the others.
   */
  start: (name: string, command: string, args: string[], cwd: string, options?: { env?: Record<string, string>; onLine?: (line: string) => void }) => ChildProcess
  /** From now on, the children's output goes to the log (with `quiet`, it was kept back until now). */
  showOutput: () => void
  /** Runs once when everything stops, before the children get their signal. */
  onStop: (cleanup: () => void) => void
  stopping: () => boolean
  /** 0 after Ctrl-C, 1 when a child ended by itself. */
  exited: Promise<number>
}

/**
 * Starts the local Convex backend in backendDir without an account, waits until it serves functions, confirms that the
 * Convex CLI selected the local deployment, and prepares it for sign-in (prepareLocalBackend). A known target that is not
 * local, or a port of `freePorts` in use, stops this before any process starts. Children get GINKO_LOCAL=1.
 */
export async function startLocalPlatform(input: LocalPlatformInput): Promise<LocalPlatform> {
  const { backendDir, command, log } = input
  // Before any process starts: `convex dev` would contact a cloud deployment first.
  const early = knownTargetError(readDeploymentTarget(backendDir), command)
  if (early) throw new CliError(early, 'USAGE')
  for (const port of input.freePorts ?? []) {
    if (await listening(port)) throw new CliError(`${command} stopped: port ${port} is in use, and the Studio needs it. Stop what runs there and start again.`, 'USAGE')
  }
  const env = { ...process.env, GINKO_LOCAL: '1' }
  const children: ChildProcess[] = []
  const cleanups: (() => void)[] = []
  let stopping = false
  let showing = !input.quiet
  // The last lines of each child and of the setup, for a failure while the output is kept back.
  const recent = new Map<string, string[]>()
  const keep = (name: string, line: string) => {
    const lines = recent.get(name) ?? []
    lines.push(line)
    if (lines.length > TAIL_LINES) lines.shift()
    recent.set(name, lines)
  }
  const told = new Set<string>()
  const tailOf = (name: string) => {
    const lines = recent.get(name)
    if (showing || told.has(name) || !lines?.length) return ''
    told.add(name)
    return `\nLast lines of ${name}:\n${lines.join('\n')}`
  }
  /** The setup lines (env values set, files written, migrations): shown, or kept back with the rest. */
  const setupLog = (line: string) => (showing ? log(line) : keep('setup', line))

  let finish: (code: number) => void = () => undefined
  const exited = new Promise<number>((done) => { finish = done })

  // A child has ended when it exited, died by a signal, or never started (no process id).
  const ended = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null || child.pid === undefined
  // Ctrl-C, not a failure, started the stop.
  let bySignal = false
  const onSignal = () => {
    if (!stopping) bySignal = true
    stop(0)
  }
  // The listeners stay while stopping: `npm run dev` forwards a Ctrl-C, so a second SIGINT follows the terminal's, and
  // without a listener Node's default action would end this process before the SIGKILL fallback for a child that
  // ignores SIGTERM. They go once every child has ended.
  const release = () => {
    if (!children.every(ended)) return
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  // Each child leads its own process group, so one signal stops its own children too.
  const stop = (code: number) => {
    if (stopping) return
    stopping = true
    for (const cleanup of cleanups) cleanup()
    for (const child of children) if (!ended(child) && child.pid) process.kill(-child.pid, 'SIGTERM')
    setTimeout(() => {
      for (const child of children) if (!ended(child) && child.pid) process.kill(-child.pid, 'SIGKILL')
    }, KILL_AFTER_MS).unref()
    release()
    finish(code)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  // Output of a child goes to our log with its name in front; a child that ends stops the others.
  const startChild = (name: string, cmd: string, args: string[], cwd: string, childEnv: NodeJS.ProcessEnv, onLine?: (line: string) => void) => {
    const child = spawn(cmd, args, { cwd, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    for (const stream of [child.stdout, child.stderr]) {
      let rest = ''
      stream.setEncoding('utf8').on('data', (chunk: string) => {
        const lines = (rest + chunk).split('\n')
        rest = lines.pop() ?? ''
        for (const line of lines) {
          if (showing) log(`[${name}] ${line}`)
          else keep(name, line)
          onLine?.(line)
        }
      })
    }
    child.once('exit', (code) => {
      if (stopping) return release()
      log(`[${name}] stopped (code ${code}). All processes are being stopped.${tailOf(name)}`)
      stop(1)
    })
    return child
  }

  // The local backend. Its functions are up when `convex dev` says so.
  const backend = new Promise<void>((done, fail) => {
    const timer = setTimeout(() => fail(new CliError('The local Convex backend is not ready after 3 minutes.', 'UNAVAILABLE')), READY_TIMEOUT_MS)
    const child = startChild('convex', 'npx', ['convex', 'dev'], backendDir, { ...env, CONVEX_AGENT_MODE: 'anonymous' }, (line) => {
      input.onBackendLine?.(line)
      if (CONVEX_READY.test(line)) {
        clearTimeout(timer)
        done()
      }
    })
    // Not ready and gone (or stopped by Ctrl-C): no reason to wait for the 3 minutes.
    child.once('exit', () => {
      clearTimeout(timer)
      fail(bySignal ? new StoppedError(command) : new CliError('The local Convex backend stopped before it was ready.', 'UNAVAILABLE'))
    })
  })
  let target: DeploymentTarget
  let admin: string
  try {
    await backend
    // Confirm the deployment that the Convex CLI selected before any write. Only then every command gets it explicitly.
    target = confirmLocal(backendDir, command)
    // Before the Studio starts: it reads the synced backendDir/.env.local once.
    admin = await prepareLocalBackend(backendDir, command, setupLog, runOnce)
    // Ctrl-C, or the backend ended, during the setup: start nothing more.
    if (bySignal) throw new StoppedError(command)
    if (stopping) throw new CliError('The local Convex backend stopped during the setup.', 'UNAVAILABLE')
  } catch (error) {
    if (error instanceof StoppedError) throw error
    stop(1)
    const tail = `${tailOf('convex')}${tailOf('setup')}`
    if (!tail) throw error
    const message = `${error instanceof Error ? error.message : String(error)}\n${tail}`
    throw error instanceof CliError ? new CliError(message, error.code) : new Error(message)
  }
  return {
    target,
    admin,
    start: (name, cmd, args, cwd, options = {}) => startChild(name, cmd, args, cwd, { ...env, ...options.env }, options.onLine),
    showOutput: () => { showing = true },
    onStop: (cleanup) => { cleanups.push(cleanup) },
    stopping: () => stopping,
    exited,
  }
}

export async function runDev(input: DevInput): Promise<number> {
  const { backendDir, log } = input
  const siteDir = dirname(input.configPath)
  const repoDir = dirname(dirname(backendDir))
  let platform: LocalPlatform
  try {
    platform = await startLocalPlatform({ backendDir, command: 'local:dev', log })
  } catch (error) {
    // Ctrl-C before the backend was ready: everything is stopped, nothing failed.
    if (error instanceof StoppedError) return 0
    throw error
  }
  const { target, admin } = platform
  let watcher: FSWatcher | undefined
  let debounce: NodeJS.Timeout | undefined
  platform.onStop(() => {
    watcher?.close()
    clearTimeout(debounce)
  })

  // Local platform and the site.
  platform.start('platform', 'pnpm', ['--filter', '@ginko/platform', 'dev'], repoDir)
  // The site reads this local platform, also when its config names a hosted one (`platform`).
  platform.start('site', 'pnpm', ['exec', 'nuxt', 'dev'], siteDir, { env: { NUXT_PUBLIC_GINKO_PLATFORM: 'http://localhost:3100' } })

  // Push the schema now and after every change of the config. A failed push is shown, the processes keep running.
  // The watcher starts first, so a save during the first push is not lost.
  let revision = 0
  let site: string | undefined
  const pushCurrent = async () => {
    revision++
    try {
      const config = await loadConfig(input.configPath, revision)
      site = config.site
      await push(platformSchema(serializeSchema(config)), backendDir, config.site, log, target)
    } catch (error) {
      log(`Schema not pushed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const pushLatest = serialized(pushCurrent, platform.stopping)
  watcher = watchFile(input.configPath, () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => { if (!platform.stopping()) void pushLatest() }, 200)
  })
  await pushLatest()
  log(`local:dev is running. Config: ${input.configPath}. Press Ctrl-C to stop everything.`)
  log(`Studio: ${LOCAL_STUDIO} — sign in as ${admin}, codes: pnpm outbox ${admin}`)
  log('Changes to files that the config imports take effect only after restarting `pnpm local:dev`.')
  // Agents in the site folder: .mcp.json with a local key of the admin, once the admin has signed in.
  const siteUrl = parseEnvFile(join(backendDir, '.env.local')).CONVEX_SITE_URL
  if (site && siteUrl) {
    void connectAgents({
      siteDir, siteUrl, site, admin, log, stopped: platform.stopping,
      devKey: async (args) => parseResult(await runOnce('npx', ['convex', 'run', 'agent:devKey', JSON.stringify(args)], backendDir, targetEnv(target))),
    }).catch((error: unknown) => log(`Agents: .mcp.json not written: ${error instanceof Error ? error.message : String(error)}`))
  }
  return platform.exited
}

/** True when something answers on the port (IPv4 or IPv6 localhost), as scripts/lib/runs.ts checks it. */
async function listening(port: number): Promise<boolean> {
  const tryHost = (host: string) => new Promise<boolean>((done) => {
    const socket = connect({ port, host })
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('error', () => done(false))
  })
  return (await tryHost('127.0.0.1')) || (await tryHost('::1'))
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
async function push(schema: Schema, backendDir: string, site: string, log: (line: string) => void, target: DeploymentTarget) {
  const output = await runOnce('npx', ['convex', 'run', 'release:devPush', JSON.stringify({ site, schema })], backendDir, targetEnv(target))
  const result = parseResult(output)
  if (!result) {
    log(`devPush: unexpected answer: ${output.slice(0, 300)}`)
    return
  }
  const warnings = Array.isArray(result.warnings) ? (result.warnings as SchemaChange[]) : []
  for (const line of explainRejected(warnings)) log(`Warning: ${line}`)
  log(`Schema pushed to the local platform (version ${String(result.schemaRev)}).`)
}
