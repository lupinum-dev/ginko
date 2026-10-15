// What create-ginko does to the files of a copied template: pick its languages and move its sample dates to today.
// scripts/templates.ts (the monorepo's template gates and `sync --check`) uses the same functions.
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Lockfiles: a template commits none (it installs from the repository root), and a new site makes its own. */
export const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb', 'npm-shrinkwrap.json']
/** Build output, installs, secrets, lockfiles and test results: never copied out of a template into a new site. */
export const notCopied = new Set(['node_modules', '.nuxt', '.output', '.data', '.env', 'test-results', ...lockfiles])

/** File types that `@lupinum/ginko-content` reads and whose top-level keys this module can find (no JSON, no CSV). */
const textTypes = ['md', 'yml', 'yaml']

/** Task prefills that fill in a week (`@workWeek`, `@nextWorkWeek`): the brick holds a current week, such as lunch. */
const weekly = (brick) => (brick.tasks ?? []).some((task) => Object.values(task.prefill ?? {}).some((value) => /^@(next)?workWeek$/i.test(String(value))))

/**
 * What create-ginko needs to know about a template's config, computed in the monorepo (build.mjs), where the config
 * can be imported: its locales, and per brick the date fields to move. A brick's dates move when the brick hides
 * entries after a date (`visible: { mode: 'until' }`), shows the next date on the Studio's Today page
 * (`status: { next }`) or has a weekly task (the lunch week's `weekOf`), and for the `sessions` brick. Other dates
 * (a post's date, holidays, a changelog) stay.
 */
export function manifestOf(site) {
  const shift = {}
  for (const [key, brick] of Object.entries(site.bricks)) {
    const timed = brick.visible?.mode === 'until' || brick.status?.next !== undefined || weekly(brick) || key === 'sessions'
    if (!timed) continue
    const fields = Object.entries(brick.fields).filter(([, field]) => field.type === 'date' || field.type === 'daterange').map(([name]) => name)
    if (fields.length) shift[key] = fields
  }
  return { locales: [...site.locales], shift }
}

const day = 24 * 60 * 60 * 1000
const isoDay = (time) => new Date(time).toISOString().slice(0, 10)
const timeOf = (iso) => Date.parse(`${iso}T00:00:00Z`)

/** Days from `anchor` to `today` (both `YYYY-MM-DD`), rounded towards zero to whole weeks, so weekdays stay. */
export function weeksShift(anchor, today) {
  return Math.trunc((timeOf(today) - timeOf(anchor)) / day / 7) * 7
}

export const addDays = (iso, days) => isoDay(timeOf(iso) + days * day)

/** The content files of one brick: `content/<brick>.<ext>` (a single, with translations) and all files below `content/<brick>/`. */
function brickFiles(dir, brick) {
  const content = join(dir, 'content')
  if (!existsSync(content)) return []
  const files = readdirSync(content).filter((name) => name.split('.')[0] === brick && textTypes.includes(name.split('.').at(-1))).map((name) => join(content, name))
  const folder = join(content, brick)
  if (existsSync(folder) && statSync(folder).isDirectory()) {
    for (const name of readdirSync(folder, { recursive: true })) {
      const path = join(folder, String(name))
      if (textTypes.includes(path.split('.').at(-1)) && statSync(path).isFile()) files.push(path)
    }
  }
  return files
}

const DATE = /\b(\d{4}-\d{2}-\d{2})\b/g

/**
 * Calls `edit` on the lines of the given top-level keys: a Markdown file's frontmatter or a whole YAML file. A key's
 * value is its own line plus the indented lines below it (`when:` with `from:` and `to:`). The Markdown body is never
 * touched, so a date in running text stays as written.
 */
function editFields(text, isMarkdown, fields, edit) {
  const lines = text.split('\n')
  let start = 0
  let end = lines.length
  if (isMarkdown) {
    if (lines[0]?.trim() !== '---') return text
    start = 1
    end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end < 0) return text
  }
  let inField = false
  for (let i = start; i < end; i++) {
    const line = lines[i]
    if (/^\S/.test(line)) inField = fields.some((field) => line.startsWith(`${field}:`))
    if (inField) lines[i] = edit(line)
  }
  return lines.join('\n')
}

