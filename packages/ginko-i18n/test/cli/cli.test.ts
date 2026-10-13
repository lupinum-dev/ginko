import { afterEach, describe, expect, test } from 'vitest'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const cli = resolve(import.meta.dirname, '../../src/cli/index.ts')
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ginko-cli-'))
  dirs.push(dir)
  cpSync(resolve(import.meta.dirname, 'fixture'), dir, { recursive: true })
  return dir
}
function read(dir: string, file: string) {
  return JSON.parse(readFileSync(join(dir, file), 'utf8'))
}
function write(dir: string, file: string, value: unknown) {
  mkdirSync(resolve(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), JSON.stringify(value, null, 2) + '\n')
}
function run(dir: string, args: string[], input?: unknown) {
  const result = spawnSync(process.execPath, [cli, ...args, '--cwd', dir, '--build-dir', 'build', '--json'], { encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input) })
  expect(result.error).toBeUndefined()
  const value = JSON.parse(result.stdout) // Also proves stdout contains exactly one JSON value.
  return { ...result, value }
}
function change(dir: string, edit: (tree: Record<string, unknown>) => void) {
  const value = read(dir, 'i18n/en.json')
  edit(value)
  write(dir, 'i18n/en.json', value)
}

// These cases catch false findings on valid messages and missed findings on broken messages.
describe('message and usage findings', () => {
  const cases: [string, (dir: string) => void][] = [
    ['missing', d => change(d, (v) => { delete v.last })],
    ['extra', d => change(d, (v) => { v.extra = 'Extra' })],
    ['invalid-icu', d => change(d, (v) => { v.hello = '{broken' })],
    ['params-mismatch', d => change(d, (v) => { v.hello = 'Hello {wrong}' })],
    ['plural-missing', d => change(d, (v) => { v.count = '{n, plural, =1 {One} other {Many}}' })],
    ['stale', d => write(d, 'i18n/i18n.lock.json', { en: { last: 'old-hash' } })],
    ['unknown-key', d => writeFileSync(join(d, 'src/page.vue'), 't(\'missing.key\')\n')],
    ['unused', d => writeFileSync(join(d, 'src/page.vue'), 't(\'hello\')\n')],
  ]
  test.each(cases)('%s positive and negative', (code, edit) => {
    const dir = fixture()
    expect(run(dir, ['check']).value.findings.filter((f: { code: string }) => f.code === code)).toEqual([])
    edit(dir)
    const result = run(dir, ['check'])
    expect(result.value.findings.some((f: { code: string }) => f.code === code)).toBe(true)
    expect(result.status).toBe(['missing', 'invalid-icu', 'params-mismatch', 'unknown-key'].includes(code) ? 1 : 0)
  })
  test('line location follows the parent; namespaced, template and component keys are scanned', () => {
    const dir = fixture()
    change(dir, (v) => {
      v.nested = { first: '{bad', second: 'Second' }
    })
    writeFileSync(join(dir, 'src/page.vue'), 'const x = useI18n(\'lib\')\nx.t(\'absent\')\nt(`unknown`)\n<I18nT k="component" />')
    const findings = run(dir, ['check']).value.findings
    expect(findings.find((f: { code: string }) => f.code === 'invalid-icu')).toMatchObject({ key: 'nested.first', line: 4, file: join(dir, 'i18n/en.json') })
    expect(findings.filter((f: { code: string }) => f.code === 'unknown-key').map((f: { key: string, line: number }) => [f.key, f.line])).toEqual([['lib.absent', 2], ['unknown', 3], ['component', 4]])
  })
  test.each(['t(key)', 't(`hello.${name}`)', 'x.t(key)'])('dynamic %s suppresses unused globally', (call) => {
    const dir = fixture()
    writeFileSync(join(dir, 'src/page.vue'), call)
    const result = run(dir, ['check']).value
    expect(result.summary.unusedSkipped).toBe(true)
    expect(result.findings.some((f: { code: string }) => f.code === 'unused')).toBe(false)
  })
  test('later source wins and replaced branches disappear; check leaves files unchanged', () => {
    const dir = fixture()
    write(dir, 'i18n/de.json', { overridden: 'New', nested: 'Flat' })
    write(dir, 'layer/de.json', { overridden: 'Old', nested: { hidden: 'Hidden' } })
    const before = readFileSync(join(dir, 'i18n/de.json'), 'utf8')
    const result = run(dir, ['todo', '--to', 'en']).value
    expect(result.items.find((i: { key: string }) => i.key === 'nested.hidden')).toBeUndefined()
    run(dir, ['check'])
    expect(readFileSync(join(dir, 'i18n/de.json'), 'utf8')).toBe(before)
    expect(existsSync(join(dir, 'i18n/i18n.lock.json'))).toBe(false)
  })
  test('global params can be absent from either side; ordinals and nested plurals use Intl categories', () => {
    const dir = fixture()
    change(dir, (v) => {
      v.count = '{n, selectordinal, one {1st} other {{m, plural, other {Many}}}}'
    })
    const findings = run(dir, ['check']).value.findings
    expect(findings.some((f: { key: string, code: string }) => f.key === 'global' && f.code === 'params-mismatch')).toBe(false)
    expect(findings.find((f: { code: string }) => f.code === 'plural-missing').message).toBe('Missing plural categories: two (e.g. 2, 22), few (e.g. 3), one (e.g. 1)')
  })
})

