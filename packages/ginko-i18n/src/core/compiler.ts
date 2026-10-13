// Build-time only: parse ICU strings with the FormatJS parser and emit the compact tree that
// `messages.ts` interprets. Never imported by browser or server runtime code.
import { parse, TYPE, type DateTimeSkeleton, type MessageFormatElement, type NumberElement } from '@formatjs/icu-messageformat-parser'
import type { CompiledMessage, MessageTree, Node } from './messages.ts'

export interface RawTree { [key: string]: string | RawTree }

export class MessageError extends Error {
  key: string
  source: string
  constructor(key: string, source: string, cause: unknown) {
    super(`[ginko-i18n] Message "${key}" is not valid ICU: ${(cause as Error).message}\n  ${source}`)
    this.key = key
    this.source = source
  }
}

const DATE_STYLES = { short: 'short', medium: 'medium', long: 'long', full: 'full' } as const
type DateStyleName = keyof typeof DATE_STYLES

function isDateStyleName(style: string): style is DateStyleName {
  return Object.hasOwn(DATE_STYLES, style)
}

/** `{n, number}` options: plain `percent` and `integer` styles, or a `::skeleton` (its parsed options). */
function numberOptions(style: NumberElement['style']): Intl.NumberFormatOptions | undefined {
  if (style == null) return undefined
  if (typeof style !== 'string') return style.parsedOptions
  if (style === 'percent') return { style: 'percent' }
  if (style === 'integer') return { maximumFractionDigits: 0 }
  throw new Error(`Unknown number style "${style}". Use percent, integer or a ::skeleton.`)
}

/** `{d, date}` / `{d, time}` options. A missing style gives the medium date or the short time. */
function dateOptions(style: string | DateTimeSkeleton | null | undefined, time: boolean): Intl.DateTimeFormatOptions {
  if (style == null) return time ? { timeStyle: 'short' } : { dateStyle: 'medium' }
  if (typeof style !== 'string') return style.parsedOptions
  if (!isDateStyleName(style)) throw new Error(`Unknown ${time ? 'time' : 'date'} style "${style}". Use short, medium, long, full or a ::skeleton.`)
  return time ? { timeStyle: style } : { dateStyle: style }
}

/** Collects the parameter names of a message. `numeric` is the subset used as a number (plural, selectordinal, number). */
interface ParamSink { params: Set<string>, numeric: Set<string> }

function compileElements(elements: MessageFormatElement[], sink: ParamSink): Node[] {
  const out: Node[] = []
  for (const el of elements) {
    switch (el.type) {
      case TYPE.literal: {
        const last = out.at(-1)
        if (typeof last === 'string') out[out.length - 1] = last + el.value
        else out.push(el.value)
        break
      }
      case TYPE.argument:
        sink.params.add(el.value)
        out.push(['a', el.value])
        break
      case TYPE.number: {
        sink.params.add(el.value)
        sink.numeric.add(el.value)
        const options = numberOptions(el.style)
        out.push(options ? ['n', el.value, options] : ['n', el.value])
        break
      }
      case TYPE.date:
      case TYPE.time:
        sink.params.add(el.value)
        out.push(['d', el.value, dateOptions(el.style, el.type === TYPE.time)])
        break
      case TYPE.pound:
        out.push(['#'])
        break
      case TYPE.plural: {
        sink.params.add(el.value)
        sink.numeric.add(el.value)
        const cases: Record<string, Node[]> = {}
        for (const [k, v] of Object.entries(el.options)) cases[k] = compileElements(v.value, sink)
        out.push(['p', el.value, el.offset ?? 0, cases, el.pluralType === 'ordinal' ? 1 : 0])
        break
      }
      case TYPE.select: {
        sink.params.add(el.value)
        const cases: Record<string, Node[]> = {}
        for (const [k, v] of Object.entries(el.options)) cases[k] = compileElements(v.value, sink)
        out.push(['s', el.value, cases])
        break
      }
      case TYPE.tag:
        out.push(['t', el.value, compileElements(el.children, sink)])
        break
    }
  }
  return out
}

export function compileMessage(key: string, source: string): { message: CompiledMessage, params: string[], numeric: string[] } {
  const sink: ParamSink = { params: new Set(), numeric: new Set() }
  let nodes: Node[]
  try {
    nodes = compileElements(parse(source, { requiresOtherClause: true, shouldParseSkeletons: true }), sink)
  }
  catch (error) {
    throw new MessageError(key, source, error)
  }
  const message: CompiledMessage = nodes.length === 0 ? '' : nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : nodes
  return { message, params: [...sink.params], numeric: [...sink.numeric] }
}

/**
 * Keys are names; nesting separates them. `t('a.b')` reads `{ a: { b } }`, so a key `"a.b"` would be
 * unreachable (or shadowed), and an empty key cannot be written in a dotted path. The CLI reads files
 * with the same rule. Returns the problem, or `undefined` for a valid key.
 */
export function keyProblem(segment: string, parent: string): string | undefined {
  const where = parent ? ` in "${parent}"` : ''
  if (segment === '') return `A message key${where} is empty. Fix: give it a name.`
  if (segment.includes('.')) {
    const nested = segment.split('.').reduceRight((inner, part) => `{ ${JSON.stringify(part)}: ${inner} }`, '…')
    return `Message key "${segment}"${where} contains ".", which separates nested keys, so t() cannot reach it. Fix: nest it as ${nested}.`
  }
  return undefined
}

/**
 * The compiled messages of one locale. `params` maps each dotted key to its parameter names; `numeric`
 * maps each key to the subset of those names used as numbers (for types and checks).
 */
export interface CompiledTree { tree: MessageTree, params: Record<string, string[]>, numeric: Record<string, string[]> }

export function compileTree(raw: RawTree): CompiledTree {
  return compileAt(raw, '')
}

function compileAt(raw: RawTree, prefix: string): CompiledTree {
  const tree: MessageTree = {}
  const params: Record<string, string[]> = {}
  const numeric: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(raw)) {
    const problem = keyProblem(k, prefix)
    if (problem) throw new Error(`[ginko-i18n] ${problem}`)
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      const compiled = compileMessage(key, v)
      tree[k] = compiled.message
      params[key] = compiled.params
      numeric[key] = compiled.numeric
    }
    else if (v && typeof v === 'object') {
      const child = compileAt(v, key)
      tree[k] = child.tree
      Object.assign(params, child.params)
      Object.assign(numeric, child.numeric)
    }
  }
  return { tree, params, numeric }
}

/** Deep merge; later sources win per key. */
export function mergeTrees(...trees: RawTree[]): RawTree {
  const out: RawTree = {}
  for (const tree of trees) {
    for (const [k, v] of Object.entries(tree)) {
      const prev = out[k]
      out[k] = v && typeof v === 'object' && prev && typeof prev === 'object' ? mergeTrees(prev, v) : v
    }
  }
  return out
}

/** Compile raw catalogs per locale (`{ de, en }`) for `defineCatalog`. */
export function compileCatalogs(raw: Record<string, RawTree>): Record<string, MessageTree> {
  return Object.fromEntries(Object.entries(raw).map(([locale, tree]) => [locale, compileTree(tree).tree]))
}
