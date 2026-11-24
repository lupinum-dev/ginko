// `pnpm check:platform-install`: a person's first walk with the platform, in a new folder outside this repository.
//
// 1. Packs create-ginko and the packages a platform project installs (@lupinum/ginko, -server, -studio and their
//    @lupinum dependencies) from this checkout.
// 2. Runs the packed create-ginko with --platform in a temp folder, points the @lupinum dependencies at the tarballs and
//    installs with npm. convex.json must name a folder that exists after the install.
// 3. Starts `npm run dev` (ginko-platform dev) and waits for its "The Studio runs on" block.
// 4. In Chromium: signs in as admin@example.test with the code that `npm run dev` printed, creates a site on the
//    "New site" page and must land on its Content page (screenshot: content-page.png).
// 5. Ctrl-C (SIGINT to the process group, as a terminal sends it) must stop everything: the ports are free again.
//
// Each step prints its name; a failed step says which one and shows the end of the dev log. Exit 0 or 1.
// Needs ports 3100, 3210 and 3211 free. Takes one heavy-run slot (scripts/lib/runs.ts); GINKO_NO_LOAD_WAIT=1 skips the
// load wait (CI). Logs and the screenshot: GINKO_PLATFORM_INSTALL_LOGS, else the temp folder (kept after a failure).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { busyPorts, heavyLock, waitForCalm } from './lib/runs.ts'

const root = join(import.meta.dirname, '..')
const NAME = 'check:platform-install'
const PORTS = [3100, 3210, 3211]
const STUDIO = 'http://localhost:3100'
const ADMIN = 'admin@example.test'
const SITE = { name: 'Install check', url: 'https://install-check.example', id: 'install-check' }

const work = mkdtempSync(join(tmpdir(), 'ginko-platform-install-'))
const logs = process.env.GINKO_PLATFORM_INSTALL_LOGS ?? join(work, 'logs')
mkdirSync(logs, { recursive: true })
const devLog = join(logs, 'dev.log')
const project = join(work, 'my-cms')
let dev: ChildProcess | undefined
/** npm ends by the signal after Ctrl-C: then exitCode stays null and signalCode is set. */
const ended = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null
const output: string[] = []

/** Runs one named step; a failure stops the check with the step's name. */
async function step<T>(name: string, run: () => Promise<T> | T): Promise<T> {
  const started = Date.now()
  console.log(`${NAME}: ${name} …`)
  try {
    const result = await run()
    console.log(`${NAME}: ${name} done (${Math.round((Date.now() - started) / 1000)} s)`)
    return result
  } catch (error) {
    console.error(`\n${NAME}: FAILED at "${name}": ${error instanceof Error ? error.message : String(error)}`)
    if (output.length) console.error(`\nLast lines of npm run dev (all of it: ${devLog}):\n${output.slice(-60).join('\n')}`)
    console.error(`\nLogs: ${logs}`)
    await stopDev()
    process.exit(1)
  }
}

const sh = (command: string, args: string[], cwd: string, log?: string) => {
  try {
    const out = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
    if (log) writeFileSync(join(logs, log), out)
    return out
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string }
    if (log) writeFileSync(join(logs, log), `${stdout}${stderr}`)
    throw new Error(`${command} ${args.join(' ')} failed:\n${`${stdout}${stderr}`.trim().split('\n').slice(-30).join('\n')}`)
  }
}

/** Waits until `check` is true; throws `what` after `seconds`, or at once when the dev process ended. */
async function until(what: string, seconds: number, check: () => boolean | Promise<boolean>) {
  for (const end = Date.now() + seconds * 1000; Date.now() < end;) {
    if (await check()) return
    if (dev && ended(dev)) throw new Error(`npm run dev ended (${dev.exitCode ?? dev.signalCode}) before ${what}`)
    await sleep(500)
  }
  throw new Error(`${what}: not within ${seconds} s`)
}

/** Ctrl-C as a terminal sends it: SIGINT to the whole process group of `npm run dev`. Then SIGKILL after 30 s. */
async function stopDev() {
  if (!dev?.pid || ended(dev)) return
  try { process.kill(-dev.pid, 'SIGINT') } catch { /* gone */ }
  for (let i = 0; i < 60 && !ended(dev); i++) await sleep(500)
  if (!ended(dev)) try { process.kill(-dev.pid, 'SIGKILL') } catch { /* gone */ }
}

// Ctrl-C on this check stops the platform it started, too (its processes lead their own process groups).
process.once('SIGINT', () => { void stopDev().then(() => process.exit(130)) })

await heavyLock(`pnpm ${NAME}`)
await waitForCalm()
const busy = await busyPorts(PORTS)
if (busy.length) {
  console.error(`${NAME}: port ${busy.join(', ')} is in use; the platform needs ${PORTS.join(', ')}. Stop what runs there and run again.`)
  process.exit(1)
}
console.log(`${NAME}: working in ${work}`)

// 1. The tarballs: create-ginko, then the platform packages and every @lupinum package they depend on in this checkout.
const tgz = join(work, 'tgz')
mkdirSync(tgz)
const manifests = Object.fromEntries(readdirSync(join(root, 'packages')).map((dir) => {
  const pkg = JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) as { name: string; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
  return [pkg.name, { dir, pkg }]
}))
const needed = new Set<string>()
const add = (name: string) => {
  if (needed.has(name) || !manifests[name]) return
  needed.add(name)
  const { pkg } = manifests[name]!
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) add(dep)
}
for (const name of ['@lupinum/ginko', '@lupinum/ginko-server', '@lupinum/ginko-studio']) add(name)
const tarball: Record<string, string> = {}
await step(`pack create-ginko and ${[...needed].join(', ')}`, () => {
  for (const name of ['create-ginko', ...needed]) {
    const out = sh('pnpm', ['pack', '--pack-destination', tgz], join(root, 'packages', manifests[name]!.dir), `pack-${manifests[name]!.dir}.log`).trim().split('\n').at(-1)!
    tarball[name] = out.startsWith('/') ? out : join(tgz, out)
  }
})

