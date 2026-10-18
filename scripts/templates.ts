// The templates in templates/<name> (spec ginko-internal specs/TEMPLATES.md, §2 and §9). Run: pnpm templates <command>
//
//   sync                     copies the shared sources of templates/_features/<feature> (the files its files.json lists;
//                            content and texts only in the template's locales) into every template whose package.json names the
//                            feature in "ginko": { "features" }, and sets the @lupinum/* ranges (T3)
//                            and deletes synced copies whose source left its files.json
//   sync --check             fails on drift from the shared sources, a synced copy no feature brings any more, a stale
//                            range, a lockfile inside a template, fewer than 90 days of future sample dates (T10), or
//                            a share card colour (seo.color) that differs from the light --brand of main.css
//   test <name> [--only <gate>] [--mode single|multi]
//                            gates 1–6 of §9 on packed tarballs, outside this workspace, with one test instant on
//                            every clock (GINKO_TEST_NOW, default: the template's sampleAnchor at 10:00 UTC)
//   test <name> --platform   gate 7: the template's Studio jobs on a local platform (Convex, Studio :3100, site :3000);
//                            see scripts/templates/platform.ts
//
// `test` takes the machine-wide heavy-run lock and waits for a calm machine first (scripts/lib/runs.ts). An error of
// the run itself (install, build, server start, global setup, a crash of this script) is a failed gate with its reason.
//   dev <name>               nuxt dev on port 3600 + the template's place in T1
//
// GINKO_KEEP_WORK=1 keeps the work folder of `test` for a look; it is deleted otherwise.
import { execFile as execFileCallback, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { lockfiles, manifestOf, notCopied, sampleDates } from '../packages/create-ginko/template-files.mjs'
import { heavyLock, waitForCalm } from './lib/runs.ts'
import { platformGate, type Step } from './templates/platform.ts'

const execFile = promisify(execFileCallback)
export const repoRoot = join(import.meta.dirname, '..')

/** The templates in their T1 order; `dev` ports follow it, so a port never moves when a template is added. */
const T1 = ['starter', 'blog', 'portfolio', 'company', 'saas', 'docs', 'restaurant', 'local-business', 'nonprofit', 'events']
const MIN_FUTURE_DAYS = 90

type Pkg = { name: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; ginko?: { sampleAnchor?: string; features?: string[]; scriptBudget?: number }; overrides?: Record<string, string> }
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

export function templateNames(root = repoRoot): string[] {
  const dir = join(root, 'templates')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => !name.startsWith('_') && existsSync(join(dir, name, 'package.json'))).sort()
}

/** The released packages: the fixed group of .changeset/config.json. */
function fixedGroup(root: string): string[] {
  return readJson<{ fixed: string[][] }>(join(root, '.changeset/config.json')).fixed[0]!
}

function packageDirs(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(join(root, 'packages')).filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
    .map((dir) => [readJson<Pkg>(join(root, 'packages', dir, 'package.json')).name, join(root, 'packages', dir)]))
}

/**
 * The @lupinum/* ranges a template may commit (T3): `^A.B.0` of the next fixed-group release when unreleased changesets
 * touch the group, else `^<current>`. `accepted` is what `sync --check` lets through: the current version or the next minor.
 */
export function ranges(current: string, next: string | null): { expected: string; accepted: string[] } {
  const [major, minor] = current.split('.').map(Number) as [number, number]
  const nextMinor = `^${major}.${minor + 1}.0`
  const expected = next ? `^${next.split('.').slice(0, 2).join('.')}.0` : `^${current}`
  return { expected, accepted: [...new Set([`^${current}`, nextMinor, expected])] }
}

/** The next version of the fixed group from `changeset status`; null when no unreleased changeset touches it. */
function nextVersion(root: string): string | null {
  const out = join(mkdtempSync(join(tmpdir(), 'ginko-changeset-')), 'status.json')
  const result = spawnSync('node', [join(root, 'node_modules/@changesets/cli/bin.js'), 'status', `--output=${out}`], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0 || !existsSync(out)) throw new Error(`changeset status failed:\n${result.stdout}${result.stderr}`)
  const group = new Set(fixedGroup(root))
  const releases = readJson<{ releases: { name: string; newVersion: string; type: string }[] }>(out).releases.filter((r) => group.has(r.name) && r.type !== 'none')
  rmSync(dirname(out), { recursive: true, force: true })
  return releases[0]?.newVersion ?? null
}

const COMMENTED: Record<string, (text: string) => string> = {
  '.vue': (text) => `<!-- ${text} -->`,
  '.ts': (text) => `// ${text}`,
  '.mjs': (text) => `// ${text}`,
  '.css': (text) => `/* ${text} */`,
}

