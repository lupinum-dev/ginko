// Gate 7 of spec TEMPLATES.md §9: `pnpm templates test <name> --platform`. Proves that a template's Studio jobs work on the
// platform. It starts a LOCAL Convex backend, the Studio (:3100) and the template site (:3000) in platform mode,
// pushes `withoutFiles(config)`, moves the template's content in (`local:files-export`, then `local:import`, with the
// sample dates shifted to this week), runs the Studio e2e specs and checks the site shows the change.
// Everything it starts is stopped at the end, and the local backend's data is put back as it was: the folders
// packages/ginko-server/.convex, .env.local and convex/_generated are copied aside, .convex and .env.local are removed so
// every run starts on a fresh anonymous backend, and the copies come back at the end. A state file in the temp folder
// names the child processes and the copy; the next run cleans up after a run that was killed. A signal or the time limit
// (GATE_TIMEOUT_MS) stops everything the same way (scripts/lib/runs.ts, shared with `pnpm e2e:platform`). What the template calls the content of the shared jobs is in
// templates/_studio/<template>/jobs.json. Logs: GINKO_PLATFORM_LOGS, else a work folder.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serializeSchema, withoutFiles, type SiteInput } from '../../packages/ginko/src/core/index.ts'
import { loadConfig } from '../../packages/ginko/src/cli/config.ts'
import { confirmLocal, findBackend, knownTargetError, prepareLocalBackend, readDeploymentTarget, targetEnv } from '../../packages/ginko/src/cli/local.ts'
import { manifestOf, shiftDates, weeksShift } from '../../packages/create-ginko/template-files.mjs'
import { answers, busyPorts, CONVEX_READY, PLATFORM_PORTS, recoverCrashedRun, startSession, waitFor } from '../lib/runs.ts'

export type Step = { check: string; ok: boolean; detail?: string }

/** The ports gate 7 alone uses among the templates (spec §2). */
const PORTS = PLATFORM_PORTS
/** The whole run may not take longer than this; then everything is stopped and the gate fails. */
const GATE_TIMEOUT_MS = 40 * 60_000
/** Backend entries the run changes. `.convex` and `.env.local` are also removed, so the run starts on a fresh backend. */
const TOUCHED = ['.convex', '.env.local', 'convex/_generated']

/**
 * The folders with the Studio specs for a template: `templates/_features/<feature>/e2e/studio/` of every feature it
 * syncs, plus `templates/_studio/<template>/` for the jobs of its own sections. Only folders that exist and hold a spec.
 */
export function studioSpecDirs(root: string, name: string, features: string[]): string[] {
  return [...features.map((f) => `templates/_features/${f}/e2e/studio`), `templates/_studio/${name}`]
    .filter((dir) => existsSync(join(root, dir)) && readdirSync(join(root, dir)).some((file) => file.endsWith('.spec.ts')))
}

/**
 * The Files library takes JPEG, PNG, WebP and PDF only, and `local:files-export` stops at an SVG with "Convert them"
 * (the sample partner logos of nonprofit, events and company are SVG). In the work copy only, each SVG of `public/`
 * becomes a PNG at twice its size, and the content's references follow, as an owner would do before moving in.
 * sharp comes from the template's own dependencies.
 */
async function rasterizeSvgImages(site: string, templateDir: string) {
  const files = (dir: string): string[] => existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((file) => join(dir, file)) : []
  const svgs = files(join(site, 'public')).filter((file) => file.endsWith('.svg'))
  if (!svgs.length) return
  const sharp = createRequire(join(templateDir, 'package.json'))('sharp') as (input: string, options: { density: number }) => { png(): { toFile(path: string): Promise<unknown> } }
  for (const svg of svgs) {
    await sharp(svg, { density: 144 }).png().toFile(svg.replace(/\.svg$/, '.png'))
    rmSync(svg)
  }
  const paths = svgs.map((svg) => `/${relative(join(site, 'public'), svg)}`)
  for (const file of files(join(site, 'content')).filter((file) => file.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8')
    const next = paths.reduce((out, path) => out.replaceAll(path, path.replace(/\.svg$/, '.png')), text)
    if (next !== text) writeFileSync(file, next)
  }
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
  const busy = await busyPorts(Object.values(PORTS))
  if (busy.length) { note('preflight', false, `Port ${busy.join(', ')} is in use (gate 7 needs ${Object.values(PORTS).join(', ')}). Stop what runs there, or wait for it, and run again.`); return steps }

  const logs = process.env.GINKO_PLATFORM_LOGS ?? mkdtempSync(join(tmpdir(), `ginko-platform-${name}-`))
  mkdirSync(logs, { recursive: true })
  // The backend's data as found: copied aside now, put back at the end (also when this run fails). .convex and
  // .env.local are removed, so the run does not depend on what the developer's backend holds.
  const work = mkdtempSync(join(tmpdir(), `ginko-platform-work-${name}-`))
  const session = startSession({ name: `gate 7 (${name})`, base: backendDir, touched: TOUCHED, fresh: ['.convex', '.env.local'], scratch: [work], logs, timeoutMs: GATE_TIMEOUT_MS })
  const { start, run } = session

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
      await rasterizeSvgImages(content, templateDir)
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
    await session.finish()
    // Nothing of ours may be left: the ports are free again.
    const left = await busyPorts(Object.values(PORTS))
    if (left.length) note('everything stopped', false, `Port ${left.join(', ')} still answers after the stop.`)
  }
  return steps
}
