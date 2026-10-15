// Release gate: the packages work outside this monorepo. Packs every released package and checks its
// manifest, license and publint; creates a site with create-ginko for the plain starter, every preset and every
// template, and a copy of sites/docs, installs them from the tarballs with npm, builds them, checks a few URLs, type-checks
// them and runs the packaged `ginko check`. A second docs site adds the Nuxt SEO modules (@nuxtjs/seo). Every site
// with nuxt-og-image must render its share card. Takes 2–4 minutes (npm install). Run: pnpm check:pack
// `pnpm check:pack --nuxt5` does the same on the Nuxt 5 nightly that the ginko-i18n browser suite pins.
import { exec as execCallback, execSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

const root = join(import.meta.dirname, '..')
// The share cards' signing secret, set as a host sets it (create-ginko writes one into .env, which the server does not read).
process.env.NUXT_APP_SECRET ??= randomBytes(32).toString('hex')
// Its own folder and free ports, so several checkouts can run the gate at the same time.
const work = mkdtempSync(join(tmpdir(), 'ginko-check-pack-'))
const tgz = join(work, 'tgz')
mkdirSync(tgz, { recursive: true })
const run = (cmd: string, cwd: string) => execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' })
// The sites install and build at the same time.
const exec = promisify(execCallback)
const runAsync = (cmd: string, cwd: string) => exec(cmd, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
// The Nuxt 5 nightly comes from one place, the ginko-i18n test app that runs on it.
const nuxt5 = process.argv.includes('--nuxt5')
  ? (JSON.parse(readFileSync(join(root, 'packages/ginko-i18n/browser/apps/n5/package.json'), 'utf8')).dependencies.nuxt as string)
  : undefined
const outputOf = (error: unknown) => (error instanceof Error && 'stdout' in error ? `${String(error.stdout)}${String((error as { stderr?: unknown }).stderr ?? '')}` : String(error))

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
  // `$nuxt` points every nested nuxt (peers of other modules too) at the site's own.
  if (nuxt5) {
    pkg.dependencies.nuxt = nuxt5
    pkg.overrides.nuxt = '$nuxt'
  }
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}

/** Runs one step in a site; a failure becomes a line of the report. */
async function step(siteDir: string, name: string, cmd: string): Promise<string[]> {
  try {
    await runAsync(cmd, siteDir)
    return []
  } catch (error) {
    return [`${siteDir} ${name}:\n${outputOf(error).slice(0, 2000)}`]
  }
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** A URL and what its body must match, or a function that returns the problem it finds. */
type Check = [path: string, expect: RegExp | ((body: string) => string | undefined)]

/** Installs and builds a site, serves it and checks the URLs. Then the types from the tarballs (typed
 * composables, not `any`) and, for a create-ginko site, the packaged `ginko check`. */
async function checkSite(siteDir: string, checks: Check[], { ginkoCheck = true } = {}): Promise<string[]> {
  for (const [name, cmd] of [['npm install', 'npm install --no-audit --no-fund --loglevel=error'], ['nuxt build', 'npx nuxt build']] as const) {
    const failed = await step(siteDir, name, cmd)
    if (failed.length) return failed
  }
  return [
    ...await serve(siteDir, await freePort(), checks),
    // The starters ship their type checker (vue-tsc) and a `typecheck` script; the docs site has vue-tsc in its devDependencies.
    ...await step(siteDir, 'typecheck', 'npx nuxi typecheck'),
    ...(ginkoCheck ? await step(siteDir, 'ginko check', 'npx ginko check') : []),
  ]
}

/** Whether the server answers within 30 s. A fixed wait of 1.5 s failed the gate on a busy machine. */
async function answers(port: number): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) return true
    await sleep(500)
  }
  return false
}

const metaContent = (html: string, property: string) =>
  /content="([^"]*)"/.exec(html.match(new RegExp(`<meta[^>]*property="${property}"[^>]*>`))?.[0] ?? '')?.[1]?.replaceAll('&amp;', '&')
const count = (html: string, pattern: RegExp) => html.match(new RegExp(pattern, 'g'))?.length ?? 0

/**
 * The head of a page of the docs site with @nuxtjs/seo: what broke before Ginko handed the modules its data (a page
 * that rendered at all, a `%siteName` or doubled name in the title, a second canonical, a wrong `<html lang>`, a second
 * WebSite node).
 */
const seoHead = (lang: string) => (html: string) => {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
  const problems = [
    count(html, /<title>/) !== 1 && 'title count',
    (title.includes('%') || title.split('Ginko').length !== 2) && `title "${title}"`,
    count(html, /rel="canonical"/) !== 1 && 'canonical count',
    count(html, /property="og:url"/) !== 1 && 'og:url count',
    !new RegExp(`<html[^>]*lang="${lang}"`).test(html) && 'html lang',
    count(html, /"@type":"WebSite"/) > 1 && 'WebSite twice',
  ].filter(Boolean)
  return problems.length ? problems.join(', ') : undefined
}

