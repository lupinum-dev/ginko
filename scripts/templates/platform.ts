// Gate 7 of spec TEMPLATES.md §9: `pnpm templates test <name> --platform`. Proves that a template's Studio jobs work on the
// platform. It starts a LOCAL Convex backend, the Studio (:3100) and the template site (:3000) in platform mode,
// pushes `withoutFiles(config)`, moves the template's content in (`local:files-export`, then `local:import`, with the
// sample dates shifted to this week), runs the Studio e2e specs and checks the site shows the change.
// Everything it starts is stopped at the end, and the local backend's data is put back as it was: the folders
// packages/ginko-server/.convex, .env.local and convex/_generated are copied aside, .convex and .env.local are removed so
// every run starts on a fresh anonymous backend, and the copies come back at the end. A lock file in the temp folder
// names the child processes and the copy; the next run cleans up after a run that was killed. A signal or the time limit
// (GATE_TIMEOUT_MS) stops everything the same way. What the template calls the content of the shared jobs is in
// templates/_studio/<template>/jobs.json. Logs: GINKO_PLATFORM_LOGS, else a work folder.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { serializeSchema, withoutFiles, type SiteInput } from '../../packages/ginko/src/core/index.ts'
import { loadConfig } from '../../packages/ginko/src/cli/config.ts'
import { confirmLocal, findBackend, knownTargetError, prepareLocalBackend, readDeploymentTarget, runOnce, targetEnv } from '../../packages/ginko/src/cli/local.ts'
import { manifestOf, shiftDates, weeksShift } from '../../packages/create-ginko/template-files.mjs'

export type Step = { check: string; ok: boolean; detail?: string }

/** The ports gate 7 alone uses (spec §2): the site, the Studio and the local Convex backend with its HTTP actions. */
const PORTS = { site: 3000, studio: 3100, convex: 3210, convexSite: 3211 }
/** `convex dev` prints one of these once the local backend serves its functions. */
const CONVEX_READY = /Convex functions ready|Watching for changes/
const KILL_AFTER_MS = 5_000
/** The whole run may not take longer than this; then everything is stopped and the gate fails. */
const GATE_TIMEOUT_MS = 40 * 60_000
const PROBE_TIMEOUT_MS = 5_000
/** Backend entries the run changes. `.convex` and `.env.local` are also removed, so the run starts on a fresh backend. */
const TOUCHED = ['.convex', '.env.local', 'convex/_generated']
const LOCK = join(tmpdir(), 'ginko-platform-gate.lock')

/**
 * The folders with the Studio specs for a template: `templates/_features/<feature>/e2e/studio/` of every feature it
 * syncs, plus `templates/_studio/<template>/` for the jobs of its own sections. Only folders that exist and hold a spec.
 */
export function studioSpecDirs(root: string, name: string, features: string[]): string[] {
  return [...features.map((f) => `templates/_features/${f}/e2e/studio`), `templates/_studio/${name}`]
    .filter((dir) => existsSync(join(root, dir)) && readdirSync(join(root, dir)).some((file) => file.endsWith('.spec.ts')))
}

/** True when something answers on the port (IPv4 or IPv6 localhost). */
async function listening(port: number): Promise<boolean> {
  const tryHost = (host: string) => new Promise<boolean>((done) => {
    const socket = connect({ port, host })
    socket.once('connect', () => { socket.destroy(); done(true) })
    socket.once('error', () => done(false))
  })
  return (await tryHost('127.0.0.1')) || (await tryHost('::1'))
}

/** A child that started and has not ended. (A command that cannot be found has no process id.) */
const alive = (child: ChildProcess) => child.pid !== undefined && child.exitCode === null && child.signalCode === null
const exists = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM' } }
/** True while any process of the group is left (the leader may be gone while its children run). */
const groupAlive = (group: number) => exists(-group)
/** When the process started, as `ps` prints it. With the process id it names one process, also after the id is reused. */
const startedAt = (pid: number) => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()

export type Lock = { pid: number; groups: { pid: number; started: string }[]; aside: string; backendDir: string; kept: string[] }

/** Puts the backend's folders back as they were and removes the copy. */
export function restoreBackend({ backendDir, aside, kept }: Pick<Lock, 'backendDir' | 'aside' | 'kept'>) {
  for (const entry of TOUCHED) rmSync(join(backendDir, entry), { recursive: true, force: true })
  for (const entry of kept) cpSync(join(aside, entry), join(backendDir, entry), { recursive: true, verbatimSymlinks: true })
  rmSync(aside, { recursive: true, force: true })
}