function html(canonical = '/', alternates = ['/', '/en'], lang = 'de-AT') {
  return `<html lang="${lang}"><head><link rel="canonical" href="https://site.test${canonical}">${alternates.map((url, i) => `<link rel="alternate" hreflang="${i ? 'en-GB' : 'de-AT'}" href="https://site.test${url}">`).join('')}<link rel="alternate" hreflang="x-default" href="https://site.test/"></head></html>`
}
describe('SEO findings', () => {
  const cases: [string, (dir: string) => void][] = [
    ['seo-canonical', d => writeFileSync(join(d, 'site/index.html'), html().replace('href="https://site.test/"', 'href="/"'))],
    ['seo-hreflang-self', d => writeFileSync(join(d, 'site/en/index.html'), html('/en', ['/'], 'en-GB'))],
    ['seo-hreflang-reciprocal', d => writeFileSync(join(d, 'site/en/index.html'), html('/en', ['/en'], 'en-GB').replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, ''))],
    ['seo-x-default', d => writeFileSync(join(d, 'site/index.html'), html().replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, ''))],
    ['seo-lang', d => writeFileSync(join(d, 'site/index.html'), html('/', ['/', '/en'], 'de'))],
  ]
  test.each(cases)('%s positive and negative', (code, edit) => {
    const dir = fixture()
    mkdirSync(join(dir, 'site/en'), { recursive: true })
    writeFileSync(join(dir, 'site/index.html'), html())
    writeFileSync(join(dir, 'site/en/index.html'), html('/en', ['/', '/en'], 'en-GB'))
    expect(run(dir, ['check', '--html', 'site']).value.findings.filter((f: { code: string }) => f.code === code)).toEqual([])
    edit(dir)
    expect(run(dir, ['check', '--html', 'site']).value.findings.some((f: { code: string }) => f.code === code)).toBe(true)
  })
  test('ignores noindex pages and error documents', () => {
    const dir = fixture()
    mkdirSync(join(dir, 'site'))
    for (const file of ['200.html', '404.html']) writeFileSync(join(dir, 'site', file), '<html>')
    writeFileSync(join(dir, 'site/ignored.html'), '<html><meta content="noindex, follow" name="robots">')
    expect(run(dir, ['check', '--html', 'site']).value.findings).toEqual([])
  })
})

test('todo provides source, current, params, glossary, usage and filters', () => {
  const dir = fixture()
  change(dir, (v) => {
    delete v.hello
  })
  write(dir, 'i18n/i18n.lock.json', { en: { last: 'old' } })
  write(dir, 'i18n/glossary.json', { brand: 'Brand' })
  const result = run(dir, ['todo', '--to', 'en']).value
  expect(result).toMatchObject({ locale: 'en', language: 'en-GB', sourceLocale: 'de', sourceLanguage: 'de-AT', params: { tone: 'sie' }, glossary: { brand: 'Brand' } })
  expect(result.items).toEqual([{ key: 'hello', target: join(dir, 'i18n/en.json'), source: 'Hallo {name}', params: ['name'], usages: [`${join(dir, 'src/page.vue')}:5`], reason: 'missing' }, { key: 'last', target: join(dir, 'i18n/en.json'), source: 'Letzte', current: 'Last', params: [], usages: [`${join(dir, 'src/page.vue')}:10`], reason: 'stale' }])
  expect(run(dir, ['todo', '--to', 'en', '--only', 'stale']).value.items.map((i: { key: string }) => i.key)).toEqual(['last'])
  expect(run(dir, ['todo', '--locale', 'en', '--only', 'stale']).value.items.map((i: { key: string }) => i.key)).toEqual(['last'])
})