/**
 * The core's message catalogs (every language, about 20 kB gzip) belong to the server, the CLI and the Studio. In the
 * built site they reach the browser when a module that page code imports calls a translation at load time. Checked
 * on the scripts the first page loads (entry and module preloads), from the tarballs' dist as sites get it.
 */
async function catalogsInScripts(siteDir: string, port: number, path: string): Promise<string[]> {
  const html = await (await fetch(`http://localhost:${port}${path}`)).text()
  const scripts = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="modulepreload"[^>]*\shref)="([^"]+\.js)"/g)].map((m) => m[1]!)
  const bodies = await Promise.all(scripts.map(async (src) => [src, await (await fetch(`http://localhost:${port}${src}`)).text()] as const))
  // A key of the core catalogs (i18n/<code>.json, issues.unknownBrick): no other code names it.
  return bodies.filter(([, body]) => body.includes('unknownBrick')).map(([src]) => `${siteDir} ${path}: ${src} carries the core message catalogs into the browser`)
}

async function serve(siteDir: string, port: number, checks: Check[]) {
  const server = spawn('node', ['.output/server/index.mjs'], { cwd: siteDir, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  const failures: string[] = []
  try {
    if (!await answers(port)) return [`${siteDir}: the server did not answer within 30 s`]
    for (const [path, expect] of checks) {
      const res = await fetch(`http://localhost:${port}${path}`)
      const body = await res.text()
      const problem = res.status !== 200 ? String(res.status) : typeof expect === 'function' ? expect(body) : expect.test(body) ? undefined : 'no match'
      if (problem) failures.push(`${siteDir} ${path}: ${problem}`)
    }
    failures.push(...await catalogsInScripts(siteDir, port, checks[0]![0]))
    // The share card of the first page, rendered by nuxt-og-image with Ginko's template. Its URL starts with the site's
    // own address, so only the path is asked for here. A site without nuxt-og-image (a template that has none yet) has no card.
    const pkg = JSON.parse(readFileSync(join(siteDir, 'package.json'), 'utf8'))
    if (!pkg.dependencies?.['nuxt-og-image'] && !pkg.devDependencies?.['nuxt-og-image'] && !pkg.dependencies?.['@nuxtjs/seo']) return failures
    const first = await (await fetch(`http://localhost:${port}${checks[0]![0]}`)).text()
    const card = metaContent(first, 'og:image')
    const res = card === undefined ? undefined : await fetch(`http://localhost:${port}${new URL(card).pathname}`)
    if (!res || res.status !== 200 || !res.headers.get('content-type')?.startsWith('image/')) failures.push(`${siteDir} share card ${card ?? '(no og:image)'}: ${res?.status} ${res?.headers.get('content-type')}`)
  } finally {
    server.kill()
  }
  return failures
}

// 1. New sites from create-ginko (files only, no platform): the plain starter and every preset it offers.
// Every preset folder (`<preset>` or `<preset>-<lang>`) becomes a site, so a new preset cannot skip the gate.
// The gastro starters get one more dish, turned off with `onMenu: false`: their menu page must leave it out (dishOn).
// The page payload still carries every dish, so the check reads the rendered names (`<strong>`).
const OFF_MENU = '---\ncategory: soups\nname: Off-season soup\nprice: 7\nveg: vegan\nonMenu: false\n---\n'
const offMenuLeftOut: Check = ['/', (body) => (!body.includes('</strong>') ? 'renders no dish'
  : body.includes('<strong>Off-season soup</strong>') ? 'shows a dish turned off with onMenu: false' : undefined)]
const created: Record<string, Check[]> = {
  starter: [['/', /<h1>Hello Ginko<\/h1>/], ['/sitemap.xml', /<urlset/]],
  gastro: [['/', /<h1>Opening hours<\/h1>[\s\S]*Tomato soup/], offMenuLeftOut],
  'gastro-de': [['/', /<h1>Öffnungszeiten<\/h1>[\s\S]*Tomatensuppe/], offMenuLeftOut],
  docs: [['/docs/getting-started', /class="docs-sidebar/]],
  'docs-de': [['/docs/einstieg', /lang="de"[\s\S]*class="docs-sidebar[\s\S]*Seiten schreiben/]],
  // The templates (templates/<name>, bundled by create-ginko's prepack), all languages.
  'template-starter': [['/', /<h1[^>]*>My site<\/h1>/], ['/about', /<h1[^>]*>About<\/h1>/], ['/sitemap.xml', /<urlset/]],
  'template-restaurant': [['/', /<h1[^>]*>\s*Viennese cooking in a family Gasthaus/], ['/menu', /Liptauer with dark bread/], ['/de/speisekarte', /<html[^>]*lang="de/], ['/sitemap.xml', /<urlset/]],
  'template-nonprofit': [['/', /<h1[^>]*>\s*We look after the river/], ['/news', /A new home for our tools/], ['/ar', /<html[^>]*dir="rtl"/], ['/sitemap.xml', /<urlset/]],
  'template-events': [['/', /<h1[^>]*>\s*Open Data Days/], ['/programme', /Finding stories in public budgets/], ['/de/vortragende', /<html[^>]*lang="de/], ['/sitemap.xml', /<urlset/]],
}
for (const name of ['starter', ...readdirSync(join(root, 'packages/create-ginko/presets'))]) {
  if (!created[name]) failures.push(`check:pack has no URL check for the create-ginko preset folder ${name}`)
  const [preset, lang] = name.split('-')
  const args = name === 'starter' ? '' : `--preset ${preset}${lang ? ` --locales ${lang}` : ''}`
  run(`node ${join(root, 'packages/create-ginko/index.mjs')} ${name} ${args}`, work)
  if (preset === 'gastro') writeFileSync(join(work, name, 'content/menu/5.off-season.md'), OFF_MENU)
  useTarballs(join(work, name))
}
// Every bundled template (pnpm pack ran create-ginko's build above) becomes a site, so a new template cannot skip the gate.
for (const name of readdirSync(join(root, 'packages/create-ginko/templates')).filter((entry) => !entry.endsWith('.json'))) {
  if (!created[`template-${name}`]) failures.push(`check:pack has no URL check for the create-ginko template ${name}`)
  run(`node ${join(root, 'packages/create-ginko/index.mjs')} template-${name} --template ${name}`, work)
  useTarballs(join(work, `template-${name}`))
}
// 2. The docs site on the docs layer.
const docs = join(work, 'docs-site')
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
// 3. The same docs site with the Nuxt SEO modules (internals/decisions.md D4): they own sitemap and robots.txt, Ginko
// hands them its URLs, address, name and languages. @nuxtjs/seo brings its own nuxt-og-image.
const docsSeo = join(work, 'docs-seo')
cpSync(docs, docsSeo, { recursive: true })
const seoPkg = JSON.parse(readFileSync(join(docsSeo, 'package.json'), 'utf8'))
delete seoPkg.dependencies['nuxt-og-image']
delete seoPkg.devDependencies['nuxt-og-image']
seoPkg.dependencies['@nuxtjs/seo'] = '6.0.1'
writeFileSync(join(docsSeo, 'package.json'), JSON.stringify(seoPkg, null, 2))
const seoConfig = join(docsSeo, 'nuxt.config.ts')
writeFileSync(seoConfig, readFileSync(seoConfig, 'utf8').replace(/modules: \[[^\]]*\]/, `modules: ['@nuxtjs/seo', '@lupinum/ginko/nuxt']`))

const results = await Promise.all([
  ...Object.entries(created).map(([name, checks]) => checkSite(join(work, name), checks)),
  checkSite(docs, [
    ['/docs/einstieg', /class="docs-sidebar/], ['/en/docs/getting-started', /lang="en"/], ['/__ginko/search/de.json', /"url":"\/docs\//],
    // The layer's two feed handlers: the main language and a prefixed one.
    ['/blog/rss.xml', /<rss[\s\S]*<item>/], ['/en/blog/rss.xml', /<rss[\s\S]*<item>/],
  ], { ginkoCheck: false }),
  checkSite(docsSeo, [
    ['/docs/einstieg', seoHead('de')], ['/en/docs/getting-started', seoHead('en')], ['/', seoHead('de')],
    // Ginko's entries with hreflang, on the site's address (not the request host).
    ['/sitemap.xml', /<loc>https:\/\/ginko-docs\.vercel\.app\/en\/docs\/getting-started<\/loc>[\s\S]*hreflang="de"/],
    // localhost is a preview host: never indexable, also for @nuxtjs/robots.
    ['/robots.txt', /Disallow: \/\s*$/m],
  ], { ginkoCheck: false }),
])
failures.push(...results.flat())
console.log(failures.length ? `FAIL check:pack${nuxt5 ? ` (${nuxt5})` : ''}\n${failures.join('\n')}` : `OK check:pack${nuxt5 ? ` (${nuxt5})` : ''}: the create-ginko starters (plain, gastro, gastro --locales de, docs, docs --locales de), its templates (${Object.keys(created).filter((n) => n.startsWith('template-')).join(', ')}) and sites/docs (also with @nuxtjs/seo) build, serve, render share cards and type-check from the tarballs`)
// A failed run keeps its folder for a look at the sites; a passed one cleans up.
if (!failures.length) rmSync(work, { recursive: true, force: true })
process.exit(failures.length ? 1 : 0)