/** A synced file as the template must hold it: code files start with one comment that names the source (§2). */
export function syncedContent(feature: string, file: string, source: string): string {
  const comment = COMMENTED[extname(file)]
  if (!comment) return source
  const line = comment(`Synced from templates/_features/${feature}/${file} by \`pnpm templates sync\`. Edit the source, not this copy.`)
  // A shebang must stay the first line.
  if (source.startsWith('#!')) {
    const end = source.indexOf('\n') + 1
    return `${source.slice(0, end)}${line}\n${source.slice(end)}`
  }
  return `${line}\n${source}`
}

const SYNCED_HEADER = /^(?:#!.*\n)?(?:<!--|\/\/|\/\*) Synced from templates\/_features\//

/** Code files in a template that carry the synced header but are not in `wanted`: their source left its files.json. */
function staleSyncs(dir: string, wanted: Map<string, string>): string[] {
  const stale: string[] = []
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') walk(path)
      }
      else if (COMMENTED[extname(entry.name)] && !wanted.has(path) && SYNCED_HEADER.test(readFileSync(join(dir, path), 'utf8').slice(0, 400))) stale.push(path)
    }
  }
  walk('')
  return stale
}

/**
 * The language of a feature file: a content file by its suffix (`content/legal/1.privacy.de.md` → `de`), a
 * translation of the feature's texts by its name (`i18n/site/de.json` → `de`). Undefined for a main-language content
 * file (`1.privacy.md`) and for every other file. A suffix is a language when it is a two-letter code, optionally with
 * a region (`pt-BR`), so feature content keeps its other dotted names free of such parts.
 */
export function contentLocale(file: string): string | undefined {
  const code = /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/
  if (file.startsWith('i18n/')) {
    const name = /^i18n\/[^/]+\/([^/]+)\.json$/.exec(file)?.[1]
    return name && code.test(name) ? name : undefined
  }
  if (!file.startsWith('content/')) return undefined
  const parts = file.split('/').at(-1)!.split('.')
  const suffix = parts.length > 2 ? parts.at(-2)! : ''
  return code.test(suffix) ? suffix : undefined
}

/**
 * Every file the features of each template bring: template → (path in the template → expected content). Content and
 * texts in a language the template does not have stay out (a template without `fr` gets no `.fr.md`, no `fr.json`).
 */
async function expectedSyncs(root: string, names: string[]): Promise<{ files: Map<string, Map<string, string>>; problems: string[] }> {
  const files = new Map<string, Map<string, string>>()
  const problems: string[] = []
  for (const name of names) {
    const wanted = new Map<string, string>()
    const owner = new Map<string, string>()
    const { locales } = manifestOf(await configOf(root, name))
    for (const feature of readJson<Pkg>(join(root, 'templates', name, 'package.json')).ginko?.features ?? []) {
      const dir = join(root, 'templates/_features', feature)
      const manifest = join(dir, 'files.json')
      if (!existsSync(manifest)) {
        problems.push(`${name}: feature "${feature}" has no templates/_features/${feature}/files.json`)
        continue
      }
      for (const file of readJson<string[]>(manifest)) {
        const locale = contentLocale(file)
        if (locale && !locales.includes(locale)) continue
        const source = join(dir, file)
        if (!existsSync(source)) problems.push(`templates/_features/${feature}/files.json lists ${file}, which does not exist`)
        else if (owner.has(file)) problems.push(`${name}: ${file} comes from both ${owner.get(file)} and ${feature}`)
        else {
          owner.set(file, feature)
          wanted.set(file, syncedContent(feature, file, readFileSync(source, 'utf8')))
        }
      }
    }
    files.set(name, wanted)
  }
  return { files, problems }
}

/** Fixed-group dependencies of a template's package.json and their committed ranges. */
function lupinumDeps(pkg: Pkg, group: string[]): [field: 'dependencies' | 'devDependencies', name: string, range: string][] {
  return (['dependencies', 'devDependencies'] as const).flatMap((field) => Object.entries(pkg[field] ?? {})
    .filter(([name]) => group.includes(name)).map(([name, range]) => [field, name, range] as [typeof field, string, string]))
}

/** `sync`: writes the shared sources and the ranges into the templates. Returns what it changed. `next`: see nextVersion. */
export async function sync(root = repoRoot, next: string | null = nextVersion(root)): Promise<string[]> {
  const names = templateNames(root)
  const { files, problems } = await expectedSyncs(root, names)
  if (problems.length) throw new Error(problems.join('\n'))
  const group = fixedGroup(root)
  const current = readJson<Pkg>(join(packageDirs(root)[group[0]!]!, 'package.json')).version!
  const { expected } = ranges(current, next)
  const changed: string[] = []
  for (const name of names) {
    for (const [file, content] of files.get(name)!) {
      const path = join(root, 'templates', name, file)
      if (existsSync(path) && readFileSync(path, 'utf8') === content) continue
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
      changed.push(`templates/${name}/${file}`)
    }
    for (const file of staleSyncs(join(root, 'templates', name), files.get(name)!)) {
      rmSync(join(root, 'templates', name, file))
      changed.push(`templates/${name}/${file} (deleted)`)
    }
    const path = join(root, 'templates', name, 'package.json')
    const pkg = readJson<Pkg>(path)
    let edited = false
    for (const [field, dep, range] of lupinumDeps(pkg, group)) {
      if (range !== expected) {
        pkg[field]![dep] = expected
        edited = true
      }
    }
    if (edited) {
      writeJson(path, pkg)
      changed.push(`templates/${name}/package.json`)
    }
  }
  return changed
}