// 2. The project, from the packed create-ginko, installed with npm from the tarballs.
await step('create-ginko my-cms --platform (packed)', () => {
  const unpacked = join(work, 'create-ginko')
  mkdirSync(unpacked)
  sh('tar', ['-xzf', tarball['create-ginko']!, '-C', unpacked], work)
  console.log(sh('node', [join(unpacked, 'package/index.mjs'), 'my-cms', '--platform'], work).trim().split('\n').map((line) => `  ${line}`).join('\n'))
})
await step('point the @lupinum dependencies at the tarballs', () => {
  const path = join(project, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { dependencies: Record<string, string>; overrides?: Record<string, string> }
  const lupinum = Object.fromEntries([...needed].map((name) => [name, `file:${tarball[name]}`]))
  for (const name of Object.keys(pkg.dependencies)) if (lupinum[name]) pkg.dependencies[name] = lupinum[name]
  // Nested @lupinum dependencies (the Studio's editor and components) resolve to the tarballs too.
  pkg.overrides = lupinum
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
})
await step('npm install', () => { sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], project, 'npm-install.log') })
await step('convex.json names a folder that exists', () => {
  const { functions } = JSON.parse(readFileSync(join(project, 'convex.json'), 'utf8')) as { functions: string }
  if (!existsSync(join(project, functions, 'convex.config.ts'))) throw new Error(`convex.json: functions is "${functions}", but ${join(functions, 'convex.config.ts')} does not exist after npm install`)
})

// 3. npm run dev, as a person starts it. CONVEX_DEPLOY_KEY and the like are removed: the check is local only.
await step('npm run dev until the Studio is ready', async () => {
  const env = { ...process.env }
  for (const key of ['CONVEX_DEPLOYMENT', 'CONVEX_URL', 'CONVEX_DEPLOY_KEY', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_SELF_HOSTED_URL']) delete env[key]
  dev = spawn('npm', ['run', 'dev'], { cwd: project, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [dev.stdout!, dev.stderr!]) {
    let rest = ''
    stream.setEncoding('utf8').on('data', (chunk: string) => {
      appendFileSync(devLog, chunk)
      const lines = (rest + chunk).split('\n')
      rest = lines.pop() ?? ''
      output.push(...lines)
    })
  }
  await until('the line "The Studio runs on"', 600, () => output.some((line) => line.startsWith('The Studio runs on')))
  await until(`${STUDIO}/login answers 200`, 300, async () => (await fetch(`${STUDIO}/login`).catch(() => undefined))?.status === 200)
})

// 4. The browser walk.
const codeLine = new RegExp(`^Sign-in code for ${ADMIN.replaceAll('.', '\\.')}: (\\d{6})$`)
const browser = await step('start Chromium', () => chromium.launch())
const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(60_000)
await step(`sign in as ${ADMIN} with the code from the terminal`, async () => {
  // The first page compiles the Studio in `nuxt dev`; on a cold runner that takes a while.
  await page.goto(`${STUDIO}/login`, { waitUntil: 'networkidle', timeout: 300_000 })
  await page.getByLabel('Email address').fill(ADMIN)
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').waitFor()
  let code: string | undefined
  await until('the sign-in code line in the output of npm run dev', 60, () => {
    code = output.map((line) => codeLine.exec(line)?.[1]).findLast(Boolean)
    return code !== undefined
  })
  await page.getByLabel('Code').fill(code!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
})
await step('create a site on the "New site" page', async () => {
  await page.getByRole('link', { name: 'New site' }).click()
  await page.waitForURL(`${STUDIO}/new`)
  await page.getByLabel('Name', { exact: true }).fill(SITE.name)
  await page.getByLabel('Website address').fill(SITE.url)
  await page.getByLabel('Identifier').fill(SITE.id)
  await page.getByRole('button', { name: 'Create site' }).click()
})
await step('land on the Content page of the new site', async () => {
  await page.waitForURL(`${STUDIO}/s/${SITE.id}/all`)
  await page.getByRole('heading', { level: 1, name: 'Content' }).waitFor()
  await page.screenshot({ path: join(logs, 'content-page.png') })
})
await browser.close()

// 5. Ctrl-C stops everything.
await step('Ctrl-C stops npm run dev and every process it started', async () => {
  await stopDev()
  await until(`ports ${PORTS.join(', ')} free again`, 30, async () => (await busyPorts(PORTS)).length === 0)
})
console.log(`OK ${NAME}: a new platform project from the tarballs installs with npm, starts with npm run dev, signs in the admin with the printed code, creates a site and opens its Content page. Screenshot: ${join(logs, 'content-page.png')}`)
if (!process.env.GINKO_PLATFORM_INSTALL_LOGS) {
  // Keep the logs and the screenshot; remove the project and the tarballs.
  for (const entry of readdirSync(work)) if (entry !== 'logs') rmSync(join(work, entry), { recursive: true, force: true })
} else rmSync(work, { recursive: true, force: true })
