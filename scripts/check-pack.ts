// Release gate: the packages work outside this monorepo. Packs every released package and checks its
// manifest, license and publint; creates a site with create-ginko and a copy of sites/docs, installs both
// from the tarballs with npm, builds them, checks a few URLs and runs the packaged `ginko check`.
// Takes 1–3 minutes (npm install). Run: pnpm check:pack
import { execSync, spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = join(import.meta.dirname, '..')
// Its own folder and free ports, so several checkouts can run the gate at the same time.
const work = mkdtempSync(join(tmpdir(), 'ginko-check-pack-'))
const tgz = join(work, 'tgz')
mkdirSync(tgz, { recursive: true })
const run = (cmd: string, cwd: string) => execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' })

// The packages of the release: the fixed group in .changeset/config.json. The others (server, Studio,
// editor, agency preset) stay private and run only on the hosted platform.
const released: string[] = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8')).fixed[0]
const dirOf = Object.fromEntries(readdirSync(join(root, 'packages')).map((dir) => [JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')).name as string, dir]))
const tarball: Record<string, string> = {}
const failures: string[] = []
for (const name of released) {
  const dir = join(root, 'packages', dirOf[name]!)
  const out = run(`pnpm pack --pack-destination ${tgz}`, dir).trim().split('\n').at(-1)!
  const file = out.startsWith('/') ? out : join(tgz, out)
  tarball[name] = `file:${file}`
  // What npm users get: the license text, and no dependency that only resolves inside this repo.
  const listing = run(`tar -tzf ${file}`, tgz)
  if (!listing.includes('package/LICENSE')) failures.push(`${name}: the tarball has no LICENSE`)
  const manifest = JSON.parse(run(`tar -xOzf ${file} package/package.json`, tgz))
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries<string>(manifest[field] ?? {})) {
      if (/^(file|link|workspace|portal):/.test(range)) failures.push(`${name}: ${field}.${dep} is "${range}"`)
    }
  }
  try {
    run(`pnpm exec publint run ${file} --strict`, root)
  } catch (error) {
    failures.push(`${name} publint:\n${error instanceof Error && 'stdout' in error ? String(error.stdout) : String(error)}`)
  }
}

/** Points the Ginko dependencies (also nested ones, via overrides) at the tarballs. */
function useTarballs(siteDir: string, extra: Record<string, string> = {}) {
  const path = join(siteDir, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  for (const name of Object.keys(pkg.dependencies ?? {})) if (tarball[name]) pkg.dependencies[name] = tarball[name]
  Object.assign(pkg.dependencies, extra)
  pkg.overrides = Object.fromEntries(Object.entries(tarball).filter(([n]) => n !== 'create-ginko'))
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}

/** Types from the tarballs: a site gets typed composables (runs after serve() installed the site). */
function typecheck(siteDir: string): string[] {
  try {
    run('npx nuxi typecheck', siteDir)
    return []
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error ? String(error.stdout) : String(error)
    return [`${siteDir} typecheck:\n${output.slice(0, 2000)}`]
  }
}

/** The packaged CLI runs in a new site (after serve() installed it). */
function ginkoCheck(siteDir: string): string[] {
  try {
    run('npx ginko check', siteDir)
    return []
  } catch (error) {
    return [`${siteDir} ginko check:\n${error instanceof Error && 'stdout' in error ? `${String(error.stdout)}${String((error as { stderr?: unknown }).stderr ?? '')}` : String(error)}`.slice(0, 2000)]
  }
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function serve(siteDir: string, port: number, checks: [string, RegExp][]) {
  run('npm install --no-audit --no-fund --loglevel=error', siteDir)
  run('npx nuxt build', siteDir)
  const server = spawn('node', ['.output/server/index.mjs'], { cwd: siteDir, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  const failures: string[] = []
  try {
    await sleep(1500)
    for (const [path, expect] of checks) {
      const res = await fetch(`http://localhost:${port}${path}`)
      const body = await res.text()
      if (res.status !== 200 || !expect.test(body)) failures.push(`${siteDir} ${path}: ${res.status}`)
    }
  } finally {
    server.kill()
  }
  return failures
}

// 1. A new site from create-ginko (files only, no platform).
run(`node ${join(root, 'packages/create-ginko/index.mjs')} starter`, work)
useTarballs(join(work, 'starter'))
// 2. The docs site on the docs layer.
const docs = join(work, 'docs')
mkdirSync(docs)
for (const f of ['app', 'content', 'public', 'ginko.config.ts', 'nuxt.config.ts', 'tsconfig.json']) cpSync(join(root, 'sites/docs', f), join(docs, f), { recursive: true })
// The dependencies of sites/docs itself (nuxt-og-image, typescript and the like); the Ginko ones point at the tarballs below.
const docsPkg = JSON.parse(readFileSync(join(root, 'sites/docs/package.json'), 'utf8'))
writeFileSync(join(docs, 'package.json'), JSON.stringify({ name: 'docs', private: true, type: 'module', dependencies: docsPkg.dependencies, devDependencies: docsPkg.devDependencies }))
// The shipped declarations must type the composables: if useGinko is `any`, the expect-error below is unused and typecheck fails.
mkdirSync(join(docs, 'app/utils'), { recursive: true })
writeFileSync(join(docs, 'app/utils/ginko-types.ts'), `export function probe() {
  // @ts-expect-error a docs entry is not a number
  const n: number = useGinko('docs').value.items[0]
  return n
}
`)
useTarballs(docs)

failures.push(
  ...await serve(join(work, 'starter'), await freePort(), [['/', /<h1>Hallo Ginko<\/h1>/], ['/sitemap.xml', /<urlset/]]),
  ...await serve(docs, await freePort(), [['/docs/einstieg', /class="docs-sidebar/], ['/en/docs/getting-started', /lang="en"/], ['/__ginko/search/de.json', /"url":"\/docs\//]]),
  ...typecheck(docs),
  ...ginkoCheck(join(work, 'starter')),
)
console.log(failures.length ? `FAIL check:pack\n${failures.join('\n')}` : 'OK check:pack: starter and docs build and serve from the tarballs')
// A failed run keeps its folder for a look at the sites; a passed one cleans up.
if (!failures.length) rmSync(work, { recursive: true, force: true })
process.exit(failures.length ? 1 : 0)