/**
 * A run that was killed (SIGKILL) leaves the lock file. If its gate process is gone, stop the process groups it started
 * (only those whose leader still has the recorded start time, so a reused process id is never touched) and put the
 * backend back. Returns a reason when a run is still active.
 */
export async function recoverCrashedRun(lockFile = LOCK): Promise<string | undefined> {
  if (!existsSync(lockFile)) return undefined
  let lock: Lock
  try { lock = JSON.parse(readFileSync(lockFile, 'utf8')) as Lock } catch { rmSync(lockFile, { force: true }); return undefined }
  if (exists(lock.pid)) return `Another gate 7 run (process ${lock.pid}) is active. Wait for it to end.`
  const groups = lock.groups.filter((group) => group.started !== '' && startedAt(group.pid) === group.started)
  for (const group of groups) try { process.kill(-group.pid, 'SIGTERM') } catch { /* gone */ }
  for (let i = 0; i < KILL_AFTER_MS / 250 && groups.some((group) => groupAlive(group.pid)); i++) await sleep(250)
  for (const group of groups) if (groupAlive(group.pid)) try { process.kill(-group.pid, 'SIGKILL') } catch { /* gone */ }
  if (existsSync(lock.aside)) restoreBackend(lock)
  rmSync(lockFile, { force: true })
  console.log(`gate 7: cleaned up after an earlier run that was killed (stopped ${groups.length} process group(s), restored ${lock.backendDir}).`)
  return undefined
}

/** What the last probe saw, named in the timeout message. */
let lastSeen = ''

/** Waits until `ready` says yes. Fails at the wall-clock deadline, or at once when the watched process ends. */
async function waitFor(what: string, ready: () => Promise<boolean>, seconds: number, watch?: ChildProcess) {
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
const answers = (url: string) => async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).catch((error: Error) => { lastSeen = String(error.cause ?? error.message); return undefined })
  if (!response) return false
  const body = await response.text().catch(() => '')
  lastSeen = `HTTP ${response.status} ${body.replace(/\s+/g, ' ').slice(0, 300)}`
  return response.ok
}