/** A template's ginko.config.ts. */
async function configOf(root: string, name: string): Promise<Parameters<typeof manifestOf>[0] & { seo?: { color?: string }; timeZone?: string; currency?: string; languages?: Record<string, string> }> {
  return (await import(pathToFileURL(join(root, 'templates', name, 'ginko.config.ts')).href)).default
}

/** A problem when the share card colour (seo.color) is not the light accent (`--brand` in `:root` of main.css). */
function cardColourProblem(name: string, dir: string, color: string | undefined): string | undefined {
  const css = join(dir, 'app/assets/css/main.css')
  const brand = existsSync(css) ? /:root\s*\{[^}]*--brand:\s*(#[\da-f]{3,8})\b/i.exec(readFileSync(css, 'utf8'))?.[1] : undefined
  if (brand && color?.toLowerCase() !== brand.toLowerCase()) return `${name}: seo.color in ginko.config.ts is ${color ?? 'not set'}; set it to ${brand}, the light --brand of app/assets/css/main.css, so the share cards carry the accent`
}

/** Languages written right to left: their content files get the line check of `bidiProblems`. */
const RTL = new Set(['ar', 'fa', 'he', 'ur'])

/**
 * Lines of right-to-left Markdown bodies that a browser shows in the wrong order: a line with Latin letters and no
 * right-to-left letter that ends in punctuation ("River Commons e.V." turns into ".River Commons e.V" on its own line
 * in an Arabic paragraph). Wrapping the line in U+2068 … U+2069 (first strong isolate) keeps it as written.
 */
export function bidiProblems(dir: string): string[] {
  const content = join(dir, 'content')
  if (!existsSync(content)) return []
  const files = (readdirSync(content, { recursive: true }) as string[]).filter((file) => file.endsWith('.md') && RTL.has((contentLocale(`content/${file}`) ?? '').split('-')[0]!))
  return files.flatMap((file) => {
    const lines = readFileSync(join(content, file), 'utf8').split('\n')
    // The body starts after the front matter; code blocks keep their text as it is.
    let start = 0
    if (lines[0] === '---') start = lines.indexOf('---', 1) + 1
    let code = false
    return lines.slice(start).flatMap((line, i) => {
      if (line.trimStart().startsWith('```')) code = !code
      const text = line.replace(/\\$/, '').replace(/^(>\s*)+/, '').trim()
      const bad = !code && /[A-Za-z]/.test(text) && !/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(text) && /[.,:;!?)]$/.test(text) && !text.startsWith('\u2068')
      return bad ? [`content/${file}:${start + i + 1}: "${text}" ends in punctuation on a right-to-left page; wrap the line in U+2068 … U+2069 so it keeps its order`] : []
    })
  })
}