test('apply accepts valid items, rejects bad params/ICU/unknown keys, writes library overrides and ordered keys with hashes', () => {
  const dir = fixture()
  write(dir, 'i18n/en.json', { unrelated: 'Keep', nested: { second: 'Second' } })
  const result = run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'last', text: 'Final' }, { key: 'nested.first', text: 'First' }, { key: 'hello', text: 'Wrong {who}' }, { key: 'count', text: '{broken' }, { key: 'absent', text: 'No' }, { key: 'lib.second', text: 'Override second' }, { key: 'lib.first', text: 'Override first' }, { key: 'layer', text: 'Updated layer' }] })
  expect(result.status).toBe(1)
  expect(result.value.rejected.map((i: { key: string }) => i.key)).toEqual(['hello', 'count', 'absent'])
  expect(result.value.written.map((i: { key: string }) => i.key)).toEqual(['last', 'nested.first', 'lib.second', 'lib.first', 'layer'])
  const output = read(dir, 'i18n/en.json')
  expect(Object.keys(output)).toEqual(['lib', 'nested', 'last', 'unrelated'])
  expect(Object.keys(output.nested)).toEqual(['first', 'second'])
  expect(Object.keys(output.lib)).toEqual(['first', 'second'])
  expect(output.unrelated).toBe('Keep')
  expect(read(dir, 'library/en.json').first).toBe('Library')
  expect(read(dir, 'layer/en.json').layer).toBe('Updated layer')
  expect(read(dir, 'i18n/i18n.lock.json').en.last).toBe(createHash('sha256').update('Letzte').digest('hex'))
  expect(readFileSync(join(dir, 'i18n/en.json'), 'utf8')).toMatch(/\n {2}"nested": \{\n {4}"first":/)
  expect(readFileSync(join(dir, 'i18n/en.json'), 'utf8').endsWith('\n')).toBe(true)
})
test('apply refuses the default locale and leaves its source untouched', () => {
  const dir = fixture()
  const before = readFileSync(join(dir, 'i18n/de.json'), 'utf8')
  const result = run(dir, ['apply', '-'], { locale: 'de', items: [{ key: 'last', text: 'Rewritten' }] })
  expect(result.status).toBe(2)
  expect(result.value.error).toMatch(/default locale/)
  expect(readFileSync(join(dir, 'i18n/de.json'), 'utf8')).toBe(before)
})
test('apply file input succeeds, plural incompleteness is a JSON warning with examples, and creates missing target', () => {
  const dir = fixture()
  rmSync(join(dir, 'i18n/en.json'))
  write(dir, 'translation.json', { locale: 'en', items: [{ key: 'count', text: '{n, plural, other {Many}}' }] })
  const result = run(dir, ['apply', 'translation.json'])
  expect(result.status).toBe(0)
  expect(result.value.warnings).toEqual([{ key: 'count', message: 'Missing plural categories: one (e.g. 1)' }])
  expect(read(dir, 'i18n/en.json')).toEqual({ count: '{n, plural, other {Many}}' })
})
test('apply rejects a symlink outside a source and never writes its target', () => {
  const dir = fixture(), outside = fixture()
  rmSync(join(dir, 'i18n/en.json'))
  symlinkSync(join(outside, 'i18n/en.json'), join(dir, 'i18n/en.json'))
  const before = readFileSync(join(outside, 'i18n/en.json'), 'utf8')
  const result = run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'last', text: 'Escape' }] })
  expect(result.status).toBe(1)
  expect(result.value.rejected[0].reason).toContain('escapes')
  expect(readFileSync(join(outside, 'i18n/en.json'), 'utf8')).toBe(before)
})
test.each([['bogus'], ['todo'], ['todo', '--to', 'xx'], ['todo', '--to', 'en', '--only', 'extra'], ['apply'], ['check', '--bad'], ['check', 'extra'], ['apply', '-', '--html', 'site']])('usage error %j returns JSON and exit 2', (...args) => {
  expect(run(fixture(), args).status).toBe(2)
})
test('success, rejected and config outputs are pure JSON with documented exit codes', () => {
  const dir = fixture()
  expect(run(dir, ['check']).status).toBe(0)
  expect(run(dir, ['--help']).status).toBe(0)
  expect(run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'last', text: 'Last' }] }).status).toBe(0)
  write(dir, 'build/ginko-i18n/manifest.json', {})
  expect(run(dir, ['check']).status).toBe(2)
})
test('missing manifest prepares once using the app local binary and keeps its logs on stderr', () => {
  const dir = fixture()
  rmSync(join(dir, 'build/ginko-i18n/manifest.json'))
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules/.bin/nuxt'), '#!/bin/sh\necho preparing\necho "$1" >> prepare-calls\n', { mode: 0o755 })
  const result = run(dir, ['check'])
  expect(result.status).toBe(2)
  expect(result.stderr).toContain('preparing')
  expect(readFileSync(join(dir, 'prepare-calls'), 'utf8')).toBe('prepare\n')
})