export async function platformGate(name: string, root: string): Promise<Step[]> {
  const steps: Step[] = []
  const backendDir = findBackend(root, 'templates test --platform')
  const templateDir = join(root, 'templates', name)
  const pkg = JSON.parse(readFileSync(join(templateDir, 'package.json'), 'utf8')) as { ginko?: { sampleAnchor?: string; features?: string[] } }
  const note = (check: string, ok: boolean, detail?: string) => {
    steps.push({ check, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'} gate 7 ${check}${detail && !ok ? `\n${detail.split('\n').slice(0, 40).map((l) => `     ${l}`).join('\n')}` : ''}`)
    return ok
  }
  /** A step that must work for the next ones. */
  const must = async (check: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      return note(check, true)
    } catch (error) {
      return note(check, false, error instanceof Error ? error.message : String(error))
    }
  }

  // Before anything starts or is changed: no cloud key, an earlier killed run cleaned up, a local target, our ports.
  if (process.env.CONVEX_DEPLOY_KEY) { note('preflight', false, 'CONVEX_DEPLOY_KEY is set: gate 7 writes data and runs against the local backend only. Stopped.'); return steps }
  const active = await recoverCrashedRun()
  if (active) { note('preflight', false, active); return steps }
  // `convex dev` would contact a cloud deployment first (as in `local:dev`).
  const early = knownTargetError(readDeploymentTarget(backendDir), 'templates test --platform')
  if (early) { note('preflight', false, early); return steps }
  const busy: number[] = []
  for (const port of Object.values(PORTS)) if (await listening(port)) busy.push(port)
  if (busy.length) { note('preflight', false, `Port ${busy.join(', ')} is in use (gate 7 needs ${Object.values(PORTS).join(', ')}). Stop what runs there, or wait for it, and run again.`); return steps }

  const logs = process.env.GINKO_PLATFORM_LOGS ?? mkdtempSync(join(tmpdir(), `ginko-platform-${name}-`))
  mkdirSync(logs, { recursive: true })
  // The backend's data as found: copied aside now, put back at the end (also when this run fails). .convex and
  // .env.local are then removed, so the run does not depend on what the developer's backend holds.
  const aside = mkdtempSync(join(tmpdir(), 'ginko-platform-aside-'))
  const kept = TOUCHED.filter((entry) => existsSync(join(backendDir, entry)))
  try {
    for (const entry of kept) cpSync(join(backendDir, entry), join(aside, entry), { recursive: true, verbatimSymlinks: true })
  } catch (error) {
    // The copy is incomplete and nothing was changed yet: drop it, so it is never used to restore.
    rmSync(aside, { recursive: true, force: true })
    throw error
  }
  const work = mkdtempSync(join(tmpdir(), `ginko-platform-work-${name}-`))
  const groups: Lock['groups'] = []
  const saveLock = () => writeFileSync(LOCK, JSON.stringify({ pid: process.pid, groups, aside, backendDir, kept } satisfies Lock))
  saveLock()
  for (const entry of ['.convex', '.env.local']) rmSync(join(backendDir, entry), { recursive: true, force: true })

  /** Puts a child (it leads its own process group) on the list that the cleanup and the lock file use. */
  const track = <Child extends ChildProcess>(child: Child) => {
    if (child.pid) {
      groups.push({ pid: child.pid, started: startedAt(child.pid) })
      saveLock()
    }
    return child
  }
  /**
   * Like runOnce, for the short commands of the run (`convex env set`, `convex run`, the content import), but the process is
   * tracked: a signal or the time limit in the middle of one stops it too, instead of leaving it behind.
   */
  const run: typeof runOnce = (command, args, cwd, env = process.env) => new Promise((done, fail) => {
    const child = track(spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }))
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk })
    child.on('error', fail)
    child.on('close', (code) => {
      // Done: leave the list, so the cleanup never signals a process id that was handed on.
      const index = groups.findIndex((group) => group.pid === child.pid)
      if (index >= 0 && !groupAlive(groups[index]!.pid)) { groups.splice(index, 1); saveLock() }
      if (code === 0) return done(out)
      const lines = err.split('\n').map((line) => line.trim()).filter(Boolean)
      // The error is often not the first line (a CLI prints what it did before it failed): name the last ones.
      fail(new Error(`${command} ${args.slice(0, 2).join(' ')} exited with code ${code}: ${lines.find((line) => line.startsWith('Uncaught')) ?? lines.slice(-3).join(' | ')}`))
    })
  })
  const start = (label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, onLine?: (line: string) => void) => {
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
  // Each child leads its own process group (detached), so one signal to the group reaches the children it started too,
  // also when the leader has ended and they still run.
  const stopAll = async () => {
    for (const { pid } of groups) if (groupAlive(pid)) try { process.kill(-pid, 'SIGTERM') } catch { /* already gone */ }
    for (let i = 0; i < KILL_AFTER_MS / 250 && groups.some(({ pid }) => groupAlive(pid)); i++) await sleep(250)
    for (const { pid } of groups) if (groupAlive(pid)) try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
    await sleep(500)
  }
  // One cleanup, awaited by every caller (the end of the run, each signal, the time limit), so none can exit before it ends.
  // The handlers stay (`on`, not `once`): a second Ctrl-C must wait for the cleanup too, not end the process in the middle of it.
  let cleanup: Promise<void> | undefined
  const finish = () => cleanup ??= (async () => {
    await stopAll()
    restoreBackend({ backendDir, aside, kept })
    rmSync(work, { recursive: true, force: true })
    rmSync(LOCK, { force: true })
  })()
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) process.on(signal, () => { void finish().then(() => process.exit(code)) })
  const limit = setTimeout(() => {
    console.error(`gate 7 took longer than ${GATE_TIMEOUT_MS / 60_000} minutes. Stopping everything.`)
    void finish().then(() => process.exit(124))
  }, GATE_TIMEOUT_MS)
  limit.unref()

  console.log(`templates test ${name} --platform: logs ${logs}`)
  try {
    // 1. Local Convex backend (as `local:dev` starts it), then its env variables for sign-in.
    const convexEnv = { ...process.env, GINKO_LOCAL: '1', CONVEX_AGENT_MODE: 'anonymous' }
    let ready = false
    const convex = start('convex', 'npx', ['convex', 'dev'], backendDir, convexEnv, (line) => { if (CONVEX_READY.test(line)) ready = true })
    let admin = ''
    if (!await must('local Convex backend starts', async () => {
      await waitFor('The local Convex backend', async () => ready, 180, convex)
      confirmLocal(backendDir, 'templates test --platform')
      admin = await prepareLocalBackend(backendDir, 'templates test --platform', () => {}, run)
    })) return steps

    // 2. The Studio. It reads packages/ginko-server/.env.local once, so it starts after prepareLocalBackend.
    const studioApp = start('studio', 'pnpm', ['--filter', '@ginko/platform', 'dev'], root, { ...process.env, GINKO_LOCAL: '1' })
    if (!await must('Studio answers on :3100', () => waitFor('The Studio on :3100', answers(`http://localhost:${PORTS.studio}/login`), 240, studioApp))) return steps

    // 3. The platform variant: push withoutFiles(config), the way `local:dev` pushes the schema.
    const config = await loadConfig(join(templateDir, 'ginko.config.ts'))
    const site = config.site
    if (!await must('push withoutFiles(config) (release:devPush)', async () => {
      const schema = serializeSchema(withoutFiles(config) as SiteInput)
      await run('npx', ['convex', 'run', 'release:devPush', JSON.stringify({ site, schema })], backendDir, targetEnv(confirmLocal(backendDir)))
    })) return steps

    // 4. Content: the template's files, dates moved to this week by the rule create-ginko uses (T10), exported and
    // imported by the monorepo tools. The shifted copy lives in the work folder; its config re-exports the template's.
    const content = join(work, 'site')
    const exportDir = join(work, 'export')
    if (!await must('files content moves in (local:files-export, local:import)', async () => {
      mkdirSync(content)
      writeFileSync(join(content, 'ginko.config.ts'), `export { default } from ${JSON.stringify(pathToFileURL(join(templateDir, 'ginko.config.ts')).href)}\n`)
      for (const folder of ['content', 'public']) if (existsSync(join(templateDir, folder))) cpSync(join(templateDir, folder), join(content, folder), { recursive: true })
      const anchor = pkg.ginko?.sampleAnchor
      if (!anchor) throw new Error('package.json needs "ginko": { "sampleAnchor": "YYYY-MM-DD" }')
      const days = weeksShift(anchor, new Date().toISOString().slice(0, 10))
      shiftDates(content, manifestOf(config).shift, days)
      const monorepo = ['--experimental-strip-types', join(root, 'packages/ginko/src/cli/monorepo.ts')]
      await run('node', [...monorepo, 'files-export', '--config', join(content, 'ginko.config.ts'), exportDir], root)
      await run('node', [...monorepo, 'import', exportDir], root)
    })) return steps

    // 5. The site on :3000 with the platform layer (no brick reads files). The specs prove that its content comes from the Studio.
    const siteApp = start('site', 'pnpm', ['exec', 'nuxt', 'dev', '--port', String(PORTS.site), '--extends', join(root, 'scripts/templates/platform-layer')], templateDir, { ...process.env, GINKO_LOCAL: '1', NUXT_IGNORE_LOCK: '1' })
    if (!await must('site answers on :3000', () => waitFor('The site on :3000', answers(`http://localhost:${PORTS.site}/`), 240, siteApp))) return steps

    // 6. The Studio jobs. Playwright runs as a child (not a blocking call), so a signal or the time limit still stops it.
    const specs = studioSpecDirs(root, name, pkg.ginko?.features ?? [])
    // What the template calls the content of the shared jobs (brick keys, labels, page paths): templates/_studio/<name>/jobs.json.
    const jobs = join(root, 'templates/_studio', name, 'jobs.json')
    if (!specs.length) return [...steps, { check: 'Studio specs', ok: false, detail: `No Studio spec for ${name}: add templates/_features/<feature>/e2e/studio/*.spec.ts for a feature it syncs, or templates/_studio/${name}/*.spec.ts.` }]
    const playwright = start('studio-e2e', join(root, 'node_modules/.bin/playwright'), ['test', '-c', 'scripts/templates/platform.playwright.config.ts', '--output', join(logs, 'pw'), ...specs], root, {
      ...process.env, TEMPLATE_NAME: name, TEMPLATE_SITE: site, TEMPLATE_SITE_URL: `http://localhost:${PORTS.site}`, TEMPLATE_STUDIO_URL: `http://localhost:${PORTS.studio}`, TEMPLATE_ADMIN: admin, TEMPLATE_AUTH: join(work, 'auth.json'),
      TEMPLATE_STUDIO: existsSync(jobs) ? JSON.stringify(JSON.parse(readFileSync(jobs, 'utf8'))) : '{}',
    })
    const status = await new Promise<number | null>((done) => { playwright.once('close', done); playwright.once('error', () => done(null)) })
    const text = readFileSync(join(logs, 'studio-e2e.log'), 'utf8').replace(/\u001b\[[0-9;]*m/g, '')
    note(`Studio e2e (${specs.map((dir) => dir.replace('templates/_features/', '').replace('/e2e/studio', '').replace('templates/_studio/', '')).join(', ')})`, status === 0, `${text}\n(full report: ${relative(root, join(logs, 'studio-e2e.log'))})`)
  } catch (error) {
    note('gate 7 run', false, error instanceof Error ? error.stack ?? error.message : String(error))
  } finally {
    clearTimeout(limit)
    await finish()
    // Nothing of ours may be left: the ports are free again.
    const left = []
    for (const port of Object.values(PORTS)) if (await listening(port)) left.push(port)
    if (left.length) note('everything stopped', false, `Port ${left.join(', ')} still answers after the stop.`)
  }
  return steps
}