/** The email and phone of a template's content/site.md (its main-language file), for the checks that look for them on a page. */
export function siteContact(dir: string): { email?: string; phone?: string } {
  const file = join(dir, 'content/site.md')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const value = (key: string) => new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(text)?.[1]?.replace(/^(['"])(.*)\1$/, '$2')
  return { email: value('email'), phone: value('phone') }
}

/** The path of the imprint (the main-language `content/legal/` file with `legalType: imprint`), or undefined when the template has none. */
export function imprintPath(dir: string): string | undefined {
  const base = join(dir, 'content/legal')
  if (!existsSync(base)) return undefined
  const file = readdirSync(base).sort().find((f) => /^(\d+\.)?[a-z0-9-]+\.md$/.test(f) && /^legalType:[ \t]*imprint[ \t]*$/m.test(readFileSync(join(base, f), 'utf8')))
  return file && `/legal/${file.replace(/^\d+\./, '').replace(/\.md$/, '')}`
}

/**
 * The email and phone of content/site.md written out by hand in another content file, a page or a text of the template
 * (T-contact): the footer, the imprint and the contact blocks read them from the site brick, so a copy goes stale when
 * the owner changes the brick.
 */
export function copiedContactProblems(dir: string): string[] {
  const values = Object.values(siteContact(dir)).filter((value): value is string => !!value)
  if (!values.length) return []
  const found: string[] = []
  for (const folder of ['content', 'app', 'i18n']) {
    const base = join(dir, folder)
    if (!existsSync(base)) continue
    for (const file of readdirSync(base, { recursive: true }).map(String)) {
      const path = `${folder}/${file}`
      if (!/\.(md|vue|ts|json)$/.test(file) || /^content\/site(\.[a-z-]+)?\.md$/.test(path) || !statSync(join(base, file)).isFile()) continue
      const text = readFileSync(join(base, file), 'utf8')
      for (const value of values) if (text.includes(value)) found.push(`${path}: "${value}" is the value of content/site.md; read it from the site brick (useGinko('site')) instead of writing it out`)
    }
  }
  return found
}

/** True when the eslint config imports `tailwindClassesConfig` and uses it outside the import and outside comments. */
function loadsTailwindLint(file: string): boolean {
  if (!existsSync(file)) return false
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const importRule = /import\s*\{[^}]*\btailwindClassesConfig\b[^}]*\}\s*from\s*['"]\.\/eslint\.tailwind\.mjs['"]/
  return importRule.test(code) && /\btailwindClassesConfig\b/.test(code.replace(importRule, ''))
}

/** `sync --check`: the problems, empty when the templates match their sources and rules. `today` is `YYYY-MM-DD`. */
export async function syncCheck(root = repoRoot, { next = nextVersion(root), today = new Date().toISOString().slice(0, 10), only }: { next?: string | null; today?: string; only?: string } = {}): Promise<string[]> {
  const names = templateNames(root).filter((name) => !only || name === only)
  const { files, problems } = await expectedSyncs(root, names)
  const group = fixedGroup(root)
  const current = readJson<Pkg>(join(packageDirs(root)[group[0]!]!, 'package.json')).version!
  const { accepted } = ranges(current, next)
  for (const name of names) {
    const dir = join(root, 'templates', name)
    for (const [file, content] of files.get(name)!) {
      const path = join(dir, file)
      if (!existsSync(path)) problems.push(`${name}: ${file} is missing; run pnpm templates sync`)
      else if (readFileSync(path, 'utf8') !== content) problems.push(`${name}: ${file} differs from its source in templates/_features; edit the source and run pnpm templates sync`)
    }
    for (const file of staleSyncs(dir, files.get(name)!)) problems.push(`${name}: ${file} is a synced copy, but no feature's files.json lists it any more; run pnpm templates sync to delete it`)
    const pkg = readJson<Pkg>(join(dir, 'package.json'))
    for (const [, dep, range] of lupinumDeps(pkg, group)) {
      if (!accepted.includes(range)) problems.push(`${name}: ${dep} is "${range}"; expected ${accepted.join(' or ')} (run pnpm templates sync)`)
    }
    for (const lock of lockfiles) if (existsSync(join(dir, lock))) problems.push(`${name}: ${lock} must not be committed in a template (install from the repository root)`)
    const anchor = pkg.ginko?.sampleAnchor
    if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) problems.push(`${name}: package.json needs "ginko": { "sampleAnchor": "YYYY-MM-DD" }`)
    for (const problem of bidiProblems(dir)) problems.push(`${name}: ${problem}`)
    for (const problem of copiedContactProblems(dir)) problems.push(`${name}: ${problem}`)
    // The unknown-class lint (ui feature, eslint.tailwind.mjs) only works when the template's own eslint config loads it.
    // Gate 2 then lints a probe file, which proves the rule runs; this check names the cause without a build.
    if (pkg.ginko?.features?.includes('ui') && !loadsTailwindLint(join(dir, 'eslint.config.mjs'))) {
      problems.push(`${name}: eslint.config.mjs must pass tailwindClassesConfig (from ./eslint.tailwind.mjs) to withNuxt, so lint fails on a Tailwind class the theme does not have`)
    }
    const config = await configOf(root, name)
    const colour = cardColourProblem(name, dir, config.seo?.color)
    if (colour) problems.push(colour)
    const { shift } = manifestOf(config)
    const last = sampleDates(dir, shift).at(-1)
    if (Object.keys(shift).length) {
      const days = last ? (Date.parse(last) - Date.parse(today)) / 864e5 : -Infinity
      if (days < MIN_FUTURE_DAYS) problems.push(`${name}: the last sample date (${last ?? 'none'}) is ${Number.isFinite(days) ? `${days} days` : 'not'} ahead of ${today}; it must be at least ${MIN_FUTURE_DAYS} days ahead (move sampleAnchor and the dates)`)
    }
  }
  return problems
}

// ---------------------------------------------------------------------------------------------------------------
// test <name>: gates 1–6

export type Mode = 'single' | 'multi'
export type Result = { gate: number; mode: Mode | 'both'; check: string; ok: boolean; detail?: string }
const GATES = [1, 2, 3, 4, 5, 6]

/**
 * The results plus one failure for each requested gate that recorded nothing, so `--only` never reports green for a
 * gate that did not run: gates 4–6 run on the multi site only, and any gate stops when a setup step it needs failed.
 */
export function withUnrun(results: Result[], gates: number[], modes: Mode[]): Result[] {
  const unrun = gates.filter((gate) => !results.some((r) => r.gate === gate)).map((gate): Result => ({
    gate, mode: 'both', check: 'did not run', ok: false,
    detail: gate >= 4 && !modes.includes('multi') ? `gate ${gate} did not run: needs multi mode` : `gate ${gate} did not run: a setup step it needs failed`,
  }))
  return [...results, ...unrun]
}
const outputOf = (error: unknown) => {
  const e = error as { stdout?: unknown; stderr?: unknown; message?: string }
  return `${String(e.stdout ?? '')}${String(e.stderr ?? '')}`.trim() || String(e.message ?? error)
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** Copies a folder without build output, installs and lockfiles; node_modules by APFS clone when asked (macOS `cp -c`). */
function copyTemplate(from: string, to: string) {
  cpSync(from, to, { recursive: true, filter: (path) => !notCopied.has(basename(path)) })
}
function cloneDir(from: string, to: string) {
  const clone = spawnSync('cp', ['-cR', from, to])
  if (clone.status !== 0) cpSync(from, to, { recursive: true, verbatimSymlinks: true })
}

async function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): Promise<string> {
  const { stdout, stderr } = await execFile(cmd, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' })
  return `${stdout}${stderr}`
}

/**
 * Proves the unknown-class lint is live in a template, not only imported: one probe file has a class the theme does not
 * have (`dark:bg-red-500`, which an unanchored `dark` ignore entry would let through) next to the classes that are
 * allowed on purpose. The lint must report the first and none of the others.
 */
export async function unknownClassProbe(dir: string): Promise<void> {
  const probe = '<template>\n  <div class="dark:bg-red-500 dark prose surface-primary" />\n</template>\n'
  const child = execFile('npx', ['eslint', '--stdin', '--stdin-filename', 'app/components/ProbeUnknownClass.vue'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  child.child.stdin?.end(probe)
  const out = await child.then(({ stdout, stderr }) => `${stdout}${stderr}`, (error: { stdout?: string; stderr?: string }) => `${error.stdout ?? ''}${error.stderr ?? ''}`)
  const reported = [...out.matchAll(/Unknown class detected: (\S+)/g)].map((m) => m[1])
  if (reported.join() !== 'dark:bg-red-500') throw new Error(`the unknown-class lint must report exactly dark:bg-red-500 for the probe file, but reported [${reported.join(', ')}]:\n${out}`)
}

/**
 * Gates 1–6 for one template. Any error outside a step (a missing file, a crash of this script) is a failed result
 * `run` (gate 0) with its reason, never a missing or skipped gate.
 */
export async function test(name: string, gates: number[], modes: Mode[]): Promise<Result[]> {
  const results: Result[] = []
  try {
    await runGates(name, gates, modes, results)
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error)
    results.push({ gate: 0, mode: 'both', check: 'run', ok: false, detail })
    console.log(`FAIL run (the test stopped)\n${detail.split('\n').slice(0, 40).map((l) => `     ${l}`).join('\n')}`)
  }
  return results
}

async function runGates(name: string, gates: number[], modes: Mode[], results: Result[]) {
  const root = repoRoot
  const templateDir = join(root, 'templates', name)
  const pkg = readJson<Pkg>(join(templateDir, 'package.json'))
  const anchor = pkg.ginko?.sampleAnchor ?? new Date().toISOString().slice(0, 10)
  const now = process.env.GINKO_TEST_NOW ?? `${anchor}T10:00:00Z`
  const clockEnv = { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${join(root, 'scripts/templates/clock.mjs')}`.trim(), GINKO_TEST_NOW: now }
  const secret = randomBytes(32).toString('hex')
  const config = await configOf(root, name)
  const { locales } = manifestOf(config)
  /** A result of a requested gate; a failed setup step (`blocks`) is recorded whatever the gate, since later gates need it. */
  const record = (gate: number, mode: Result['mode'], check: string, ok: boolean, detail?: string, blocks = false) => {
    if (!gates.includes(gate) && (ok || !blocks)) return
    results.push({ gate, mode, check, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'} gate ${gate} ${mode} ${check}${detail && !ok ? `\n${detail.split('\n').slice(0, 40).map((l) => `     ${l}`).join('\n')}` : ''}`)
  }
  /** Runs one step; a failure becomes a result, never a crash. */
  const step = async (gate: number, mode: Result['mode'], check: string, fn: () => Promise<unknown>, blocks = false) => {
    try {
      await fn()
      record(gate, mode, check, true)
      return true
    } catch (error) {
      record(gate, mode, check, false, outputOf(error).slice(0, 6000), blocks)
      return false
    }
  }

  const work = mkdtempSync(join(tmpdir(), `ginko-templates-${name}-`))
  const cleanup = () => { if (!process.env.GINKO_KEEP_WORK) rmSync(work, { recursive: true, force: true }) }
  process.once('SIGINT', () => { cleanup(); process.exit(130) })
  console.log(`templates test ${name}: work folder ${work}, GINKO_TEST_NOW=${now}, modes ${modes.join(', ')}, gates ${gates.join(', ')}`)
  try {
    // Gate 1: create-ginko build + pack, then one site per mode, installed with npm from the tarballs.
    const tgz = join(work, 'tgz')
    mkdirSync(tgz)
    const tarball: Record<string, string> = {}
    const packed = await step(1, 'both', 'create-ginko build + pack', async () => {
      await run('node', [join(root, 'packages/create-ginko/build.mjs')], root)
      const dirs = packageDirs(root)
      for (const dep of fixedGroup(root)) {
        // The build steps of prepack print to the same streams; the tarball's path is the line that ends in .tgz.
        const out = (await run('pnpm', ['pack', '--pack-destination', tgz], dirs[dep]!)).trim().split('\n').findLast((line) => line.trim().endsWith('.tgz'))!.trim()
        tarball[dep] = out.startsWith('/') ? out : join(tgz, out)
      }
    }, true)
    if (!packed) return
    /** Points the site's Ginko packages (also nested ones, via npm overrides) at the tarballs. */
    const useTarballs = (siteDir: string) => {
      const path = join(siteDir, 'package.json')
      const site = readJson<Pkg>(path)
      for (const field of ['dependencies', 'devDependencies'] as const) {
        for (const dep of Object.keys(site[field] ?? {})) if (tarball[dep]) site[field]![dep] = `file:${tarball[dep]}`
      }
      site.overrides = Object.fromEntries(Object.entries(tarball).filter(([dep]) => dep !== 'create-ginko').map(([dep, file]) => [dep, `file:${file}`]))
      writeJson(path, site)
    }
    const dirs: Partial<Record<Mode, string>> = {}
    const npmInstall = (dir: string) => run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir)
    // multi: the raw folder, as `npm create nuxt -- -t github:…/templates/<name>` (giget) copies it.
    const multi = join(work, 'multi')
    const multiOk = await step(1, 'multi', 'raw copy + npm install', async () => {
      copyTemplate(templateDir, multi)
      useTarballs(multi)
      await npmInstall(multi)
    }, modes.includes('multi'))
    if (multiOk && modes.includes('multi')) dirs.multi = multi
    if (modes.includes('single')) {
      // single: the packed create-ginko with the main locale only; node_modules cloned from multi, then npm settles them.
      const single = join(work, 'single')
      const ok = await step(1, 'single', `create-ginko --template ${name} --locales ${locales[0]} + npm install`, async () => {
        await run('tar', ['-xzf', tarball['create-ginko']!, '-C', work], work)
        await run('node', [join(work, 'package/index.mjs'), 'single', '--template', name, '--locales', locales[0]!], work, clockEnv)
        useTarballs(single)
        if (multiOk) {
          cloneDir(join(multi, 'node_modules'), join(single, 'node_modules'))
          cpSync(join(multi, 'package-lock.json'), join(single, 'package-lock.json'))
        }
        await npmInstall(single)
      }, true)
      if (ok) dirs.single = single
    }
    // pnpm once (allowBuilds, gate 2): pnpm 11 stops on any install script the template's pnpm-workspace.yaml leaves out.
    const pnpmDir = join(work, 'pnpm')
    if (gates.includes(2)) await step(2, 'both', 'allowBuilds (pnpm install)', async () => {
      copyTemplate(templateDir, pnpmDir)
      useTarballs(pnpmDir)
      const site = readJson<Pkg>(join(pnpmDir, 'package.json'))
      const overrides = Object.entries(site.overrides ?? {}).map(([dep, spec]) => `  '${dep}': '${spec}'`).join('\n')
      writeFileSync(join(pnpmDir, 'pnpm-workspace.yaml'), `${readFileSync(join(pnpmDir, 'pnpm-workspace.yaml'), 'utf8')}\noverrides:\n${overrides}\n`)
      await run('pnpm', ['install'], pnpmDir)
    })
    if (multiOk && locales.length > 1 && gates.includes(2)) {
      // The main-language swap (T8): the second locale first, built once.
      const swapped = [locales[1]!, locales[0]!, ...locales.slice(2)]
      const dir = join(work, 'swap')
      await step(2, 'single', `create-ginko --locales ${swapped.join(',')} (main swap) builds`, async () => {
        await run('node', [join(work, 'package/index.mjs'), 'swap', '--template', name, '--locales', swapped.join(',')], work, clockEnv)
        useTarballs(dir)
        cloneDir(join(multi, 'node_modules'), join(dir, 'node_modules'))
        await npmInstall(dir)
        await run('npx', ['nuxt', 'build'], dir, clockEnv)
        await run('npx', ['ginko', 'check'], dir)
      })
    }

    for (const mode of modes) {
      const dir = dirs[mode]
      const browserGates = gates.filter((gate) => gate >= 3 && (gate === 3 || mode === 'multi'))
      // A gate of this mode that cannot run fails with the reason, so the summary never shows it green or leaves it out.
      const cannotRun = (gates: number[], reason: string) => { for (const gate of gates) record(gate, mode, 'did not run', false, reason) }
      if (!dir) {
        cannotRun(gates.filter((gate) => gate === 2 || browserGates.includes(gate)), `the ${mode} site was not installed (see gate 1)`)
        continue
      }
      // Gate 2: types, lint, build, ginko check, platform-ready, sync --check. The build also serves gates 3–6.
      if (gates.includes(2)) await step(2, mode, 'vue-tsc (nuxt typecheck)', () => run('npx', ['nuxt', 'typecheck'], dir))
      if (gates.includes(2)) await step(2, mode, 'eslint', () => run('npx', ['eslint', '.'], dir))
      if (gates.includes(2) && pkg.ginko?.features?.includes('ui')) await step(2, mode, 'unknown-class lint catches a probe class', () => unknownClassProbe(dir))
      const built = (gates.includes(2) || browserGates.length > 0) && await step(2, mode, 'nuxt build', () => run('npx', ['nuxt', 'build'], dir, clockEnv), browserGates.length > 0)
      if (gates.includes(2)) await step(2, mode, 'ginko check', () => run('npx', ['ginko', 'check'], dir))
      if (gates.includes(2)) await step(2, mode, 'platform-ready (checkSite with source removed from every brick)', () => platformReady(dir))
      if (mode === 'multi' && gates.includes(2)) {
        await step(2, 'both', 'sync --check', async () => {
          const problems = await syncCheck(root, { only: name })
          if (problems.length) throw new Error(problems.join('\n'))
        })
      }
      if (!browserGates.length) continue
      if (!built) {
        cannotRun(browserGates, `the ${mode} site did not build (see gate 2 nuxt build)`)
        continue
      }
      // Gates 3–6 against the built server, with the test clock on the server and in the browser.
      const port = await freePort()
      const server = spawn('node', ['.output/server/index.mjs'], { cwd: dir, env: { ...process.env, ...clockEnv, PORT: String(port), NUXT_APP_SECRET: secret }, stdio: 'ignore' })
      try {
        let up = false
        for (let i = 0; i < 60 && !up; i++) {
          up = await fetch(`http://localhost:${port}/`).then(() => true, () => false)
          if (!up) await sleep(500)
        }
        if (!up) {
          for (const gate of browserGates) record(gate, mode, 'server', false, 'the built server did not answer within 30 s')
          continue
        }
        const shots = join(root, 'test-results/templates', name, mode)
        for (const gate of browserGates) {
          const env = {
            TEMPLATE_URL: `http://localhost:${port}`, TEMPLATE_NAME: name, TEMPLATE_MODE: mode, TEMPLATE_LOCALES: (mode === 'single' ? [locales[0]!] : locales).join(','),
            TEMPLATE_SHOTS: shots, TEMPLATE_FEATURES: (pkg.ginko?.features ?? []).join(','), GINKO_TEST_NOW: now,
            // What the feature specs compare against: the site's zone ("today"), currency and main language.
            TEMPLATE_TIME_ZONE: config.timeZone ?? 'UTC', TEMPLATE_CURRENCY: config.currency ?? '', TEMPLATE_LANGUAGE: config.languages?.[locales[0]!] ?? locales[0]!,
            // Gate 6: kB of gzip script per page; 150 for the starter, a feature template sets its own (at most 170).
            // The sample email and phone of content/site.md: gate 3 looks for them on the page that shows contact details.
            TEMPLATE_CONTACT: JSON.stringify(siteContact(templateDir)),
            TEMPLATE_IMPRINT: imprintPath(templateDir) ?? '',
            TEMPLATE_SCRIPT_BUDGET: String(Math.min(pkg.ginko?.scriptBudget ?? 150, 170)),
          }
          // Gate 3 also runs the e2e specs of the template's features (templates/_features/<feature>/e2e/).
          const specs = [`scripts/templates/e2e/gate${gate}.spec.ts`, ...(gate === 3 ? (pkg.ginko?.features ?? []).map((f) => `templates/_features/${f}/e2e/`).filter((dir) => existsSync(join(root, dir))) : [])]
          const out = spawnSync(join(root, 'node_modules/.bin/playwright'), ['test', '-c', 'scripts/templates/playwright.config.ts', '--output', join(work, `pw-${mode}-${gate}`), ...specs],
            { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
          // Playwright that cannot start (no binary, a broken config) or a failing global setup is a failed gate too.
          const text = `${out.stdout ?? ''}${out.stderr ?? ''}${out.error ? `\ncould not run Playwright: ${out.error.message}` : ''}`.replace(/\u001b\[[0-9;]*m/g, '')
          // The whole report next to the screenshots; the console shows its start.
          mkdirSync(shots, { recursive: true })
          writeFileSync(join(shots, `gate${gate}.log`), text)
          record(gate, mode, ['', '', '', 'e2e', 'axe light + dark, keyboard path', `layout at 320, 390 and 1440, screenshots in ${relative(root, shots)}`, 'budgets (scripts gzip, LCP resource, CLS)'][gate]!, out.status === 0, gateSummary(text, relative(root, join(shots, `gate${gate}.log`))))
        }
      } finally {
        server.kill()
      }
    }
  } finally {
    cleanup()
  }
}

/** The full-report pointer first, then the count and the unique `Error:` lines of a Playwright report (one per failed check); the raw text when there are none (a crash). */
export function gateSummary(text: string, reportPath: string): string {
  const errors = [...new Set(text.split('\n').filter((l) => /^\s+Error: /.test(l)).map((l) => l.trim()))]
  const head = `(full report: ${reportPath})`
  return errors.length ? `${head}\n${errors.length} unique errors\n${errors.join('\n')}` : `${head}\n${text}`
}

/** T4: the platform variant of the config (core `withoutFiles`: no `source` on any brick) passes checkSite. */
async function platformReady(siteDir: string) {
  const probe = join(siteDir, '.platform-ready.mjs')
  writeFileSync(probe, `import { checkSite, withoutFiles } from '@lupinum/ginko/internal'
const site = (await import('./ginko.config.ts')).default
const problems = checkSite(withoutFiles(site))
if (problems.length) { console.error(problems.join('\\n')); process.exit(1) }
`)
  try {
    await run('node', [probe], siteDir)
  } finally {
    rmSync(probe)
  }
}

function dev(name: string) {
  const index = T1.indexOf(name)
  const port = 3600 + (index === -1 ? T1.length + templateNames().filter((n) => !T1.includes(n)).indexOf(name) : index)
  const pkgName = readJson<Pkg>(join(repoRoot, 'templates', name, 'package.json')).name
  console.log(`templates dev ${name}: http://localhost:${port}`)
  const child = spawn('pnpm', ['--filter', pkgName, 'exec', 'nuxt', 'dev', '--port', String(port)], { cwd: repoRoot, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

async function main(argv: string[]) {
  const [command, ...rest] = argv
  const usage = 'Usage: pnpm templates sync [--check] | test <name> [--only <gate>] [--mode single|multi] | test <name> --platform | dev <name>'
  const option = (flag: string) => {
    const i = rest.indexOf(flag)
    return i === -1 ? undefined : rest[i + 1]
  }
  const needName = () => {
    const name = rest[0]
    if (!name || name.startsWith('-') || !templateNames().includes(name)) {
      console.error(`${name ? `Unknown template "${name}". ` : ''}Templates: ${templateNames().join(', ')}\n${usage}`)
      process.exit(2)
    }
    return name
  }
  if (command === 'sync' && rest.includes('--check')) {
    const problems = await syncCheck()
    console.log(problems.length ? `FAIL templates sync --check\n${problems.join('\n')}` : `OK templates sync --check (${templateNames().join(', ')})`)
    process.exit(problems.length ? 1 : 0)
  }
  if (command === 'sync') {
    const changed = await sync()
    console.log(changed.length ? `templates sync changed:\n${changed.join('\n')}` : 'templates sync: nothing to change')
    return
  }
  if (command === 'test') {
    const name = needName()
    // One heavy run per machine, on a calm machine (scripts/lib/runs.ts); the lock goes when this process ends.
    await heavyLock(`pnpm templates test ${rest.join(' ')}`)
    await waitForCalm()
    if (rest.includes('--platform')) {
      let steps: Step[]
      try {
        steps = await platformGate(name, repoRoot)
      } catch (error) {
        steps = [{ check: 'gate 7 run', ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) }]
        console.log(`FAIL gate 7 run\n${steps[0]!.detail}`)
      }
      const failed = steps.filter((s) => !s.ok)
      console.log(`\ntemplates test ${name} --platform: ${steps.length - failed.length} passed, ${failed.length} failed\n  gate 7: ${failed.length ? `FAIL (${failed.map((s) => s.check).join('; ')})` : 'PASS'}`)
      process.exit(failed.length ? 1 : 0)
    }
    const only = option('--only')
    const mode = option('--mode')
    if (only !== undefined && !GATES.includes(Number(only))) { console.error(`--only takes a gate: ${GATES.join(', ')}\n${usage}`); process.exit(2) }
    if (mode !== undefined && mode !== 'single' && mode !== 'multi') { console.error(`--mode takes single or multi\n${usage}`); process.exit(2) }
    const gates = only ? [Number(only)] : GATES
    const modes: Mode[] = mode ? [mode] : ['single', 'multi']
    const results = withUnrun(await test(name, gates, modes), gates, modes)
    const failed = results.filter((r) => !r.ok)
    console.log(`\ntemplates test ${name}: ${results.length - failed.length} passed, ${failed.length} failed`)
    for (const gate of [0, ...GATES]) {
      const own = results.filter((r) => r.gate === gate)
      const label = gate === 0 ? 'run' : `gate ${gate}`
      if (own.length) console.log(`  ${label}: ${own.every((r) => r.ok) ? 'PASS' : `FAIL (${own.filter((r) => !r.ok).map((r) => r.check === 'did not run' ? r.detail : gate === 0 ? r.detail!.split('\n')[0] : `${r.mode} ${r.check.split(',')[0]}`).join('; ')})`}`)
    }
    process.exit(failed.length ? 1 : 0)
  }
  if (command === 'dev') return dev(needName())
  console.error(usage)
  process.exit(2)
}

if (import.meta.main) await main(process.argv.slice(2))
