// What the heavy local runs share: `pnpm templates test` (gates 1–6 and gate 7) and `pnpm e2e:platform`.
//
// - One heavy run per machine (`heavyLock`): a lock file in the temp folder names the run that holds it. A lock whose
//   process is gone, or whose process id now belongs to another process (other start time), is stale and taken over.
// - A calm machine first (`waitForCalm`): the 1-minute load average below the CPU count, for a bounded time; then the
//   run starts anyway with a warning. GINKO_NO_LOAD_WAIT=1 skips the wait (CI).
// - A session (`startSession`) for a run on the local platform: it sets the local backend's state aside and starts each
//   child as the leader of its own process group, so one signal stops a child and everything it started. A state file
//   names the groups and the copy, so the next run cleans up after a run that was killed (`recoverCrashedRun`). The end
//   of the run, a signal and the time limit stop everything the same way and put the state back.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { availableParallelism, loadavg, tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { failureOf } from '../../packages/ginko/src/cli/local.ts'

// ---------------------------------------------------------------------------------------------------------------
// Processes

/** The ports of a run on the local platform: the site, the Studio and the local Convex backend with its HTTP actions. */
export const PLATFORM_PORTS = { site: 3000, studio: 3100, convex: 3210, convexSite: 3211 }

export type Group = { pid: number; started: string }

/** True while the process runs (also when it belongs to another user). */
export const exists = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' } }
/** True while any process of the group is left (the leader may be gone while its children run). */
export const groupAlive = (group: number) => exists(-group)
/** When the process started, as `ps` prints it. With the process id it names one process, also after the id is reused. */
export const startedAt = (pid: number) => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()
/** True when the process that recorded `started` still runs: same id, same start time. */
export const stillRuns = ({ pid, started }: Group) => started !== '' && exists(pid) && startedAt(pid) === started
/** A child that started and has not ended. (A command that cannot be found has no process id.) */
export const alive = (child: ChildProcess) => child.pid !== undefined && child.exitCode === null && child.signalCode === null

const STOP_STEP_MS = 2_500

/**
 * Stops whole process groups: SIGINT first (Playwright then stops the web servers it started), SIGTERM, then SIGKILL,
 * each after a short wait for the groups that are left.
 */
export async function stopGroups(groups: readonly Group[]) {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
    const left = groups.filter(({ pid }) => groupAlive(pid))
    if (!left.length) return
    for (const { pid } of left) try { process.kill(-pid, signal) } catch { /* already gone */ }
    for (let i = 0; i < STOP_STEP_MS / 250 && left.some(({ pid }) => groupAlive(pid)); i++) await sleep(250)
  }
}

/** True when something answers on the port (IPv4 or IPv6 localhost). */
export async function listening(port: number): Promise<boolean> {
  const tryHost = (host: string) => new Promise<boolean>((done) => {
    const socket = connect({ port, host })
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('error', () => done(false))
  })
  return (await tryHost('127.0.0.1')) || (await tryHost('::1'))
}

/** The ports of `ports` that something answers on. */
export async function busyPorts(ports: readonly number[]): Promise<number[]> {
  const busy: number[] = []
  for (const port of ports) if (await listening(port)) busy.push(port)
  return busy
}

// ---------------------------------------------------------------------------------------------------------------
// One heavy run per machine

export const HEAVY_LOCK = join(tmpdir(), 'ginko-heavy-run.lock')
type Holder = Group & { what: string; cwd: string; since: string }

/**
 * Waits until no other heavy run holds the lock, then takes it. Returns the release (also run when the process exits).
 * While it waits it says which run holds the lock (at once, then every `remindMs`).
 */
