// Gate 7 of spec TEMPLATES.md §9: `pnpm templates test <name> --platform`. Proves that a template's Studio jobs work on the
// platform. It starts a LOCAL Convex backend, the Studio (:3100) and the template site (:3000) in platform mode,
// pushes `withoutFiles(config)`, moves the template's content in (`local:files-export`, then `local:import`, with the
// sample dates shifted to this week), runs the Studio e2e specs and checks the site shows the change.
// Everything it starts is stopped at the end, and the local backend's data is put back as it was (the folder
// packages/ginko-server/.convex and .env.local are copied aside first). Logs: GINKO_PLATFORM_LOGS, else a work folder.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { serializeSchema, withoutFiles, type SiteInput } from '../../packages/ginko/src/core/index.ts'
import { loadConfig } from '../../packages/ginko/src/cli/config.ts'
import { confirmLocal, findBackend, prepareLocalBackend, runOnce, targetEnv } from '../../packages/ginko/src/cli/local.ts'
import { manifestOf, shiftDates, weeksShift } from '../../packages/create-ginko/template-files.mjs'

export type Step = { check: string; ok: boolean; detail?: string }

/** The ports gate 7 alone uses (spec §2): the site, the Studio and the local Convex backend with its HTTP actions. */
const PORTS = { site: 3000, studio: 3100, convex: 3210, convexSite: 3211 }
/** `convex dev` prints one of these once the local backend serves its functions. */
const CONVEX_READY = /Convex functions ready|Watching for changes/
const KILL_AFTER_MS = 5_000

/**
 * The folders with the Studio specs for a template: `templates/_features/<feature>/e2e/studio/` of every feature it
 * syncs, plus one named after the template for the jobs of its own sections. Only folders that exist.
 */