test('library-only app creates its i18n directory and orders unnamespaced override keys', () => {
  const dir = fixture(), m = read(dir, 'build/ginko-i18n/manifest.json')
  m.sources = [{ dir: 'library', origin: 'library' }]
  write(dir, 'build/ginko-i18n/manifest.json', m)
  rmSync(join(dir, 'i18n'), { recursive: true })
  const result = run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'second', text: 'Second override' }, { key: 'first', text: 'First override' }] })
  expect(result.status).toBe(0)
  expect(Object.keys(read(dir, 'i18n/en.json'))).toEqual(['first', 'second'])
  expect(read(dir, 'library/en.json').first).toBe('Library')
})
test('apply rejects dangling file symlinks and an i18n directory symlink before writing', () => {
  const dir = fixture(), outside = fixture()
  rmSync(join(dir, 'i18n/en.json'))
  symlinkSync(join(outside, 'absent.json'), join(dir, 'i18n/en.json'))
  expect(run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'last', text: 'Escape' }] }).status).toBe(1)
  expect(existsSync(join(outside, 'absent.json'))).toBe(false)
  rmSync(join(dir, 'i18n'), { recursive: true })
  symlinkSync(join(outside, 'i18n'), join(dir, 'i18n'))
  const before = readFileSync(join(outside, 'i18n/en.json'), 'utf8')
  expect(run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'lib.first', text: 'Escape' }] }).status).toBe(1)
  expect(readFileSync(join(outside, 'i18n/en.json'), 'utf8')).toBe(before)
})
test('library reference order survives a partial app default override and reversed apply items', () => {
  const dir = fixture(), defaults = read(dir, 'i18n/de.json')
  defaults.lib = { second: 'App default second' }
  write(dir, 'i18n/de.json', defaults)
  const result = run(dir, ['apply', '-'], { locale: 'en', items: [{ key: 'lib.second', text: 'Second override' }, { key: 'lib.first', text: 'First override' }] })
  expect(result.status).toBe(0)
  expect(Object.keys(read(dir, 'i18n/en.json').lib)).toEqual(['first', 'second'])
})

// Destructured namespaces were missed: `const { t: libT } = useI18n('ns')` made `libT('a')` invisible,
// and `const { t } = useI18n('ns')` counted `t('a')` as the root key `a`.
test('destructured namespaced translators and expected type errors are scanned correctly', () => {
  const dir = fixture()
  const ns = read(dir, 'build/ginko-i18n/manifest.json').sources.find((s: { namespace?: string }) => s.namespace).namespace
  const key = Object.keys(read(dir, 'library/de.json'))[0]
  writeFileSync(join(dir, 'src/page.vue'), [
    `const { t: libT } = useI18n('${ns}')`,
    `libT('${key}')`,
    `// @ts-expect-error wrong on purpose`,
    `t('not.a.key')`,
  ].join('\n'))
  writeFileSync(join(dir, 'src/other.ts'), `const { t } = useI18n('${ns}')\nt('${key}')\n`)
  const findings = run(dir, ['check']).value.findings as { code: string, key?: string }[]
  expect(findings.filter(f => f.code === 'unknown-key')).toEqual([])
  expect(findings.some(f => f.code === 'unknown-key' && f.key === key)).toBe(false)
})

