// The component names that @lupinum/ginko-components 0.4.0 renamed, rewritten in stored Markdown
// (migrateComponentMarkup.ts). Pure, so the rules are tested with plain text. Every rule maps an old
// name to a new one that no rule matches again, so a second run changes nothing.
import type { Field, Fields, Json, Locale } from '@lupinum/ginko'
import { printOf, stableJson } from '@lupinum/ginko/internal'
import { leavesOf, type Data, type Prints } from './content'

const TAGS: Record<string, string> = { embedded: 'embed' }

type PropRule = { to?: string; values?: Record<string, string> }
const background: PropRule = { to: 'background', values: { default: 'none' } }
/** Tag (new name) → prop → new prop name and new values. */
const PROPS: Record<string, Record<string, PropRule>> = {
  flow: { surface: background },
  layout: { surface: background, frame: { values: { default: 'none' } } },
  center: { frame: { values: { default: 'none' } } },
  figure: { frame: { values: { default: 'border' } } },
  'quiz-question': { type: { to: 'mode' } },
  'code-tree': { defaultValue: { to: 'file' } },
}

// `::tag` (block) or `:tag` (inline); a colon after a word character is plain text (`mailto:x`, `12:30`).
const OPENER = /(?<![\w:])(:+)([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![\w-])/g
// One attribute of `{…}` (`name`, `name=value`, `:name="value"`), or a quoted text to skip as a whole.
const ATTRIBUTE = /(:?)([A-Za-z][\w-]*)(?:=("[^"]*"|'[^']*'|[^\s"'}]*))?|"[^"]*"|'[^']*'/g

/** The end (exclusive) of the bracket group that starts at `start`, or -1 when it is not closed. */
function closing(text: string, start: number, open: string, close: string): number {
  let depth = 0
  let quote = ''
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (quote) { if (c === quote) quote = ''; continue }
    if (open === '{' && (c === '"' || c === "'")) quote = c
    else if (c === '\\') i++
    else if (c === open) depth++
    else if (c === close && --depth === 0) return i + 1
  }
  return -1
}

function renameAttributes(attributes: string, rules: Record<string, PropRule>): string {
  return attributes.replace(ATTRIBUTE, (all, bound: string | undefined, name: string | undefined, value: string | undefined) => {
    const rule = name === undefined ? undefined : rules[name]
    if (!rule) return all
    let next = value
    if (value !== undefined && rule.values) {
      const quote = /^["']/.test(value) ? value[0]! : ''
      const raw = quote ? value.slice(1, -1) : value
      if (Object.hasOwn(rule.values, raw)) next = `${quote}${rule.values[raw]}${quote}`
    }
    return `${bound}${rule.to ?? name}${next === undefined ? '' : `=${next}`}`
  })
}

/** `text` with the renamed component tags and props of 0.4.0. Text outside component markup stays as it is. */
export function renameComponentMarkup(text: string): string {
  const edits: { from: number; to: number; text: string }[] = []
  const blocks: { from: number; to: number }[] = []
  for (const match of text.matchAll(OPENER)) {
    // An opener inside an attribute block (`title=":x"`) is text.
    if (blocks.some((b) => match.index >= b.from && match.index < b.to)) continue
    const [whole, colons, tag] = match as unknown as [string, string, string]
    const tagEnd = match.index + whole.length
    if (Object.hasOwn(TAGS, tag)) edits.push({ from: match.index + colons.length, to: tagEnd, text: TAGS[tag]! })
    // Inline content `[…]` comes before the attributes; its own components are found by the loop.
    const content = text[tagEnd] === '[' ? closing(text, tagEnd, '[', ']') : tagEnd
    const start = content === -1 ? tagEnd : content
    const end = text[start] === '{' ? closing(text, start, '{', '}') : -1
    if (end === -1) continue
    blocks.push({ from: start, to: end })
    const rules = PROPS[TAGS[tag] ?? tag]
    if (rules) edits.push({ from: start, to: end, text: renameAttributes(text.slice(start, end), rules) })
  }
  let out = ''
  let at = 0
  for (const edit of edits.sort((a, b) => a.from - b.from)) {
    out += text.slice(at, edit.from) + edit.text
    at = edit.to
  }
  return out + text.slice(at)
}

/** Every Markdown value of `data` (root fields and list rows, plain or per locale) passed through `rename`. */
function mapMarkdown(fields: Fields, data: Data, rename: (text: string) => string): Data {
  const walk = (field: Field, value: Json): Json => {
    if (field.type === 'markdown') {
      if (typeof value === 'string') return rename(value)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? rename(text) : text]))
      }
      return value
    }
    if (field.type === 'list' && Array.isArray(value)) {
      return value.map((row) => {
        if (typeof row !== 'object' || row === null || Array.isArray(row)) return row
        const out: Record<string, Json> = { ...row }
        for (const [key, inner] of Object.entries(field.of)) if (out[key] !== undefined && out[key] !== null) out[key] = walk(inner, out[key])
        return out
      })
    }
    return value
  }
  const out: Data = { ...data }
  for (const [name, field] of Object.entries(fields)) if (out[name] !== undefined && out[name] !== null) out[name] = walk(field, out[name])
  return out
}

/**
 * The entry data with renamed component markup, the root fields that changed, and the prints: a translation
 * that was fresh for the old main-language text stays fresh for the rewritten one.
 */
export function renameInEntry(fields: Fields, data: Data, prints: Prints, main: Locale): { data: Data; prints: Prints; roots: string[] } {
  const next = mapMarkdown(fields, data, renameComponentMarkup)
  const roots = Object.keys(fields).filter((root) => stableJson(data[root] ?? null) !== stableJson(next[root] ?? null))
  const out: Prints = { ...prints }
  for (const root of roots) {
    const old = leavesOf(fields[root]!, data[root], root)
    for (const [leaf, values] of leavesOf(fields[root]!, next[root], root)) {
      const before = printOf(old.get(leaf)?.[main])
      const after = printOf(values[main])
      if (before === after || !out[leaf]) continue
      out[leaf] = Object.fromEntries(Object.entries(out[leaf]).map(([locale, print]) => [locale, print === before ? after : print]))
    }
  }
  return { data: next, prints: out, roots }
}

/** A change row's `before`/`after` (root field → value) with renamed component markup. */
export function renameInValues(fields: Fields, values: Data): Data {
  return mapMarkdown(fields, values, renameComponentMarkup)
}