export async function heavyLock(what: string, { file = HEAVY_LOCK, pollMs = 5_000, remindMs = 5 * 60_000, log = console.log }: { file?: string; pollMs?: number; remindMs?: number; log?: (line: string) => void } = {}): Promise<() => void> {
  const me: Holder = { pid: process.pid, started: startedAt(process.pid), what, cwd: process.cwd(), since: new Date().toISOString() }
  const read = (): Holder | undefined => { try { return JSON.parse(readFileSync(file, 'utf8')) as Holder } catch { return undefined } }
  const mine = () => read()?.pid === me.pid
  let told = 0
  for (;;) {
    let created = false
    try {
      writeFileSync(file, JSON.stringify(me), { flag: 'wx' })
      created = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    if (created) {
      // Two runs that judged the same stale lock at once: the later removal may have taken this new lock away. Look again.
      await sleep(Math.min(pollMs, 200))
      if (mine()) {
        const release = () => {
          process.off('exit', release)
          if (mine()) rmSync(file, { force: true })
        }
        process.on('exit', release)
        return release
      }
      continue
    }
    const holder = read()
    // Unreadable: a broken lock, or one that is being written this moment (then it is young).
    const broken = !holder && Date.now() - (statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0) > 10_000
    if (broken || (holder && !stillRuns(holder))) {
      // Stale: its run ended without removing it (killed), or the id now names another process.
      rmSync(file, { force: true })
      if (holder) log(`heavy-run lock: took over the lock of ${holder.what} (process ${holder.pid} has ended).`)
      continue
    }
    if (!holder) { await sleep(pollMs); continue }
    if (Date.now() - told >= remindMs) {
      log(`heavy-run lock: waiting for ${holder.what} (process ${holder.pid} in ${holder.cwd}, since ${holder.since}). One heavy run at a time per machine.`)
      told = Date.now()
    }
    await sleep(pollMs)
  }
}

/**
 * Waits until the 1-minute load average is below the CPU count, at most `maxWaitMs`; then the run starts anyway, with
 * a warning. GINKO_NO_LOAD_WAIT=1 skips the wait.
 */
export async function waitForCalm({ maxWaitMs = 15 * 60_000, pollMs = 15_000, load = () => loadavg()[0]!, cpus = availableParallelism(), env = process.env, log = console.log }: { maxWaitMs?: number; pollMs?: number; load?: () => number; cpus?: number; env?: NodeJS.ProcessEnv; log?: (line: string) => void } = {}) {
  if (env.GINKO_NO_LOAD_WAIT === '1') return
  const start = Date.now()
  let told = false
  while (load() >= cpus) {
    if (Date.now() - start >= maxWaitMs) {
      log(`load guard: WARNING the load is still ${load().toFixed(1)} on ${cpus} CPUs after ${Math.round(maxWaitMs / 60_000)} min; starting anyway. Expect timeouts.`)
      return
    }
    if (!told) log(`load guard: load ${load().toFixed(1)} on ${cpus} CPUs; waiting up to ${Math.round(maxWaitMs / 60_000)} min for it to drop below ${cpus} (GINKO_NO_LOAD_WAIT=1 skips this).`)
    told = true
    await sleep(pollMs)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// A run on the local platform: state set aside, process groups, cleanup

/** What a run left in its state file: its own process, the groups it started and the copy of the state it changes. */
export type RunState = { pid: number; started?: string; groups: Group[]; base: string; aside: string; touched: string[]; kept: string[] }
export const PLATFORM_RUN_STATE = join(tmpdir(), 'ginko-platform-run.json')

/** Puts the entries of `touched` (paths under `base`) back as they were and removes the copy. */
export function restoreAside({ base, aside, touched, kept }: Pick<RunState, 'base' | 'aside' | 'touched' | 'kept'>) {
  for (const entry of touched) rmSync(join(base, entry), { recursive: true, force: true })
  for (const entry of kept) cpSync(join(aside, entry), join(base, entry), { recursive: true, verbatimSymlinks: true })
  rmSync(aside, { recursive: true, force: true })
}

/**
 * A run that was killed (SIGKILL) leaves its state file. If its process is gone, stop the process groups it started
 * (only those whose leader still has the recorded start time, so a reused process id is never touched) and put the
 * state back. Returns a reason when that run is still active.
 */
export async function recoverCrashedRun(file = PLATFORM_RUN_STATE): Promise<string | undefined> {
  if (!existsSync(file)) return undefined
  let state: RunState
  try { state = JSON.parse(readFileSync(file, 'utf8')) as RunState } catch { rmSync(file, { force: true }); return undefined }
  if (state.started === undefined ? exists(state.pid) : stillRuns({ pid: state.pid, started: state.started })) return `Another run on the local platform (process ${state.pid}) is active. Wait for it to end.`
  const groups = state.groups.filter(stillRuns)
  await stopGroups(groups)
  if (existsSync(state.aside)) restoreAside(state)
  rmSync(file, { force: true })
  console.log(`Cleaned up after an earlier run that was killed (stopped ${groups.length} process group(s), restored ${state.base}).`)
  return undefined
}

export interface Session {
  /** Starts a long-running child (a server) with its output in `<logs>/<label>.log`; `onLine` sees each line. */
  start: (label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, onLine?: (line: string) => void) => ChildProcess
  /** Like runOnce (local.ts) for the short commands of a run, but tracked: a signal in the middle of one stops it too. */
  run: (command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => Promise<string>
  /** Starts a child with the terminal's output (a test runner); resolves with its exit code (null when it could not start). */
  attached: (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => Promise<number | null>
  /** Stops everything, puts the state back, removes the state file. Every caller awaits the same cleanup. */
  finish: () => Promise<void>
}

/**
 * Starts a run that changes the entries of `touched` under `base`: they are copied aside and put back at the end;
 * `fresh` (a part of `touched`) is removed now, so the run starts without it. `scratch` folders are removed at the end.
 * A signal or `timeoutMs` stops everything and ends the process (130, 143, 129; 124 after the time limit).
 */
export function startSession({ name, base, touched, fresh, scratch = [], logs, timeoutMs, stateFile = PLATFORM_RUN_STATE }: { name: string; base: string; touched: string[]; fresh: string[]; scratch?: string[]; logs: string; timeoutMs: number; stateFile?: string }): Session {
  const aside = mkdtempSync(join(tmpdir(), 'ginko-run-aside-'))
  const kept = touched.filter((entry) => existsSync(join(base, entry)))
  try {
    for (const entry of kept) cpSync(join(base, entry), join(aside, entry), { recursive: true, verbatimSymlinks: true })
  } catch (error) {
    // The copy is incomplete and nothing was changed yet: drop it, so it is never used to restore.
    rmSync(aside, { recursive: true, force: true })
    throw error
  }
  const groups: Group[] = []
  const save = () => writeFileSync(stateFile, JSON.stringify({ pid: process.pid, started: startedAt(process.pid), groups, base, aside, touched, kept } satisfies RunState))
  save()
  for (const entry of fresh) rmSync(join(base, entry), { recursive: true, force: true })

  /** Puts a child (it leads its own process group) on the list that the cleanup and the state file use. */
  const track = <Child extends ChildProcess>(child: Child) => {
    if (child.pid) {
      groups.push({ pid: child.pid, started: startedAt(child.pid) })
      save()
    }
    return child
  }
  /** Done: leave the list, so the cleanup never signals a process id that was handed on. */
  const untrack = (child: ChildProcess) => {
    const index = groups.findIndex((group) => group.pid === child.pid)
    if (index >= 0 && !groupAlive(groups[index]!.pid)) { groups.splice(index, 1); save() }
  }
  const run: Session['run'] = (command, args, cwd, env = process.env) => new Promise((done, fail) => {
    const child = track(spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }))
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk })
    child.on('error', fail)
    child.on('close', (code) => {
      untrack(child)
      if (code === 0) return done(out)
      fail(new Error(`${command} ${args.slice(0, 2).join(' ')} exited with code ${code}: ${failureOf(err)}`))
    })
  })
  const start: Session['start'] = (label, command, args, cwd, env, onLine) => {
    const log = join(logs, `${label}.log`)
    writeFileSync(log, '')
    const child = track(spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }))
    // Without a handler, a command that cannot start would be an uncaught error that skips the cleanup.
    child.on('error', (error) => writeFileSync(log, `could not start ${command}: ${error.message}\n`, { flag: 'a' }))
    for (const stream of [child.stdout, child.stderr]) {
      let rest = ''
      stream.setEncoding('utf8').on('data', (chunk: string) => {
        writeFileSync(log, chunk, { flag: 'a' })
        if (!onLine) return
        const lines = (rest + chunk).split('\n')
        rest = lines.pop() ?? ''
        for (const line of lines) onLine(line)
      })
    }
    return child
  }
  const attached: Session['attached'] = (command, args, cwd, env) => new Promise((done) => {
    const child = track(spawn(command, args, { cwd, env, detached: true, stdio: 'inherit' }))
    child.once('error', () => done(null))
    child.once('close', (code) => { untrack(child); done(code) })
  })

  // One cleanup, awaited by every caller (the end of the run, each signal, the time limit), so none can exit before it ends.
  // The handlers stay (`on`, not `once`): a second Ctrl-C must wait for the cleanup too, not end the process in the middle of it.
  let cleanup: Promise<void> | undefined
  const finish = () => cleanup ??= (async () => {
    clearTimeout(limit)
    await stopGroups(groups)
    restoreAside({ base, aside, touched, kept })
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
    rmSync(stateFile, { force: true })
  })()
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) process.on(signal, () => { void finish().then(() => process.exit(code)) })
  const limit = setTimeout(() => {
    console.error(`${name} took longer than ${timeoutMs / 60_000} minutes. Stopping everything.`)
    void finish().then(() => process.exit(124))
  }, timeoutMs)
  limit.unref()
  return { start, run, attached, finish }
}

