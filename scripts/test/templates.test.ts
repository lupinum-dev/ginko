import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { type Result, sync, syncCheck, withUnrun } from '../templates.ts'

const work = mkdtempSync(join(tmpdir(), 'templates-script-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
let n = 0

const TODAY = '2026-10-15'
/** A small repository: the fixed group at 0.4.0, a feature with a component, and one template that uses it. */
function repo(change: (files: Record<string, string>) => void = () => {}) {
  const files: Record<string, string> = {
    '.changeset/config.json': JSON.stringify({ fixed: [['@lupinum/ginko', 'create-ginko']] }),
    'packages/ginko/package.json': JSON.stringify({ name: '@lupinum/ginko', version: '0.4.0' }),
    'packages/create-ginko/package.json': JSON.stringify({ name: 'create-ginko', version: '0.4.0' }),
    'templates/_features/site/files.json': JSON.stringify(['app/components/SiteHeader.vue', 'app/lib/utils.ts', 'app/assets/css/base.css', 'content/legal/1.privacy.md']),
    'templates/_features/site/app/components/SiteHeader.vue': '<template><header /></template>\n',
    'templates/_features/site/app/lib/utils.ts': 'export const cn = () => \'\'\n',
    'templates/_features/site/app/assets/css/base.css': ':root { color: black; }\n',
    'templates/_features/site/content/legal/1.privacy.md': '---\ntitle: Privacy\n---\n',
    'templates/demo/package.json': JSON.stringify({ name: 'demo', dependencies: { '@lupinum/ginko': '^0.4.0', nuxt: '^4.6.1' }, ginko: { sampleAnchor: TODAY, features: ['site'] } }),
    // A config without imports: the check needs only its bricks.
    'templates/demo/ginko.config.ts': "export default { locales: ['en'], bricks: { events: { visible: { mode: 'until', field: 'when' }, fields: { when: { type: 'daterange' } } } } }\n",
    'templates/demo/content/events/1.fair.md': '---\nwhen:\n  from: 2027-03-01\n  to: 2027-03-02\n---\n',
  }
  change(files)
  const root = join(work, String(n++))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('templates sync', () => {
  it('copies the feature files, with a source comment in code files only, and sets the next minor range', async () => {
    const root = repo()
    expect((await sync(root, '0.5.0')).sort()).toEqual([
      'templates/demo/app/assets/css/base.css', 'templates/demo/app/components/SiteHeader.vue', 'templates/demo/app/lib/utils.ts',
      'templates/demo/content/legal/1.privacy.md', 'templates/demo/package.json',
    ])
    const read = (path: string) => readFileSync(join(root, 'templates/demo', path), 'utf8')
    expect(read('app/components/SiteHeader.vue')).toBe('<!-- Synced from templates/_features/site/app/components/SiteHeader.vue by `pnpm templates sync`. Edit the source, not this copy. -->\n<template><header /></template>\n')
    expect(read('app/lib/utils.ts')).toMatch(/^\/\/ Synced from templates\/_features\/site\/app\/lib\/utils\.ts /)
    expect(read('app/assets/css/base.css')).toMatch(/^\/\* Synced from .* \*\/\n:root/)
    // Content carries no comment: the manifest knows where it came from.
    expect(read('content/legal/1.privacy.md')).toBe('---\ntitle: Privacy\n---\n')
    expect(JSON.parse(read('package.json')).dependencies).toEqual({ '@lupinum/ginko': '^0.5.0', nuxt: '^4.6.1' })
    expect(await sync(root, '0.5.0')).toEqual([])
  })

  it('deletes a synced copy whose source left files.json, and keeps the template\'s own files', async () => {
    const root = repo()
    await sync(root, null)
    writeFileSync(join(root, 'templates/demo/app/components/Own.vue'), '<template><p /></template>\n')
    writeFileSync(join(root, 'templates/_features/site/files.json'), JSON.stringify(['app/lib/utils.ts', 'app/assets/css/base.css', 'content/legal/1.privacy.md']))
    expect(await sync(root, null)).toEqual(['templates/demo/app/components/SiteHeader.vue (deleted)'])
    expect(existsSync(join(root, 'templates/demo/app/components/SiteHeader.vue'))).toBe(false)
    expect(existsSync(join(root, 'templates/demo/app/components/Own.vue'))).toBe(true)
  })

  it('copies feature content and texts only in the template\'s languages, and the check agrees', async () => {
    // Wrong behaviour caught: a template without French gets content/legal/1.privacy.fr.md or i18n/site/fr.json,
    // files in a language the site does not have, or the check asks for them.
    const root = repo((files) => {
      files['templates/_features/site/files.json'] = JSON.stringify(['content/legal/1.privacy.md', 'content/legal/1.privacy.de.md', 'content/legal/1.privacy.fr.md', 'i18n/site/de.json', 'i18n/site/fr.json'])
      files['templates/_features/site/content/legal/1.privacy.de.md'] = '---\ntitle: Datenschutz\n---\n'
      files['templates/_features/site/content/legal/1.privacy.fr.md'] = '---\ntitle: Confidentialité\n---\n'
      files['templates/_features/site/i18n/site/de.json'] = '{}\n'
      files['templates/_features/site/i18n/site/fr.json'] = '{}\n'
      files['templates/demo/ginko.config.ts'] = files['templates/demo/ginko.config.ts']!.replace("locales: ['en']", "locales: ['en', 'de']")
    })
    expect((await sync(root, null)).sort()).toEqual(['templates/demo/content/legal/1.privacy.de.md', 'templates/demo/content/legal/1.privacy.md', 'templates/demo/i18n/site/de.json'])
    expect(existsSync(join(root, 'templates/demo/content/legal/1.privacy.fr.md'))).toBe(false)
    expect(existsSync(join(root, 'templates/demo/i18n/site/fr.json'))).toBe(false)
    expect(await syncCheck(root, { next: null, today: TODAY })).toEqual([])
  })
})

describe('templates sync --check', () => {
  const synced = async () => {
    const root = repo()
    await sync(root, null)
    return root
  }

  it('passes right after sync', async () => {
    expect(await syncCheck(await synced(), { next: null, today: TODAY })).toEqual([])
  })

  // Wrong behaviour caught: each of these reaches a user who copies the template, and the check lets it through.
  it.each([
    ['a synced file edited in the template', (root: string) => writeFileSync(join(root, 'templates/demo/app/lib/utils.ts'), 'export const cn = 1\n'), 'demo: app/lib/utils.ts differs from its source'],
    ['a synced file deleted', (root: string) => rmSync(join(root, 'templates/demo/app/components/SiteHeader.vue')), 'demo: app/components/SiteHeader.vue is missing'],
    ['a range older than the current version', (root: string) => {
      const path = join(root, 'templates/demo/package.json')
      writeFileSync(path, readFileSync(path, 'utf8').replace('^0.4.0', '^0.3.0'))
    }, 'demo: @lupinum/ginko is "^0.3.0"; expected ^0.4.0 or ^0.5.0'],
    ['a synced copy whose source left files.json', (root: string) => {
      writeFileSync(join(root, 'templates/_features/site/files.json'), JSON.stringify(['app/lib/utils.ts', 'app/assets/css/base.css', 'content/legal/1.privacy.md']))
    }, 'demo: app/components/SiteHeader.vue is a synced copy, but no feature\'s files.json lists it any more'],
    ['a share card colour that is not the accent', (root: string) => {
      mkdirSync(join(root, 'templates/demo/app/assets/css'), { recursive: true })
      writeFileSync(join(root, 'templates/demo/app/assets/css/main.css'), ':root {\n  --brand: #c2410c;\n}\n.dark {\n  --brand: #fdba74;\n}\n')
    }, 'demo: seo.color in ginko.config.ts is not set; set it to #c2410c'],
    ['a Latin line that ends in punctuation in an Arabic text', (root: string) => {
      mkdirSync(join(root, 'templates/demo/content/pages'), { recursive: true })
      // The second line is isolated (U+2068 … U+2069) and passes; the first would show as ".River Commons e.V".
      writeFileSync(join(root, 'templates/demo/content/pages/1.donate.ar.md'), '---\ntitle: "تبرّعوا"\n---\n\nRiver Commons e.V.\\\n\u2068River Commons e.V.\u2069\\\nIBAN: DE00 0000\n')
    }, 'demo: content/pages/1.donate.ar.md:5: "River Commons e.V." ends in punctuation'],
    ['a lockfile in the template', (root: string) => writeFileSync(join(root, 'templates/demo/package-lock.json'), '{}'), 'demo: package-lock.json must not be committed'],
    ['sample dates less than 90 days ahead', (root: string) => {
      const path = join(root, 'templates/demo/content/events/1.fair.md')
      writeFileSync(path, readFileSync(path, 'utf8').replace('2027-03-02', '2026-12-01').replace('2027-03-01', '2026-11-30'))
    }, 'demo: the last sample date (2026-12-01) is 47 days ahead of 2026-10-15; it must be at least 90 days ahead'],
  ])('fails on %s', async (_name, breakIt, problem) => {
    const root = await synced()
    breakIt(root)
    const problems = await syncCheck(root, { next: null, today: TODAY })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(problem)
  })

  it('accepts the next minor range while the release is pending', async () => {
    const root = repo()
    await sync(root, '0.5.0')
    expect(await syncCheck(root, { next: '0.5.0', today: TODAY })).toEqual([])
    expect(await syncCheck(root, { next: null, today: TODAY })).toEqual([])
  })
})

describe('test --only', () => {
  // Wrong behaviour caught: `--only 4 --mode single` or `--only 3` after a failed setup prints "0 passed, 0 failed"
  // and exits 0, though the requested gate never ran.
  const setupFailed: Result = { gate: 1, mode: 'both', check: 'create-ginko build + pack', ok: false }
  const gate3: Result = { gate: 3, mode: 'multi', check: 'e2e', ok: true }
  it.each([
    { gates: [4], modes: ['single'] as const, results: [], failed: ['gate 4 did not run: needs multi mode'] },
    { gates: [3], modes: ['single', 'multi'] as const, results: [setupFailed], failed: [undefined, 'gate 3 did not run: a setup step it needs failed'] },
    { gates: [3], modes: ['multi'] as const, results: [gate3], failed: [] },
  ])('gates $gates in $modes', ({ gates, modes, results, failed }) => {
    expect(withUnrun(results, gates, [...modes]).filter((r) => !r.ok).map((r) => r.detail)).toEqual(failed)
  })
})
