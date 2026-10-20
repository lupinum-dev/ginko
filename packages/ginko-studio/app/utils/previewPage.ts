// Which page of the site the preview opens for an entry of a brick without a page of its own (no `route`): the menu
// for a dish, the lunch page for a planned lunch week, the home page for opening hours or a notice. The schema has no
// such link, so the convention is the one the presets follow: a page named like the brick shows it. The order of
// `schema.pages` cannot decide: the platform stores the schema as a Convex value, which sorts object keys.
import type { Locale } from '@lupinum/ginko'
import { textIn, type Schema } from '@lupinum/ginko/internal'

export function previewPageOf(schema: Schema, brickKey: string, locale: Locale): string {
  const pageIn = (key: string) => schema.pages[key]?.[locale]
  const seen = new Set<string>()
  let key: string | undefined = brickKey
  while (key && !seen.has(key)) {
    seen.add(key)
    const own = pageIn(key)
    if (own) return own
    const brick = schema.bricks[key]
    // A plan shows on the page of what it plans: lunch weeks on the lunch page, hour plans where the hours are.
    key = brick?.kind === 'collection' && brick.plans ? brick.plans.brick : plannedBy(schema, key)
  }
  return pageIn('home') ?? shortestPage(schema, locale) ?? '/'
}

/** The single whose status reads the plans of `key` (`hours({ plans: 'hourPlans' })`). */
function plannedBy(schema: Schema, key: string): string | undefined {
  return Object.entries(schema.bricks).find(([, b]) => b.kind === 'single' && typeof b.status?.hours === 'object' && b.status.hours.plans === key)?.[0]
}

/** Without a home page: the page closest to the root in this language. */
function shortestPage(schema: Schema, locale: Locale): string | undefined {
  return Object.values(schema.pages).map((p) => p[locale]).filter((p): p is string => !!p).sort((a, b) => a.length - b.length)[0]
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
