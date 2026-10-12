import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../index.mjs', import.meta.url))
const version = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version
const work = mkdtempSync(join(tmpdir(), 'create-ginko-test-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))

const run = (...args: string[]) => spawnSync('node', [cli, ...args], { cwd: work, encoding: 'utf8' })
const read = (dir: string, file: string) => readFileSync(join(work, dir, file), 'utf8')

describe('create-ginko', () => {
  it('without a preset creates the plain starter', () => {
    expect(run('plain').status).toBe(0)
    expect(read('plain', 'ginko.config.ts')).toContain("site: 'plain'")
    expect(existsSync(join(work, 'plain/content/start.md'))).toBe(true)
    expect(JSON.parse(read('plain', 'package.json')).dependencies).not.toHaveProperty('@lupinum/ginko-docs')
  })

  // Each preset: its config imports the package, package.json lists it at the Ginko version, the base sample page is gone.
  const cases = [
    { preset: 'gastro', pkg: '@lupinum/ginko-preset-gastro', files: ['content/hours.md', 'content/menu/1.tomato-soup.md', 'app/pages/index.vue'] },
    { preset: 'docs', pkg: '@lupinum/ginko-docs', files: ['content/docs/1.getting-started.md', 'app/app.vue', 'nuxt.config.ts'] },
  ]
  for (const { preset, pkg, files } of cases) {
    for (const flag of [['--preset', preset], [`--preset=${preset}`]]) {
      it(`${flag.join(' ')} creates the ${preset} starter`, () => {
        const name = `${preset}-${flag.length}`
        const result = run(name, ...flag)
        expect(result.status).toBe(0)
        for (const file of files) expect(existsSync(join(work, name, file)), file).toBe(true)
        expect(existsSync(join(work, name, 'content/start.md'))).toBe(false)
        expect(read(name, 'ginko.config.ts')).toContain(`site: '${name}'`)
        expect(read(name, 'ginko.config.ts')).not.toContain('{{')
        expect(read(name, 'ginko.config.ts')).toContain(pkg)
        const pkgJson = JSON.parse(read(name, 'package.json'))
        expect(pkgJson.name).toBe(name)
        expect(pkgJson.dependencies[pkg]).toBe(`^${version}`)
        expect(existsSync(join(work, name, '.gitignore'))).toBe(true)
      })
    }
  }

  it('an unknown preset exits 1 and lists the preset names', () => {
    const result = run('nope', '--preset', 'shop')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('gastro, docs')
    expect(existsSync(join(work, 'nope'))).toBe(false)
  })
})
