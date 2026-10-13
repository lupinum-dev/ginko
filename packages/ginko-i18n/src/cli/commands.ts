import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyze, entries, hash, json, object, safeTarget, sameParams, tree, usages, type Manifest, type Tree } from './data.ts'
import { seo } from './seo.ts'

/** Folder for i18n.lock.json and glossary.json: the --dir folder, or the app's i18n/ folder. */
function catalogDir(m: Manifest, cwd: string) {
  return m.catalogDir ?? join(cwd, 'i18n')
}

export interface Finding { code: string, severity: 'error' | 'warning', locale?: string, key?: string, file?: string, line?: number, message: string }
export function check(m: Manifest, cwd: string, html?: string, only?: string) {
  const findings: Finding[] = [], defaults = entries(m, m.defaultLocale), scan = usages(m)
  const lockFile = join(catalogDir(m, cwd), 'i18n.lock.json')
  const lock = existsSync(lockFile) ? json(lockFile) : {}
  if (!object(lock)) throw new Error('Invalid translation lock')
  for (const locale of m.locales) {
    const own = entries(m, locale.code)
    if (locale.code !== m.defaultLocale) {
      for (const [key, source] of defaults) {
        if (!own.has(key)) findings.push({ code: 'missing', severity: 'error', locale: locale.code, key, file: source.file, line: source.line, message: 'Missing translation' })
        const stored = lock[locale.code]
        if (object(stored) && typeof stored[key] === 'string' && stored[key] !== hash(source.text)) findings.push({ code: 'stale', severity: 'warning', locale: locale.code, key, file: own.get(key)?.file ?? source.file, message: 'Default message changed since translation' })
      }
    }
    for (const [key, entry] of own) {
      const base = { locale: locale.code, key, file: entry.file, line: entry.line }
      if (!defaults.has(key)) findings.push({ ...base, code: 'extra', severity: 'warning', message: 'Key absent from default locale' })
      try {
        const result = analyze(entry.text, locale.language)
        if (result.missing.length) findings.push({ ...base, code: 'plural-missing', severity: 'warning', message: `Missing plural categories: ${result.missing.join(', ')}` })
        const source = defaults.get(key)
        if (source && locale.code !== m.defaultLocale) {
          let params: string[] | undefined
          try {
            params = analyze(source.text, m.locales.find(l => l.code === m.defaultLocale)!.language).params
          }
          catch { /* Default's invalid-icu finding owns this failure. */ }
          if (params && !sameParams(result.params, params, m.params)) findings.push({ ...base, code: 'params-mismatch', severity: 'error', message: 'Parameters differ from default locale' })
        }
      }
      catch (error) { findings.push({ ...base, code: 'invalid-icu', severity: 'error', message: (error as Error).message }) }
    }
  }
  for (const [key, locations] of scan.used) if (!defaults.has(key)) for (const location of locations) {
    const split = location.lastIndexOf(':')
    findings.push({ code: 'unknown-key', severity: 'error', key, file: location.slice(0, split), line: Number(location.slice(split + 1)), message: 'Static key absent from default locale' })
  }
  // Without source directories (--dir mode) every key would look unused, so the check is skipped.
  const unusedSkipped = scan.dynamic || m.srcDirs.length === 0
  if (!unusedSkipped) for (const [key, entry] of defaults) if (entry.source.origin !== 'library' && !entry.file.split(/[\\/]/).includes('node_modules') && !scan.used.has(key)) findings.push({ code: 'unused', severity: 'warning', key, file: entry.file, message: 'No static usage found' })
  if (html) findings.push(...seo(html, m))
  // `--locale it`: only that locale's findings, so agents do not have to filter mixed output.
  if (only) findings.splice(0, findings.length, ...findings.filter(f => f.locale === only))
  const errors = findings.filter(f => f.severity === 'error').length, warnings = findings.filter(f => f.severity === 'warning').length
  return { ok: errors === 0, summary: { errors, warnings, ...(unusedSkipped ? { unusedSkipped: true } : {}) }, findings }
}
export function todo(m: Manifest, cwd: string, code: string, only: string[]) {
  const locale = m.locales.find(l => l.code === code)
  if (!locale) throw new Error(`Unknown locale: ${code}`)
  const sourceLocale = m.locales.find(l => l.code === m.defaultLocale)!, defaults = entries(m, m.defaultLocale), own = entries(m, code), scan = usages(m)
  const findings = check(m, cwd).findings.filter(f => f.locale === code && only.includes(f.code))
  const glossaryFile = join(catalogDir(m, cwd), 'glossary.json')
  return { locale: code, language: locale.language, sourceLocale: sourceLocale.code, sourceLanguage: sourceLocale.language, params: m.params, glossary: existsSync(glossaryFile) ? json(glossaryFile) : null,
    items: [...new Set(findings.map(f => f.key!))].map(key => ({ key, target: target(m, cwd, defaults.get(key)!, code), source: defaults.get(key)!.text, ...(own.has(key) ? { current: own.get(key)!.text } : {}), params: analyze(defaults.get(key)!.text, sourceLocale.language).params, usages: scan.used.get(key) ?? [], reason: findings.find(f => f.key === key)!.code as 'missing' | 'stale' })) }
}
/** Where `apply` writes a key: the source that defines it, or the app for library keys. */
function target(m: Manifest, cwd: string, source: ReturnType<typeof entries> extends Map<string, infer E> ? E : never, code: string) {
  const library = source.source.origin === 'library' || source.file.split(/[\\/]/).includes('node_modules')
  return join(library ? catalogDir(m, cwd) : source.source.dir, `${code}.json`)
}
function set(node: Tree, key: string, text: string) {
  const segments = key.split('.')
  for (const segment of segments.slice(0, -1)) {
    if (!Object.hasOwn(node, segment) || typeof node[segment] === 'string') Object.defineProperty(node, segment, { value: {}, enumerable: true, writable: true, configurable: true })
    node = node[segment] as Tree
  }
  Object.defineProperty(node, segments.at(-1)!, { value: text, enumerable: true, writable: true, configurable: true })
}
function order(node: Tree, reference: Tree): Tree {
  const out: Tree = {}
  for (const key of new Set([...Object.keys(reference), ...Object.keys(node)])) if (Object.hasOwn(node, key)) {
    const value = node[key], ref = reference[key]
    Object.defineProperty(out, key, { value: typeof value === 'string' ? value : order(value!, typeof ref === 'object' ? ref : {}), enumerable: true })
  }
  return out
}
function mergeReference(first: Tree, later: Tree): Tree {
  const result: Tree = { ...first }
  for (const [key, value] of Object.entries(later)) {
    const previous = result[key]
    Object.defineProperty(result, key, { value: typeof value === 'object' && typeof previous === 'object' ? mergeReference(previous, value) : value, enumerable: true, configurable: true, writable: true })
  }
  return result
}
export function apply(m: Manifest, cwd: string, input: unknown) {
  if (!object(input) || typeof input.locale !== 'string' || !Array.isArray(input.items)) throw new Error('Expected { locale, items: [{ key, text }] }')
  const locale = m.locales.find(l => l.code === input.locale)
  if (!locale) throw new Error(`Unknown locale: ${input.locale}`)
  if (locale.code === m.defaultLocale) throw new Error(`"${locale.code}" is the default locale: its messages are the source. Fix: edit the source files, or apply translations to another locale.`)
  const defaults = entries(m, m.defaultLocale), sourceLocale = m.locales.find(l => l.code === m.defaultLocale)!
  const written: { key: string, file: string }[] = [], rejected: { key: string, reason: string }[] = [], warnings: { key: string, message: string }[] = []
  const targets = new Map<string, { dir: string, value: Tree, reference: Tree }>()
  const lockFile = join(catalogDir(m, cwd), 'i18n.lock.json'), lockValue = existsSync(lockFile) ? json(lockFile) : {}
  if (!object(lockValue)) throw new Error('Invalid translation lock')
  const lock = lockValue as Record<string, Record<string, string>>
  if (lock[locale.code] !== undefined && !object(lock[locale.code])) throw new Error('Invalid locale translation lock')
  const updates: Record<string, string> = {}
  for (const item of input.items) {
    const key = object(item) && typeof item.key === 'string' ? item.key : '(invalid item)'
    try {
      if (!object(item) || typeof item.key !== 'string' || typeof item.text !== 'string') throw new Error('Expected key and text strings')
      const source = defaults.get(key)
      if (!source) throw new Error('Unknown source key')
      const result = analyze(item.text, locale.language), original = analyze(source.text, sourceLocale.language)
      if (!sameParams(result.params, original.params, m.params)) throw new Error('Parameters differ from default locale')
      if (result.missing.length) warnings.push({ key, message: `Missing plural categories: ${result.missing.join('; ')}` })
      const library = source.source.origin === 'library' || source.file.split(/[\\/]/).includes('node_modules')
      const dir = library ? catalogDir(m, cwd) : source.source.dir, file = join(dir, `${locale.code}.json`)
      safeTarget(dir, file)
      let target = targets.get(file)
      if (!target) {
        const appReference = tree(join(catalogDir(m, cwd), `${m.defaultLocale}.json`))
        let reference = tree(source.file)
        if (dir === catalogDir(m, cwd)) {
          let libraries: Tree = {}
          for (const source of m.sources) {
            if (source.origin !== 'library' && !source.dir.split(/[\\/]/).includes('node_modules')) continue
            const raw = tree(join(source.dir, `${m.defaultLocale}.json`))
            libraries = mergeReference(libraries, source.namespace ? { [source.namespace]: raw } : raw)
          }
          reference = mergeReference(libraries, appReference)
        }
        target = { dir, value: tree(file), reference }
        targets.set(file, target)
      }
      set(target.value, library ? key : source.localKey, item.text)
      Object.defineProperty(updates, key, { value: hash(source.text), enumerable: true, configurable: true })
      written.push({ key, file })
    }
    catch (error) { rejected.push({ key, reason: (error as Error).message }) }
  }
  if (written.length) {
    safeTarget(catalogDir(m, cwd), lockFile)
    for (const [file, target] of targets) {
      mkdirSync(target.dir, { recursive: true })
      writeFileSync(file, `${JSON.stringify(order(target.value, target.reference), null, 2)}\n`)
    }
    Object.defineProperty(lock, locale.code, { value: { ...lock[locale.code], ...updates }, enumerable: true, configurable: true })
    mkdirSync(catalogDir(m, cwd), { recursive: true })
    writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`)
  }
  return { written, rejected, warnings }
}
