import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../index.mjs', import.meta.url))
const version = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version
const work = mkdtempSync(join(tmpdir(), 'create-ginko-test-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))

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
    // pnpm 11 exits 1 on `pnpm install` unless the starter allows esbuild's install script.
    expect(read('plain', 'pnpm-workspace.yaml')).toMatch(/^allowBuilds:\n  esbuild: true$/m)
    expect(result.stdout).toContain('Created plain from the plain starter in English.')
    expect(result.stdout).toContain('npm create ginko@latest my-site -- --preset gastro')
  })

  it('says which site id it derived when the folder name is not a valid one', () => {
    const result = run('My Café!')
    expect(result.status).toBe(0)
    expect(read('My Café!', 'ginko.config.ts')).toContain("site: 'my-caf'")
    expect(result.stdout).toContain('The site id is "my-caf"')
    expect(run('plain-id').stdout).not.toContain('The site id is')
  })

  it('--lang de creates the German plain starter', () => {
    expect(run('plain-de', '--lang', 'de').status).toBe(0)
    expect(read('plain-de', 'ginko.config.ts')).toContain("locales: ['de']")
    expect(read('plain-de', 'content/start.md')).toContain('title: Hallo Ginko')
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
      it(`${flag.join(' ')} --lang ${lang} creates the ${preset} starter`, () => {
        const name = `${preset}-${lang}-${flag.length}`
        const result = run(name, ...flag, '--lang', lang)
        expect(result.status).toBe(0)
        for (const file of files) expect(existsSync(join(work, name, file)), file).toBe(true)
        expect(existsSync(join(work, name, 'content/start.md'))).toBe(false)
        expect(read(name, 'ginko.config.ts')).toContain(`site: '${name}'`)
        expect(read(name, 'ginko.config.ts')).toMatch(new RegExp(`locales.*\\['${lang}'\\]`))
        expect(read(name, 'ginko.config.ts')).not.toContain('{{')
        expect(read(name, 'ginko.config.ts')).toContain(pkg)
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
    // The layer's peers (ginko, ginko-content) come from the base template; the components and their i18n peer are added.
    expect(JSON.parse(read('docs-en-2', 'package.json')).dependencies).toMatchObject({
      '@lupinum/ginko': `^${version}`, '@lupinum/ginko-content': `^${version}`, '@lupinum/ginko-components': `^${version}`, '@lupinum/ginko-i18n': `^${version}`,
    })
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

  // Every mistake stops with exit 1 before a folder exists, so a script never "succeeds" without a site.
  it.each([
    ['an unknown option', ['bad-option', '--typescript'], 'Unknown option "--typescript".'],
    ['an unknown preset', ['bad-preset', '--preset', 'shop'], 'Choose one of: gastro, docs.'],
    ['a preset name that is an object key', ['bad-proto', '--preset', 'toString'], 'Unknown preset "toString"'],
    ['an unknown language', ['bad-lang', '--lang', 'fr'], 'Choose one of: en, de.'],
    ['--preset dropped by npm (only its value arrives)', ['bad-npm', 'gastro'], 'npm create ginko@latest bad-npm -- --preset gastro'],
    ['a second folder name', ['bad-two', 'other'], 'Unexpected argument "other".'],
  ])('%s exits 1 and creates nothing', (_name, args, message) => {
    const result = run(...args)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(message)
    expect(result.stderr).toContain('Usage:')
    expect(existsSync(join(work, args[0]!))).toBe(false)
  })

  it('quotes a folder with spaces in the next steps', () => {
    expect(run('My Site').stdout).toContain("cd 'My Site'")
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