/** Moves every date of the manifest's fields by `days`. Returns the content files it changed (relative paths). */
export function shiftDates(dir, shift, days) {
  const changed = []
  if (!days) return changed
  for (const [brick, fields] of Object.entries(shift)) {
    for (const path of brickFiles(dir, brick)) {
      const text = readFileSync(path, 'utf8')
      const next = editFields(text, path.endsWith('.md'), fields, (line) => line.replace(DATE, (iso) => addDays(iso, days)))
      if (next !== text) {
        writeFileSync(path, next)
        changed.push(relative(dir, path))
      }
    }
  }
  return changed
}

/** Every date in the manifest's fields, for the check that a template still has enough future samples. */
export function sampleDates(dir, shift) {
  const dates = []
  for (const [brick, fields] of Object.entries(shift)) {
    for (const path of brickFiles(dir, brick)) {
      editFields(readFileSync(path, 'utf8'), path.endsWith('.md'), fields, (line) => {
        dates.push(...(line.match(DATE) ?? []))
        return line
      })
    }
  }
  return dates.sort()
}

/** Removes `<locale>: '…'` entries (one-line string values) from the object literals of a source fragment. */
function pruneMaps(source, locale) {
  const key = `(?<q>['"]?)${locale}\\k<q>\\s*:\\s*(?:'[^'\\n]*'|"[^"\\n]*")`
  return source
    // a later entry, with the comma before it: `{ en: '/a', de: '/b' }`, or `'/a',\n  de: '/b',`
    .replace(new RegExp(`\\s*,\\s*${key}(?=\\s*[,}\\n])`, 'g'), '')
    // the first entry, with the comma after it: `{ de: '/b', en: '/a' }`
    .replace(new RegExp(`(\\{\\s*)${key}\\s*,\\s*`, 'g'), '$1')
    // the only entry
    .replace(new RegExp(`\\{\\s*${key}\\s*\\}`, 'g'), '{}')
}

/**
 * Applies pruneMaps only inside the locale maps of ginko.config.ts: the object after `languages:`, `route:` and
 * `pages:` (whose values are paths or path maps). Other objects there, such as a field label `{ de: '…', en: '…' }`
 * in the Studio's languages, stay whole.
 */
