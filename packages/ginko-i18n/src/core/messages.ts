// Messages are ICU MessageFormat (arguments, plural, selectordinal, select, number, tags).
// The build parses them once with the FormatJS parser into a compact tree; this file only interprets
// that tree, so browsers and Convex never ship a parser.
import { createFormatters, type Formatters } from './format.ts'

/** Compiled node. A plain string is literal text. */
export type Node
  = | string
    | ['a', string] // {name}
    | ['n', string, Intl.NumberFormatOptions?] // {name, number} or {name, number, percent}
    | ['d', string, Intl.DateTimeFormatOptions] // {name, date, long} or {name, time, short}
    | ['#'] // # inside plural
    | ['p', string, number, Record<string, Node[]>, 0 | 1] // plural / selectordinal (1)
    | ['s', string, Record<string, Node[]>] // select
    | ['t', string, Node[]] // <tag>children</tag>

export type CompiledMessage = string | Node[]
export interface MessageTree { [key: string]: CompiledMessage | MessageTree }

export type Params = Record<string, string | number | Date | undefined | null>

/** Output of `formatParts`: text, or a tag with its formatted children (rendered by `<T>`). */
export type Part = string | { tag: string, children: Part[] }

const pluralCache = new Map<string, Intl.PluralRules>()

function pluralRules(language: string, ordinal: boolean): Intl.PluralRules {
  const key = `${language}|${ordinal}`
  let rules = pluralCache.get(key)
  if (!rules) pluralCache.set(key, rules = new Intl.PluralRules(language, { type: ordinal ? 'ordinal' : 'cardinal' }))
  return rules
}

/** Dates follow `format.date` (a calendar date never shifts a day); an invalid date prints the raw value, as numbers do. */
function formatDate(format: Formatters, value: Params[string], options: Intl.DateTimeFormatOptions): string {
  if (value == null) return ''
  try {
    return format.date(value, options)
  }
  catch {
    return show(value)
  }
}

function show(value: unknown): string {
  return value == null ? '' : String(value)
}

export function formatParts(message: CompiledMessage, params: Params, language: string, timeZone = 'UTC'): Part[] {
  if (typeof message === 'string') return [message]
  const format = createFormatters(language, { timeZone })
  const out: Part[] = []
  const walk = (nodes: Node[], pound: number | undefined, into: Part[]) => {
    for (const node of nodes) {
      if (typeof node === 'string') {
        into.push(node)
        continue
      }
      switch (node[0]) {
        case 'a':
          into.push(show(params[node[1]]))
          break
        case 'n': {
          const value = Number(params[node[1]])
          into.push(Number.isFinite(value) ? format.number(value, node[2]) : show(params[node[1]]))
          break
        }
        case 'd':
          into.push(formatDate(format, params[node[1]], node[2]))
          break
        case '#':
          into.push(pound === undefined ? '#' : format.number(pound))
          break
        case 'p': {
          const [, name, offset, cases, ordinal] = node
          const value = Number(params[name])
          if (!Number.isFinite(value)) {
            walk(cases.other ?? [], undefined, into)
            break
          }
          const exact = cases[`=${value}`]
          const branch = exact ?? cases[pluralRules(language, ordinal === 1).select(value - offset)] ?? cases.other ?? []
          walk(branch, value - offset, into)
          break
        }
        case 's': {
          const [, name, cases] = node
          // Own keys only: a value such as `constructor` must not reach Object.prototype.
          const value = show(params[name])
          walk((Object.hasOwn(cases, value) ? cases[value] : cases.other) ?? [], pound, into)
          break
        }
        case 't': {
          const children: Part[] = []
          walk(node[2], pound, children)
          into.push({ tag: node[1], children })
          break
        }
      }
    }
  }
  walk(message, undefined, out)
  return out
}

export function partsToString(parts: Part[]): string {
  return parts.map(p => (typeof p === 'string' ? p : partsToString(p.children))).join('')
}

export function lookup(tree: MessageTree | undefined, key: string): CompiledMessage | undefined {
  let node: CompiledMessage | MessageTree | undefined = tree
  for (const segment of key.split('.')) {
    if (!node || typeof node === 'string' || Array.isArray(node) || !Object.hasOwn(node, segment)) return undefined
    node = node[segment]
  }
  return typeof node === 'string' || Array.isArray(node) ? node : undefined
}

/** Per-call options of `t` and `parts`. */
export interface TranslateOptions {
  /** Zone for the dates in this message, e.g. a site's zone in an app whose users sit elsewhere. Default: the translator's. */
  timeZone?: string
}

export interface Translator {
  t: (key: string, params?: Params, options?: TranslateOptions) => string
  parts: (key: string, params?: Params, options?: TranslateOptions) => Part[]
  has: (key: string) => boolean
}

/**
 * A translator for one locale. Lookup order: the locale's messages, then the fallback locale's
 * messages, then the key itself (so a missing key is visible, never an empty string).
 */
export function createTranslator(options: {
  messages: MessageTree | undefined
  fallback?: MessageTree
  language: string
  /** Zone for dates that are not calendar dates (`YYYY-MM-DD` is always UTC). Default `UTC`. */
  timeZone?: string
  params?: Params
  onMissing?: (key: string) => void
}): Translator {
  const find = (key: string) => lookup(options.messages, key) ?? lookup(options.fallback, key)
  const parts = (key: string, params?: Params, call?: TranslateOptions): Part[] => {
    const message = find(key)
    if (message === undefined) {
      options.onMissing?.(key)
      return [key]
    }
    return formatParts(message, { ...options.params, ...params }, options.language, call?.timeZone ?? options.timeZone)
  }
  return {
    parts,
    t: (key, params, call) => partsToString(parts(key, params, call)),
    has: key => find(key) !== undefined,
  }
}