export function studioSpecDirs(root: string, name: string, features: string[]): string[] {
  return [...new Set([...features, name])].map((f) => `templates/_features/${f}/e2e/studio`).filter((dir) => existsSync(join(root, dir)) && readdirSync(join(root, dir)).some((file) => file.endsWith('.spec.ts')))
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

/** What the last probe saw, named in the timeout message. */
let lastSeen = ''

async function waitFor(what: string, ready: () => Promise<boolean>, seconds: number) {
  lastSeen = ''
  for (let i = 0; i < seconds * 2; i++) {
    if (await ready()) return
    await sleep(500)
  }
  throw new Error(`${what} was not ready after ${seconds} s${lastSeen ? ` (last answer: ${lastSeen})` : ''}`)
}

const answers = (url: string, needle?: string) => async () => {
  const response = await fetch(url).catch((error: Error) => { lastSeen = String(error.cause ?? error.message); return undefined })
  if (!response) return false
  const body = await response.text()
  lastSeen = `HTTP ${response.status} ${body.replace(/\s+/g, ' ').slice(0, 300)}`
  if (response.status >= 500) return false
  return needle ? body.includes(needle) : true
}

export async function platformGate(name: string, root: string): Promise<Step[]> {
  const steps: Step[] = []
  const logs = process.env.GINKO_PLATFORM_LOGS ?? mkdtempSync(join(tmpdir(), `ginko-platform-${name}-`))
  mkdirSync(logs, { recursive: true })
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

  // Before anything starts or is changed: no cloud key, and the ports are ours.
  if (process.env.CONVEX_DEPLOY_KEY) return [{ check: 'preflight', ok: false, detail: 'CONVEX_DEPLOY_KEY is set: gate 7 writes data and runs against the local backend only. Stopped.' }]
  const busy: number[] = []
  for (const port of Object.values(PORTS)) if (await listening(port)) busy.push(port)
  if (busy.length) return [{ check: 'preflight', ok: false, detail: `Port ${busy.join(', ')} is in use (gate 7 needs ${Object.values(PORTS).join(', ')}). Stop what runs there, or wait for it, and run again.` }]

  // The backend's data as found: copied aside now, put back at the end (also when this run fails).
  const aside = mkdtempSync(join(tmpdir(), 'ginko-platform-aside-'))
  // `convex dev` also regenerates convex/_generated.
  const touched = ['.convex', '.env.local', 'convex/_generated']
  const kept = touched.filter((entry) => existsSync(join(backendDir, entry)))
  for (const entry of kept) cpSync(join(backendDir, entry), join(aside, entry), { recursive: true, verbatimSymlinks: true })
  const children: ChildProcess[] = []
  const start = (label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, onLine?: (line: string) => void) => {
    const log = join(logs, `${label}.log`)
    writeFileSync(log, '')
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8').on('data', (chunk: string) => {
        writeFileSync(log, chunk, { flag: 'a' })
        if (onLine) for (const line of chunk.split('\n')) onLine(line)
      })
    }
    return child
  }
  const stopAll = async () => {
    for (const child of children) if (child.exitCode === null && child.pid) try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
    for (let i = 0; i < KILL_AFTER_MS / 250 && children.some((c) => c.exitCode === null); i++) await sleep(250)
    for (const child of children) if (child.exitCode === null && child.pid) try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
    await sleep(500)
  }
  const restore = () => {
    for (const entry of touched) rmSync(join(backendDir, entry), { recursive: true, force: true })
    for (const entry of kept) cpSync(join(aside, entry), join(backendDir, entry), { recursive: true, verbatimSymlinks: true })
    rmSync(aside, { recursive: true, force: true })
  }
  let finished = false
  const finish = async () => {
    if (finished) return
    finished = true
    await stopAll()
    restore()
  }
  process.once('SIGINT', () => { void finish().then(() => process.exit(130)) })
  process.once('SIGTERM', () => { void finish().then(() => process.exit(143)) })

  const work = mkdtempSync(join(tmpdir(), `ginko-platform-work-${name}-`))
  console.log(`templates test ${name} --platform: logs ${logs}`)
  try {
    // 1. Local Convex backend (as `local:dev` starts it), then its env variables for sign-in.
    const convexEnv = { ...process.env, GINKO_LOCAL: '1', CONVEX_AGENT_MODE: 'anonymous' }
    let ready = false
    start('convex', 'npx', ['convex', 'dev'], backendDir, convexEnv, (line) => { if (CONVEX_READY.test(line)) ready = true })
    let admin = ''
    if (!await must('local Convex backend starts', async () => {
      await waitFor('The local Convex backend', async () => ready, 180)
      confirmLocal(backendDir, 'templates test --platform')
      admin = await prepareLocalBackend(backendDir, 'templates test --platform', () => {}, runOnce)
    })) return steps

    // 2. The Studio. It reads packages/ginko-server/.env.local once, so it starts after prepareLocalBackend.
    start('studio', 'pnpm', ['--filter', '@ginko/platform', 'dev'], root, { ...process.env, GINKO_LOCAL: '1' })
    if (!await must('Studio answers on :3100', () => waitFor('The Studio on :3100', answers(`http://localhost:${PORTS.studio}/login`), 240))) return steps

    // 3. The platform variant: push withoutFiles(config), the way `local:dev` pushes the schema.
    const config = await loadConfig(join(templateDir, 'ginko.config.ts'))
    const site = config.site
    if (!await must('push withoutFiles(config) (release:devPush)', async () => {
      const schema = serializeSchema(withoutFiles(config) as SiteInput)
      await runOnce('npx', ['convex', 'run', 'release:devPush', JSON.stringify({ site, schema })], backendDir, targetEnv(confirmLocal(backendDir)))
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
      await runOnce('node', [...monorepo, 'files-export', '--config', join(content, 'ginko.config.ts'), exportDir], root)
      await runOnce('node', [...monorepo, 'import', exportDir], root)
    })) return steps

    // 5. The site on :3000 in platform mode.
    start('site', 'pnpm', ['exec', 'nuxt', 'dev', '--port', String(PORTS.site), '--extends', join(root, 'scripts/templates/platform-layer')], templateDir, { ...process.env, GINKO_LOCAL: '1', NUXT_IGNORE_LOCK: '1' })
    if (!await must('site answers on :3000 in platform mode', () => waitFor('The site on :3000', answers(`http://localhost:${PORTS.site}/`, String(config.name)), 240))) return steps

    // 6. The Studio jobs.
    const specs = studioSpecDirs(root, name, pkg.ginko?.features ?? [])
    if (!specs.length) return [...steps, { check: 'Studio specs', ok: false, detail: `No Studio spec for ${name}: add templates/_features/<feature>/e2e/studio/*.spec.ts for a feature it syncs.` }]
    const out = spawnSync(join(root, 'node_modules/.bin/playwright'), ['test', '-c', 'scripts/templates/platform.playwright.config.ts', '--output', join(logs, 'pw'), ...specs], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, TEMPLATE_NAME: name, TEMPLATE_SITE: site, TEMPLATE_SITE_URL: `http://localhost:${PORTS.site}`, TEMPLATE_STUDIO_URL: `http://localhost:${PORTS.studio}`, TEMPLATE_ADMIN: admin, TEMPLATE_AUTH: join(work, 'auth.json') },
    })
    const text = `${out.stdout}${out.stderr}`.replace(/\u001b\[[0-9;]*m/g, '')
    writeFileSync(join(logs, 'studio-e2e.log'), text)
    note(`Studio e2e (${specs.map((dir) => dir.replace('templates/_features/', '').replace('/e2e/studio', '')).join(', ')})`, out.status === 0, `${text}\n(full report: ${relative(root, join(logs, 'studio-e2e.log'))})`)
  } catch (error) {
    note('gate 7 run', false, error instanceof Error ? error.stack ?? error.message : String(error))
  } finally {
    await finish()
    rmSync(work, { recursive: true, force: true })
    // Nothing of ours may be left: the ports are free again.
    const left = []
    for (const port of Object.values(PORTS)) if (await listening(port)) left.push(port)
    if (left.length) note('everything stopped', false, `Port ${left.join(', ')} still answers after the stop.`)
  }
  return steps
}