function pruneConfigMaps(source, locale) {
  let out = ''
  let from = 0
  for (const match of source.matchAll(/\b(?:languages|route|pages)\s*:\s*\{/g)) {
    const open = match.index + match[0].length - 1
    if (open < from) continue
    let depth = 0
    let close = open
    for (; close < source.length; close++) {
      if (source[close] === '{') depth++
      else if (source[close] === '}' && --depth === 0) break
    }
    out += source.slice(from, open) + pruneMaps(source.slice(open, close + 1), locale)
    from = close + 1
  }
  return out + source.slice(from)
}

/** The top-level keys of a Markdown frontmatter or YAML file, each with its lines (a key's own line and the indented
 *  lines below it); lines before the first key form a block without key. Undefined for other files. */
function fieldBlocks(text, isMarkdown) {
  const lines = text.split('\n')
  let start = 0
  let end = lines.length
  if (isMarkdown) {
    if (lines[0]?.trim() !== '---') return undefined
    start = 1
    end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end < 0) return undefined
  }
  const blocks = []
  for (let i = start; i < end; i++) {
    const key = /^([^\s#:-][^:]*):/.exec(lines[i])?.[1]
    if (key !== undefined || !blocks.length) blocks.push({ key, lines: [lines[i]] })
    else blocks.at(-1).lines.push(lines[i])
  }
  const join = (list) => [...lines.slice(0, start), ...list.flatMap((b) => b.lines), ...lines.slice(end)].join('\n')
  return { blocks, join }
}

/**
 * The texts of a main file and its translation after they swap roles (a new main language). Fields only the main file
 * has (the language-independent ones, such as a date or a choice, which a translation must not repeat, and any field
 * the translation left to the main text) move to the new main file, so both pages show what they showed before. When
 * the translation sets its own `slug`, the old main file keeps its address from the file name as `slug`.
 */
function swapFields(mainText, translatedText, name) {
  const isMarkdown = name.endsWith('.md')
  const main = fieldBlocks(mainText, isMarkdown)
  const translated = fieldBlocks(translatedText, isMarkdown)
  if (!textTypes.includes(name.split('.').at(-1)) || !main || !translated) return [mainText, translatedText]
  const own = new Set(translated.blocks.map((b) => b.key))
  const moved = main.blocks.filter((b) => b.key !== undefined && !own.has(b.key))
  const kept = main.blocks.filter((b) => !moved.includes(b))
  if (own.has('slug') && !main.blocks.some((b) => b.key === 'slug')) {
    kept.push({ key: 'slug', lines: [`slug: ${name.split('/').at(-1).split('.').at(-2)}`] })
  }
  return [main.join(kept), translated.join([...translated.blocks, ...moved])]
}

/** The locale suffix of a content path (`1.about.de.md` → `de`), if it is one of `locales`. */
function suffixOf(name, locales) {
  const parts = name.split('.')
  return parts.length > 2 && locales.includes(parts.at(-2)) ? parts.at(-2) : undefined
}
const withSuffix = (path, locale) => path.replace(/(\.[^./]+)$/, `.${locale}$1`)

/**
 * Keeps the languages `chosen` (a subset of the template's `authored` locales; the first is the new main language) and
 * removes the others: their content files, `i18n/<locale>.json`, and their entries in the locale maps: every map
 * in `app/routes.ts`, and `languages`, `route` and `pages` in `ginko.config.ts`. The `locales` list there (in `app/routes.ts` if it exists, else in
 * `ginko.config.ts`) becomes `chosen`. When the main language changes, the main files (no suffix) and the new main
 * language's files (`.<locale>.md`) swap names; a file without a translation stays as it is.
 * Contract for templates: URL prefixes derive from the locales list in code, so the swap needs no route edits, and
 * `app/routes.ts` holds only locale maps (route slugs), no other object keyed by a language code.
 */
export function pruneLocales(dir, authored, chosen) {
  const unknown = chosen.filter((locale) => !authored.includes(locale))
  if (unknown.length) throw new Error(`Unknown locale ${unknown.map((l) => `"${l}"`).join(', ')}. This template has: ${authored.join(', ')}.`)
  const dropped = authored.filter((locale) => !chosen.includes(locale))
  const [main] = chosen
  const [authoredMain] = authored
  const content = join(dir, 'content')
  const files = existsSync(content) ? readdirSync(content, { recursive: true }).map(String).filter((name) => statSync(join(content, name)).isFile()) : []
  for (const name of files) {
    if (dropped.includes(suffixOf(name, authored))) rmSync(join(content, name))
  }
  if (main !== authoredMain) {
    for (const name of files) {
      if (suffixOf(name, authored) || !existsSync(join(content, name))) continue
      const translation = join(content, withSuffix(name, main))
      if (!existsSync(translation)) continue
      const [mainText, translated] = swapFields(readFileSync(join(content, name), 'utf8'), readFileSync(translation, 'utf8'), name)
      writeFileSync(join(content, name), mainText)
      writeFileSync(translation, translated)
      if (chosen.includes(authoredMain)) renameSync(join(content, name), join(content, withSuffix(name, authoredMain)))
      else rmSync(join(content, name))
      renameSync(translation, join(content, name))
    }
  }
  for (const locale of dropped) rmSync(join(dir, 'i18n', `${locale}.json`), { force: true })
  const sources = ['app/routes.ts', 'ginko.config.ts'].map((file) => join(dir, file)).filter((path) => existsSync(path))
  const list = sources.find((path) => /\blocales\s*[:=]\s*\[/.test(readFileSync(path, 'utf8')))
  if (!list) throw new Error('The template names no locales list (`locales: [...]` or `const locales = [...]`) in app/routes.ts or ginko.config.ts.')
  for (const path of sources) {
    let source = readFileSync(path, 'utf8')
    for (const locale of dropped) source = path.endsWith('routes.ts') ? pruneMaps(source, locale) : pruneConfigMaps(source, locale)
    if (path === list) source = source.replace(/(\blocales\s*[:=]\s*\[)[^\]]*(\])/, (_, open, close) => `${open}${chosen.map((l) => `'${l}'`).join(', ')}${close}`)
    writeFileSync(path, source)
  }
}
