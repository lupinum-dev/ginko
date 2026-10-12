import { existsSync, readFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs'
import { resolve, join, relative, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

export interface Source { dir: string, namespace?: string, origin: string }
// catalogDir: folder for i18n.lock.json and glossary.json; set only by dirManifest (--dir mode).
export interface Manifest { locales: { code: string, language: string }[], defaultLocale: string, params: Record<string, unknown>, sources: Source[], srcDirs: string[], catalogDir?: string }
export interface Entry { text: string, file: string, line: number, source: Source, localKey: string }
export type Tree = { [key: string]: string | Tree }
export const json = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as unknown
export const hash = (text: string) => createHash('sha256').update(text).digest('hex')
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function tree(file: string): Tree {
  if (!existsSync(file)) return {}
  const value = json(file)
  const valid = (v: unknown): boolean => object(v) && Object.values(v).every(x => typeof x === 'string' || valid(x))
  if (!valid(value)) throw new Error(`Invalid message tree: ${file}`)
  return value as Tree
}
export function manifest(cwd: string, buildDir: string): Manifest {
  const file = join(buildDir, 'ginko-i18n/manifest.json')
  if (!existsSync(file)) {
    const bin = join(cwd, 'node_modules/.bin/nuxt')
    const result = spawnSync(bin, ['prepare'], { cwd, encoding: 'utf8' })
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) process.stderr.write(`${result.error.message}\n`)
  }
  if (!existsSync(file)) throw new Error(`Manifest missing: ${file}`)
  const m = json(file)
  if (!object(m) || !Array.isArray(m.locales) || !Array.isArray(m.sources) || !Array.isArray(m.srcDirs) || !object(m.params) || typeof m.defaultLocale !== 'string') throw new Error('Invalid manifest')
  for (const locale of m.locales) {
    if (!object(locale) || typeof locale.code !== 'string' || !/^[a-z][a-z0-9-]*$/.test(locale.code) || typeof locale.language !== 'string') throw new Error('Invalid manifest locale')
    new Intl.PluralRules(locale.language)
  }
  if (!m.locales.some(l => l.code === m.defaultLocale)) throw new Error('Unknown default locale')
  for (const source of m.sources) if (!object(source) || typeof source.dir !== 'string' || typeof source.origin !== 'string' || (source.namespace !== undefined && typeof source.namespace !== 'string')) throw new Error('Invalid manifest source')
  if (!m.srcDirs.every(d => typeof d === 'string')) throw new Error('Invalid manifest srcDirs')
  const result = m as unknown as Manifest
  result.sources = result.sources.map(s => ({ ...s, dir: resolve(cwd, s.dir) }))
  result.srcDirs = result.srcDirs.map(d => resolve(cwd, d))
  return result
}
// --dir mode: a plain folder of `<code>.json` catalogs, without Nuxt or source scanning.
const reserved = ['i18n.lock.json', 'glossary.json']
// `target` (`todo --to es`) may name a locale without a file yet: that is how a new language starts.
export function dirManifest(folder: string, defaultLocale: string, target?: string): Manifest {
  const codes = readdirSync(folder, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.json') && !reserved.includes(e.name))
    .map(e => e.name.slice(0, -'.json'.length))
  const locales = [...new Set([...codes, ...(target ? [target] : [])])]
    .sort()
    .map((code) => {
      if (!/^[a-z][a-z0-9-]*$/.test(code)) throw new Error(`Invalid locale file name: ${code}.json`)
      new Intl.PluralRules(code)
      return { code, language: code }
    })
  if (!locales.some(l => l.code === defaultLocale)) throw new Error(`Unknown default locale: ${defaultLocale}`)
  return { locales, defaultLocale, params: {}, sources: [{ dir: folder, origin: 'app' }], srcDirs: [], catalogDir: folder }
}
export function entries(m: Manifest, code: string): Map<string, Entry> {
  const out = new Map<string, Entry>()
  for (const source of m.sources) {
    const file = join(source.dir, `${code}.json`)
    const raw = tree(file)
    const content = existsSync(file) ? readFileSync(file, 'utf8') : ''
    // Locate keys inside their parent, rather than confusing repeated leaf names.
    let cursor = 0
    const visit = (node: Tree, prefix: string) => {
      for (const [segment, value] of Object.entries(node)) {
        const at = content.indexOf(JSON.stringify(segment), cursor)
        if (at >= 0) cursor = at + JSON.stringify(segment).length
        const localKey = prefix ? `${prefix}.${segment}` : segment
        const key = source.namespace ? `${source.namespace}.${localKey}` : localKey
        if (typeof value === 'string') {
          for (const old of out.keys()) if (old === key || old.startsWith(`${key}.`) || key.startsWith(`${old}.`)) out.delete(old)
          out.set(key, { text: value, file, line: content.slice(0, Math.max(0, at)).split('\n').length, source, localKey })
        }
        else {
          // Object merges preserve children from earlier sources, replacing only a scalar parent.
          out.delete(key)
          visit(value, localKey)
        }
      }
    }
    visit(raw, '')
  }
  return out
}
// Agents asked what "many" means for a locale: name the category with sample numbers from Intl.
const SAMPLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 21, 22, 101, 1000000, 1.5, 0.5]
function describeCategory(language: string, ordinal: boolean, category: string) {
  const rules = new Intl.PluralRules(language, { type: ordinal ? 'ordinal' : 'cardinal' })
  const examples = SAMPLES.filter(n => rules.select(n) === category).slice(0, 3)
  return examples.length ? `${category} (e.g. ${examples.join(', ')})` : category
}
export function analyze(text: string, language: string) {
  const params = new Set<string>(), missing = new Set<string>()
  const visit = (nodes: MessageFormatElement[]) => {
    for (const node of nodes) {
      if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.select, TYPE.plural].includes(node.type)) params.add(String('value' in node ? node.value : ''))
      if (node.type === TYPE.plural) {
        const categories = new Intl.PluralRules(language, { type: node.pluralType === 'ordinal' ? 'ordinal' : 'cardinal' }).resolvedOptions().pluralCategories
        for (const category of new Set([...categories, 'other'])) if (!(category in node.options)) missing.add(describeCategory(language, node.pluralType === 'ordinal', category))
      }
      if (node.type === TYPE.plural || node.type === TYPE.select) for (const option of Object.values(node.options)) visit(option.value)
      if (node.type === TYPE.tag) visit(node.children)
    }
  }
  visit(parse(text, { requiresOtherClause: true }))
  return { params: [...params].sort(), missing: [...missing] }
}
export function sameParams(a: string[], b: string[], globals: Record<string, unknown>) {
  return JSON.stringify(a.filter(p => !Object.hasOwn(globals, p))) === JSON.stringify(b.filter(p => !Object.hasOwn(globals, p)))
}
export function files(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.nuxt', '.output', 'dist'].includes(e.name) || e.isSymbolicLink()) return []
    const file = join(dir, e.name)
    return e.isDirectory() ? files(file, extensions) : extensions.some(ext => file.endsWith(ext)) ? [file] : []
  })
}
export function usages(m: Manifest) {
  const used = new Map<string, string[]>()
  let dynamic = false
  for (const file of new Set(m.srcDirs.flatMap(d => files(d, ['.vue', '.ts', '.js'])))) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    // Translate functions in this file and their namespace ('' = none):
    // `const i = useI18n('ns')` → `i.t(…)`; `const { t } = useI18n('ns')` and `const { t: tl } = …` → `t(…)`, `tl(…)`.
    const objects = new Map<string, string>()
    const functions = new Map<string, string>([['t', '']])
    for (const match of text.matchAll(/\bconst\s+(\w+)\s*=\s*useI18n\(\s*(?:(['"])(.*?)\2\s*)?\)/g)) objects.set(match[1]!, match[3] ?? '')
    for (const match of text.matchAll(/\bconst\s*\{([^}]*)\}\s*=\s*useI18n\(\s*(?:(['"])(.*?)\2\s*)?\)/g)) {
      const t = /(?:^|,)\s*t\s*(?::\s*(\w+)\s*)?(?:,|$)/.exec(match[1]!)
      if (t) functions.set(t[1] ?? 't', match[3] ?? '')
    }
    const names = [...functions.keys()].map(n => n.replace(/\$/g, '\\$')).join('|')
    const calls = new RegExp(`(?:(\\b\\w+)\\s*\\.\\s*t|(?<![\\w$.])(${names}))\\s*\\(\\s*([^)]*)|<I18nT\\b[^>]*\\bk\\s*=\\s*(['"])(.*?)\\4`, 'g')
    for (const match of text.matchAll(calls)) {
      const line = text.slice(0, match.index).split('\n').length
      // A key on the line after `@ts-expect-error` / `@vue-expect-error` is wrong on purpose (type tests).
      if (/@(?:ts|vue)-expect-error/.test(lines[line - 2] ?? '')) continue
      let key = match[5]
      if (key === undefined) {
        const literal = /^(['"`])([\s\S]*?)\1\s*(?:,|$)/.exec(match[3]!)
        if (!literal || (literal[1] === '`' && literal[2]!.includes('${'))) {
          dynamic = true
          continue
        }
        const namespace = match[1] !== undefined ? objects.get(match[1]) : functions.get(match[2]!)
        if (match[1] !== undefined && namespace === undefined) continue // `x.t()` on something that is not useI18n
        key = namespace ? `${namespace}.${literal[2]}` : literal[2]!
      }
      used.set(key, [...(used.get(key) ?? []), `${file}:${line}`])
    }
  }
  return { used, dynamic }
}
// Resolve existing ancestors too, so a symlink cannot redirect a write out of a source directory.
export function safeTarget(dir: string, file: string) {
  if (lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Write escapes source directory through symlink: ${dir}`)
  const physical = (path: string) => {
    let ancestor = path
    while (!lstatSync(ancestor, { throwIfNoEntry: false })) ancestor = dirname(ancestor)
    return resolve(realpathSync(ancestor), relative(ancestor, path))
  }
  const base = physical(dir), actual = physical(file)
  if (actual !== base && !actual.startsWith(`${base}/`)) throw new Error(`Write escapes source directory: ${file}`)
}
