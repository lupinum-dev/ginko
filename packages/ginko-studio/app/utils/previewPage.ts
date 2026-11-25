// Which page of the site the preview opens for an entry of a brick without a page of its own (no `route`): the page the
// brick names in `preview` (the menu for a dish), else the page of the brick it plans (a planned lunch week shows on
// the lunch page), else the start page. Nothing is concluded from the brick's key.
import type { Locale } from '@lupinum/ginko'
import { textIn, type Schema } from '@lupinum/ginko/internal'

export function previewPageOf(schema: Schema, brickKey: string, locale: Locale): string {
  const seen = new Set<string>()
  let key: string | undefined = brickKey
  while (key && !seen.has(key)) {
    seen.add(key)
    const brick: Schema['bricks'][string] | undefined = schema.bricks[key]
    if (brick?.preview !== undefined) return schema.pages[brick.preview]?.[locale] ?? startPage(schema, locale)
    // A plan shows on the page of what it plans: lunch weeks on the lunch page, hour plans where the hours are.
    key = brick?.kind === 'collection' && brick.plans ? brick.plans.brick : plannedBy(schema, key)
  }
  return startPage(schema, locale)
}

/** The single whose status reads the plans of `key` (`hours({ plans: 'hourPlans' })`: `status: { rule, plans }`). */
function plannedBy(schema: Schema, key: string): string | undefined {
  return Object.entries(schema.bricks).find(([, b]) => b.kind === 'single' && b.status?.plans === key)?.[0]
}

/** The page whose path in the main language is `/`, in `locale`; else `/`. */
function startPage(schema: Schema, locale: Locale): string {
  const main = schema.locales[0]
  const start = Object.values(schema.pages).find((paths) => main !== undefined && paths[main] === '/')
  return start?.[locale] ?? '/'
}

/**
 * The text the preview outlines while a field has the focus: what the page shows of it. Of a long text and Markdown
 * the first paragraph without its marks, since the page shows paragraphs as separate elements. Numbers, prices and
 * dates are formatted on the page and a choice shows its label, so they have none (the page cannot find them).
 */
export function focusText(type: string, value: unknown, locale: Locale): string {
  const text = textIn(value, locale)
  if (type === 'text') return text
  if (type !== 'longtext' && type !== 'markdown') return ''
  // A Markdown component (`::name`), a rule, a code fence or HTML shows no text of its own.
  const line = text.split('\n').map((l) => l.trim()).find((l) => l && !/^(:{2,}|-{3,}|`{3}|<)/.test(l)) ?? ''
  return line
    .replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .trim()
}