// ---------------------------------------------------------------------------------------------------------------
// Waiting for servers

/** What the last probe saw, named in the timeout message. */
let lastSeen = ''

/** Waits until `ready` says yes. Fails at the wall-clock deadline, or at once when the watched process ends. */
export async function waitFor(what: string, ready: () => Promise<boolean>, seconds: number, watch?: ChildProcess) {
  lastSeen = ''
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    if (watch && !alive(watch)) throw new Error(`${what}: its process ended (${watch.signalCode ?? `exit ${watch.exitCode}`}) before it was ready. See its log.${lastSeen ? ` Last answer: ${lastSeen}` : ''}`)
    if (await ready()) return
    await sleep(500)
  }
  throw new Error(`${what} was not ready after ${seconds} s${lastSeen ? ` (last answer: ${lastSeen})` : ''}`)
}

/** Ready when the URL answers with a 2xx. */
export const answers = (url: string) => async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) }).catch((error: Error) => { lastSeen = String(error.cause ?? error.message); return undefined })
  if (!response) return false
  const body = await response.text().catch(() => '')
  lastSeen = `HTTP ${response.status} ${body.replace(/\s+/g, ' ').slice(0, 300)}`
  return response.ok
}

/** `convex dev` prints one of these once the local backend serves its functions. */
export const CONVEX_READY = /Convex functions ready|Watching for changes/
