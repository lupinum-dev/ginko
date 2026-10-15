import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../index.mjs', import.meta.url))
const version = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version
const work = mkdtempSync(join(tmpdir(), 'create-ginko-test-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
// The bundled copies of the repository's templates (build.mjs), as `pnpm pack` makes them.
beforeAll(() => {
  const build = spawnSync('node', [fileURLToPath(new URL('../build.mjs', import.meta.url))], { encoding: 'utf8' })
  if (build.status !== 0) throw new Error(build.stderr)
})

const run = (...args: string[]) => spawnSync('node', [cli, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: '' } })
const read = (dir: string, file: string) => readFileSync(join(work, dir, file), 'utf8')

describe('create-ginko', () => {
  it('without options creates the English plain starter and says how to pick another one', () => {
    const result = run('plain')
    expect(result.status).toBe(0)
    expect(read('plain', 'ginko.config.ts')).toContain("site: 'plain'")
    expect(read('plain', 'ginko.config.ts')).toContain("locales: ['en']")
    expect(read('plain', 'content/start.md')).toContain('title: Hello Ginko')
    expect(JSON.parse(read('plain', 'package.json')).dependencies).not.toHaveProperty('@lupinum/ginko-docs')
    // Wrong behaviour caught: `npx ginko-i18n check` (docs, Languages) finds no local bin and asks the registry for an unscoped name.
    expect(JSON.parse(read('plain', 'package.json')).dependencies['@lupinum/ginko-i18n']).toBe(`^${version}`)
    // Wrong behaviour caught: a new site has no <title> or description until the owner finds `useGinkoSeo`.
    expect(read('plain', 'ginko.config.ts')).toMatch(/seo: \{ description: '.+' \}/)
    expect(read('plain', 'app/pages/index.vue')).toContain('useGinkoSeo(')
    // `nuxt typecheck` needs both packages; it fails with a prompt to install them otherwise.
    const pkg = JSON.parse(read('plain', 'package.json'))
    expect(pkg.scripts.typecheck).toBe('nuxt typecheck')
    expect(Object.keys(pkg.devDependencies)).toEqual(['typescript', 'vue-tsc'])
    // pnpm 11 exits 1 on `pnpm install` unless the starter allows esbuild's install script.
    expect(read('plain', 'pnpm-workspace.yaml')).toMatch(/^allowBuilds:\n  esbuild: true$/m)
    expect(result.stdout).toContain('Created plain from the plain starter in English.')
    expect(result.stdout).toContain('npm create ginko@latest my-site -- --template starter')
  })

  it('shows pnpm users the starter options without the npm-only --', () => {
    const result = spawnSync('node', [cli, 'via-pnpm'], { cwd: work, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: 'pnpm/11.28.5 npm/? node/v24.18.0' } })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('pnpm create ginko my-site --template starter')
    expect(result.stdout).not.toContain(' -- ')
  })

  it('says which site id it derived when the folder name is not a valid one', () => {
    const result = run('My Café!')
    expect(result.status).toBe(0)
    expect(read('My Café!', 'ginko.config.ts')).toContain("site: 'my-caf'")
    expect(result.stdout).toContain('The site id is "my-caf"')
    expect(run('plain-id').stdout).not.toContain('The site id is')
  })

  // --locale and --preset stay for one minor release; wrong behaviour caught: they stop working, or say nothing about it.
  it.each([
    ['--locale de', ['plain-de', '--locale', 'de'], '--locale is deprecated'],
    ['--locales de', ['plain-de2', '--locales', 'de'], undefined],
  ])('%s creates the German plain starter', (_name, args, note) => {
    const result = run(...args)
    expect(result.status).toBe(0)
    expect(read(args[0]!, 'ginko.config.ts')).toContain("locales: ['de']")
    expect(read(args[0]!, 'content/start.md')).toContain('title: Hallo Ginko')
    if (note) expect(result.stderr).toContain(note)
    else expect(result.stderr).not.toContain('deprecated')
  })

  it('--preset still works and says that --template replaces it', () => {
    const result = run('preset-note', '--preset', 'gastro')
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('--preset is deprecated')
    expect(result.stderr).toContain('use --template')
  })

  // Each preset: its config imports the package, package.json lists it at the Ginko version, the base sample page is gone.
  const cases = [
    { preset: 'gastro', lang: 'en', pkg: '@lupinum/ginko-preset-gastro', files: ['content/hours.md', 'content/menu/1.tomato-soup.md', 'app/pages/index.vue'] },
    { preset: 'gastro', lang: 'de', pkg: '@lupinum/ginko-preset-gastro', files: ['content/hours.md', 'content/menu/1.tomatensuppe.md', 'app/pages/index.vue'] },
    { preset: 'docs', lang: 'en', pkg: '@lupinum/ginko-docs', files: ['content/docs/1.getting-started.md', 'app/app.vue', 'nuxt.config.ts'] },
    { preset: 'docs', lang: 'de', pkg: '@lupinum/ginko-docs', files: ['content/docs/1.einstieg.md', 'app/app.vue', 'nuxt.config.ts'] },
  ]
  for (const { preset, lang, pkg, files } of cases) {
    for (const flag of [['--preset', preset], [`--preset=${preset}`]]) {
      it(`${flag.join(' ')} --locale ${lang} creates the ${preset} starter`, () => {
        const name = `${preset}-${lang}-${flag.length}`
        const result = run(name, ...flag, '--locale', lang)
        expect(result.status).toBe(0)
        for (const file of files) expect(existsSync(join(work, name, file)), file).toBe(true)
        expect(existsSync(join(work, name, 'content/start.md'))).toBe(false)
        expect(read(name, 'ginko.config.ts')).toContain(`site: '${name}'`)
        expect(read(name, 'ginko.config.ts')).toMatch(new RegExp(`locales.*\\['${lang}'\\]`))
        expect(read(name, 'ginko.config.ts')).not.toContain('{{')
        expect(read(name, 'ginko.config.ts')).toContain(pkg)
        expect(read(name, 'ginko.config.ts')).toMatch(/seo: \{ description: '.+' \}/)
        const pkgJson = JSON.parse(read(name, 'package.json'))
        expect(pkgJson.name).toBe(name)
        expect(pkgJson.dependencies[pkg]).toBe(`^${version}`)
        expect(existsSync(join(work, name, '.gitignore'))).toBe(true)
        expect(result.stdout).toContain(`from the ${preset} preset`)
      })
    }
  }
  it('the docs preset extends the docs layer', () => {
    expect(read('docs-en-2', 'nuxt.config.ts')).toContain("extends: ['@lupinum/ginko-docs']")
  })

  // A preset adds its package and every Ginko peer of that package that the base template lacks, nothing else.
  it.each([['gastro', '@lupinum/ginko-preset-gastro'], ['docs', '@lupinum/ginko-docs']])('the %s preset installs its package and its Ginko peers', (preset, pkg) => {
    const metadata = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${name.replace('@lupinum/', '')}/package.json`, import.meta.url)), 'utf8'))
    const base = Object.keys(metadata('create-ginko/template').dependencies)
    const peers = Object.keys(metadata(pkg).peerDependencies).filter((name) => name.startsWith('@lupinum/') && !base.includes(name))
    const added = Object.keys(JSON.parse(read(`${preset}-en-2`, 'package.json')).dependencies).filter((name) => !base.includes(name))
    expect(added.sort()).toEqual([pkg, ...peers].sort())
  })

  it('accepts the -- that pnpm and yarn pass through', () => {
    expect(run('dashed', '--', '--preset', 'gastro').status).toBe(0)
    expect(existsSync(join(work, 'dashed/content/hours.md'))).toBe(true)
  })

  it('--help prints the usage and exits 0', () => {
    const result = run('--help')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage:')
  })

  // Every usage mistake stops with exit 2 (as in `ginko`) before a folder exists, so a script never "succeeds" without a site.
  it.each([
    ['an unknown option', ['bad-option', '--typescript'], 'Unknown option "--typescript".'],
    ['an unknown preset', ['bad-preset', '--preset', 'shop'], 'Choose one of: gastro, docs.'],
    ['a preset name that is an object key', ['bad-proto', '--preset', 'toString'], 'Unknown preset "toString"'],
    ['an unknown language', ['bad-lang', '--locale', 'fr'], 'Choose one of: en, de.'],
    ['two languages for the plain starter', ['bad-two-langs', '--locales', 'en,de'], 'The plain starter has one language.'],
    ['an unknown template', ['bad-template', '--template', 'shop'], 'Unknown template "shop". Choose one of: starter.'],
    ['a locale the template does not have', ['bad-locale', '--template', 'starter', '--locales', 'en,fr'], 'Unknown locale "fr". The starter template has: en.'],
    ['--template with --preset', ['bad-both', '--template', 'starter', '--preset', 'gastro'], 'Use --template or --preset, not both.'],
    ['--template dropped by npm (only its value arrives)', ['bad-npm-template', 'starter'], 'npm create ginko@latest bad-npm-template -- --template starter'],
    ['--preset dropped by npm (only its value arrives)', ['bad-npm', 'gastro'], 'npm create ginko@latest bad-npm -- --preset gastro'],
    ['a second folder name', ['bad-two', 'other'], 'Unexpected argument "other".'],
  ])('%s exits 2 and creates nothing', (_name, args, message) => {
    const result = run(...args)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain(message)
    expect(result.stderr).toContain('Usage:')
    expect(existsSync(join(work, args[0]!))).toBe(false)
  })

  it('quotes a folder with spaces in the next steps', () => {
    expect(run('My Site').stdout).toContain("cd 'My Site'")
  })
})

describe('create-ginko --template', () => {
  const starter = JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/starter/package.json', import.meta.url)), 'utf8'))
  const clock = fileURLToPath(new URL('../../../scripts/templates/clock.mjs', import.meta.url))
  /** Runs create-ginko with its clock at `now` (the template test clock, scripts/templates/clock.mjs). */
  const runAt = (now: string, ...args: string[]) => spawnSync('node', ['--import', clock, cli, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: '', GINKO_TEST_NOW: now } })

  it('creates a site from the template with its own site id, this release\'s ranges and a secret', () => {
    const result = run('tpl-site', '--template', 'starter')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Created tpl-site from the starter template in English.')
    // Wrong behaviour caught: two sites created from one template share the template's site id.
    expect(read('tpl-site', 'ginko.config.ts')).toMatch(/\bsite: 'tpl-site'/)
    const pkg = JSON.parse(read('tpl-site', 'package.json'))
    expect(pkg.name).toBe('tpl-site')
    // Wrong behaviour caught: the committed range of the next release, which npm does not have yet.
    expect(pkg.dependencies['@lupinum/ginko']).toBe(`^${version}`)
    expect(pkg.dependencies['@lupinum/ginko-content']).toBe(`^${version}`)
    expect(pkg.ginko).toEqual({ sampleAnchor: starter.ginko.sampleAnchor })
    expect(read('tpl-site', '.env')).toMatch(/^NUXT_APP_SECRET=[\da-f]{64}$/m)
    expect(existsSync(join(work, 'tpl-site/.gitignore'))).toBe(true)
    expect(existsSync(join(work, 'tpl-site/gitignore'))).toBe(false)
  })

  it('moves only the dates of entries that expire by whole weeks, and nothing else', () => {
    // 10 weeks and 3 days after the anchor: dates move 10 weeks, so each keeps its weekday.
    const anchor = Date.parse(`${starter.ginko.sampleAnchor}T00:00:00Z`)
    const now = new Date(anchor + (10 * 7 + 3) * 864e5 + 10 * 3600e3).toISOString()
    const result = runAt(now, 'tpl-dates', '--template', 'starter')
    expect(result.status).toBe(0)
    const source = (file: string) => readFileSync(fileURLToPath(new URL(`../../../templates/starter/${file}`, import.meta.url)), 'utf8')
    const moved = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 70 * 864e5).toISOString().slice(0, 10)
    const event = source('content/events/1.new-year-tidy-up.md')
    const [from, to] = [...event.matchAll(/(?:from|to): (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]!)
    expect(read('tpl-dates', 'content/events/1.new-year-tidy-up.md')).toBe(event.replace(from!, moved(from!)).replace(to!, moved(to!)))
    // Wrong behaviour caught: a post's publication date or the notice's end date moves with the samples.
    for (const file of ['content/posts/1.spring-planting-day.md', 'content/notice.md']) expect(read('tpl-dates', file)).toBe(source(file))
    expect(JSON.parse(read('tpl-dates', 'package.json')).ginko.sampleAnchor).toBe(moved(starter.ginko.sampleAnchor))
    expect(result.stdout).toContain('The sample dates in 3 content files moved')
  })
})

describe('node version', () => {
  const range = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).engines.node
  // Wrong behaviour caught: a stranger on Node 20 gets no hint until npm prints EBADENGINE.
  it.each([
    ['20.20.2', false], ['22.17.9', false], ['22.18.0', true], ['22.22.3', true], ['23.1.0', false],
    ['24.0.0', true], ['24.18.0', true], ['26.0.0', true], ['27.0.0', false],
  ])('Node %s supported: %s', async (version, ok) => {
    const { supportsNode } = await import('../node-version.mjs')
    expect(supportsNode(version, range)).toBe(ok)
  })

  it('the starter declares the same range as the packages', () => {
    expect(JSON.parse(read('plain', 'package.json')).engines.node).toBe(range)
  })

  it('create-ginko warns on an unsupported Node but still creates the site', () => {
    const preload = join(work, 'fake-node-20.mjs')
    writeFileSync(preload, "Object.defineProperty(process.versions, 'node', { value: '20.20.2' })")
    const result = spawnSync('node', ['--import', preload, cli, 'old-node'], { cwd: work, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: '' } })
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('Ginko needs Node ^22.18.0 || ^24.0.0 || ^26.0.0, but this is Node 20.20.2')
    expect(existsSync(join(work, 'old-node/ginko.config.ts'))).toBe(true)
    expect(run('current-node').stderr).not.toContain('Ginko needs Node')
  })
})