// Agents could not narrow mixed output to the locale they were translating.
test('check --locale keeps only that locale and todo names each target file', () => {
  const dir = fixture()
  change(dir, (v) => {
    delete v.last
  })
  const findings = run(dir, ['check', '--locale', 'en']).value.findings as { locale?: string }[]
  expect(findings.length).toBeGreaterThan(0)
  expect(findings.every(f => f.locale === 'en')).toBe(true)
  const items = run(dir, ['todo', '--to', 'en']).value.items as { key: string, target: string }[]
  expect(items.find(i => i.key === 'last')?.target).toBe(join(dir, 'i18n/en.json'))
})

// The CLI rejected `pt-BR` as a manifest code and as a file name, while the module accepts it as a URL code.
test('a mixed-case locale code works from the manifest and in --dir mode', () => {
  const dir = fixture(), m = read(dir, 'build/ginko-i18n/manifest.json')
  m.locales[1].code = 'pt-BR'
  m.locales[1].language = 'pt-BR'
  write(dir, 'build/ginko-i18n/manifest.json', m)
  for (const folder of ['i18n', 'layer', 'library']) rmSync(join(dir, folder, 'en.json'))
  const result = run(dir, ['apply', '-'], { locale: 'pt-BR', items: [{ key: 'last', text: 'Último' }] })
  expect(result.status).toBe(0)
  expect(read(dir, 'i18n/pt-BR.json')).toEqual({ last: 'Último' })
  write(dir, 'catalog/de.json', { a: 'Hallo' })
  write(dir, 'catalog/pt-BR.json', { a: 'Olá' })
  expect(run(dir, ['check', '--dir', 'catalog', '--default-locale', 'de']).status).toBe(0)
})

// A dotted key was typed as available, unreachable at runtime, and invisible to check.
test('a message key with a dot is a config error that names the file and the fix', () => {
  const dir = fixture()
  change(dir, (v) => {
    v['v1.2'] = 'Version'
  })
  const result = run(dir, ['check'])
  expect(result.status).toBe(2)
  expect(result.value.error).toContain(`contains "."`)
  expect(result.value.error).toContain(join(dir, 'i18n/en.json'))
})

// --dir mode: a plain catalog folder without Nuxt; the lock and glossary live beside the catalogs.
test('--dir catalog folder: check skips unused keys, apply writes catalog and lock beside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ginko-dir-'))
  dirs.push(dir)
  write(dir, 'catalog/de.json', { a: 'Hallo {name}', b: 'Nur' })
  write(dir, 'catalog/en.json', { a: 'Hi' })
  const checked = run(dir, ['check', '--dir', 'catalog', '--default-locale', 'de'])
  expect(checked.status).toBe(1)
  expect(checked.value.summary).toEqual({ errors: 2, warnings: 0, unusedSkipped: true })
  expect(checked.value.findings.map((f: { code: string, locale: string, key: string }) => [f.code, f.locale, f.key])).toEqual([['missing', 'en', 'b'], ['params-mismatch', 'en', 'a']])
  const applied = run(dir, ['apply', '-', '--dir', 'catalog', '--default-locale', 'de'], { locale: 'en', items: [{ key: 'b', text: 'Only' }] })
  expect(applied.status).toBe(0)
  expect(read(dir, 'catalog/en.json')).toEqual({ a: 'Hi', b: 'Only' })
  expect(read(dir, 'catalog/i18n.lock.json')).toEqual({ en: { b: createHash('sha256').update('Nur').digest('hex') } })
  expect(existsSync(join(dir, 'i18n'))).toBe(false)
  expect(run(dir, ['check', '--dir', 'catalog', '--default-locale', 'de']).value.findings.map((f: { code: string }) => f.code)).toEqual(['params-mismatch'])
  // A new language has no file yet: `todo --to es` must list every key, written to catalog/es.json.
  const todo = run(dir, ['todo', '--to', 'es', '--dir', 'catalog', '--default-locale', 'de']).value
  expect(todo.items.map((i: { key: string, target: string }) => [i.key, i.target.endsWith('catalog/es.json')])).toEqual([['a', true], ['b', true]])
})
test.each([[['check', '--dir', 'catalog']], [['check', '--dir', 'catalog', '--default-locale', 'fr']], [['check', '--default-locale', 'de']]])('--dir usage error %j returns JSON and exit 2', (args) => {
  const dir = mkdtempSync(join(tmpdir(), 'ginko-dir-'))
  dirs.push(dir)
  write(dir, 'catalog/de.json', { a: 'Hallo' })
  const result = run(dir, args)
  expect(result.status).toBe(2)
  expect(result.value.error).toMatch(/--default|Unknown default locale/)
})
