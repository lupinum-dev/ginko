import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { STYLES } from '../src/styles.ts'
import { buildRegistry, type RegistryItem } from '../scripts/build-registry.ts'

const BASE = 'https://example.test/r'
const out = mkdtempSync(join(tmpdir(), 'ginko-registry-'))
const items = buildRegistry(out, BASE)
const byName = new Map(items.map((item) => [item.name, item]))
afterAll(() => rmSync(out, { recursive: true, force: true }))

const depName = (url: string) => url.replace(`${BASE}/`, '').replace(/\.json$/, '')
/** Every file an item brings once installed: its own plus those of its registryDependencies, as installed paths. */
function installed(item: RegistryItem, seen = new Set<string>()): Set<string> {
  if (seen.has(item.name)) return new Set()
  seen.add(item.name)
  const paths = new Set(item.files.map((f) => f.path))
  for (const dep of item.registryDependencies ?? []) for (const p of installed(byName.get(depName(dep))!, seen)) paths.add(p)
  return paths
}

describe('shadcn-vue registry', () => {
  test('every component has an item, written as JSON next to an index', () => {
    const components = readdirSync(join(import.meta.dirname, '../src/runtime/components')).filter((f) => f.endsWith('.vue'))
    const missing = components.filter((f) => !items.some((item) => item.files.some((file) => file.path === `ginko/${f}`)))
    expect(missing).toEqual([])
    expect(byName.has('callout')).toBe(true)
    const index = JSON.parse(readFileSync(join(out, 'registry.json'), 'utf8'))
    expect(index.items.map((i: { name: string }) => i.name).sort()).toEqual([...byName.keys()].sort())
    for (const item of items) expect(existsSync(join(out, `${item.name}.json`))).toBe(true)
  })

  test('every relative import resolves inside the item or its registryDependencies (no broken install)', () => {
    const broken: string[] = []
    for (const item of items) {
      const available = installed(item)
      for (const file of item.files.filter((f) => /\.(vue|ts)$/.test(f.path))) {
        for (const m of file.content.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
          const base = normalize(join(dirname(file.path), m[1]!))
          if (![base, `${base}.ts`, `${base}.vue`].some((p) => available.has(p))) broken.push(`${item.name}: ${file.path} → ${m[1]}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  test('items have the documented shape and dependencies are URLs of items that exist', () => {
    for (const item of items) {
      const written = JSON.parse(readFileSync(join(out, `${item.name}.json`), 'utf8')) as RegistryItem
      expect(written).toMatchObject({ $schema: 'https://shadcn-vue.com/schema/registry-item.json', name: item.name })
      for (const key of ['name', 'type', 'title', 'description'] as const) expect(typeof written[key], `${item.name}.${key}`).toBe('string')
      expect(written.type).toMatch(/^registry:/)
      expect(written.files.length).toBeGreaterThan(0)
      for (const file of written.files) {
        expect(file.path).toBeTruthy()
        expect(file.type).toMatch(/^registry:/)
        expect(file.content.length).toBeGreaterThan(0)
      }
      for (const dep of written.registryDependencies ?? []) expect(byName.has(depName(dep)), `${item.name} → ${dep}`).toBe(true)
    }
  })

  test('npm packages are listed where imported (callout none, inline-toc needs @lupinum/ginko)', () => {
    expect(byName.get('callout')!.dependencies).toBeUndefined()
    expect(byName.get('inline-toc')!.dependencies).toEqual(['@lupinum/ginko'])
  })

  test('styles.css imports exactly the stylesheets of STYLES, in order', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/runtime/styles.css'), 'utf8')
    expect([...css.matchAll(/@import '\.\/([^']+)'/g)].map((m) => m[1])).toEqual([...STYLES])
  })
})
