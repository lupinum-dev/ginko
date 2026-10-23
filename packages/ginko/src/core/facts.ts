// Facts: values of single bricks (a price, a phone number, opening times) that texts quote with `:fact{name="…"}`.
// The text keeps the reference, so a change in the Studio reaches every page, the search and the Markdown twin.
// The site lists its facts (`SiteInput.facts`); Ginko turns the list into the inline component `fact`. Pure: no Vue.
import type { ComponentDef } from './components.ts'
import { labelOf } from './labels.ts'
import { formatMoney } from './money.ts'
import type { Money } from './infer.ts'
import type { Brick, Field, Fields, Label } from './types.ts'
import { duePlan } from './stale.ts'

/** The tag of the fact component in Markdown: `:fact{name="practice.price"}`. */
export const FACT_TAG = 'fact'

/** Field types a fact can show: one value or a short list of values, never a text with its own structure. */
const FACT_TYPES: ReadonlySet<Field['type']> = new Set(['text', 'longtext', 'number', 'money', 'date', 'time', 'choice', 'choices', 'list'])

/** The one column of a list a fact can show (a list of times, of names), or undefined when the list has more. */
const listColumn = (field: Field): Field | undefined => {
  if (field.type !== 'list') return undefined
  const columns = Object.values(field.of)
  return columns.length === 1 && columns[0]!.type !== 'list' && FACT_TYPES.has(columns[0]!.type) ? columns[0] : undefined
}

/** Why a fact path cannot be a fact, or undefined when it can. `bricks` are the site's bricks. */
export function factProblem(path: string, bricks: Readonly<Record<string, Brick>>): string | undefined {
  const [brick, field, ...rest] = path.split('.')
  if (!brick || !field || rest.length) return `facts: “${path}” must be “brick.field”.`
  const def = Object.hasOwn(bricks, brick) ? bricks[brick] : undefined
  if (!def || def.retired) return `facts: “${path}” names “${brick}”, which is not a brick of the site.`
  if (def.kind !== 'single') return `facts: “${path}”: only fields of single bricks are facts (“${brick}” is a collection).`
  const target = Object.hasOwn(def.fields, field) ? def.fields[field] : undefined
  if (!target || target.retired) return `facts: “${path}” names “${field}”, which is not a field of “${brick}”.`
  if (!FACT_TYPES.has(target.type) || (target.type === 'list' && !listColumn(target))) {
    return `facts: “${path}” is a ${target.type} field; a fact shows text, a number, money, a date, a time, a choice or a list with one column.`
  }
  return undefined
}

/**
 * The inline component `fact` for a site's fact list: one prop `name`, a choice of the facts labelled with their
 * field labels. The platform, the Studio (props form, slash menu) and the Markdown check read it like any component.
 */
export function factComponent(facts: readonly string[], bricks: Readonly<Record<string, Brick>>): ComponentDef {
  const options = facts.map((path) => {
    const [brick, field] = path.split('.') as [string, string]
    return { value: path, label: bricks[brick]!.fields[field]!.label }
  })
  return {
    kind: 'inline',
    label: { de: 'Angabe', en: 'Fact' },
    describe: {
      de: 'Ein Wert aus den Angaben der Website, zum Beispiel Preis oder Telefonnummer. Ändert er sich, ändert er sich in jedem Text.',
      en: 'A value from the site’s details, such as a price or a phone number. When it changes, every text shows the new value.',
    },
    props: { name: { type: 'choice', label: { de: 'Angabe', en: 'Fact' }, options } },
    editor: { group: { de: 'Text', en: 'Text' }, example: `:fact{name="${facts[0] ?? ''}"}` },
  }
}

/**
 * The value of `field` in effect on `today`: the planned value from its date on (`planned` on the brick), else the
 * stored one. Without `today` (a build, where the day is unknown) the stored value.
 */
export function valueOn(brick: Pick<Brick, 'planned'>, data: Readonly<Record<string, unknown>>, field: string, today?: string): unknown {
  return (brick.planned?.field === field && today ? duePlan(brick, data, today) : undefined) ?? data[field]
}

export interface FactContext {
  /** The site's bricks (field types, labels, plans). */
  bricks: Readonly<Record<string, Pick<Brick, 'kind' | 'fields' | 'planned'>>>
  /** The single bricks' data in the bundle's locale: `bundle.bricks`. */
  data: Readonly<Record<string, { kind: string; data?: Readonly<Record<string, unknown>> }>>
  /** The locale of the data and the site's main locale, for choice labels. */
  locale: string
  mainLocale: string
  /** BCP 47 tag for numbers, money, dates and lists (the site's `languages` entry, else the locale). */
  language: string
  /** The site's day: a planned change applies from its date. Unset: the stored value. */
  today?: string
}

const isMoney = (v: unknown): v is Money => typeof v === 'object' && v !== null && typeof (v as Money).amount === 'number' && typeof (v as Money).currency === 'string'

function formatValue(field: Field, value: unknown, ctx: FactContext): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const label = (l: Label) => labelOf(l, ctx.locale, ctx.mainLocale)
  const list = (items: string[]) => (items.length ? new Intl.ListFormat(ctx.language, { type: 'conjunction' }).format(items) : undefined)
  switch (field.type) {
    case 'text': case 'longtext': case 'time':
      return typeof value === 'string' ? value : undefined
    case 'number':
      return typeof value === 'number' ? `${new Intl.NumberFormat(ctx.language).format(value)}${field.unit ? ` ${field.unit}` : ''}` : undefined
    case 'money':
      // Prices in running text read "98 €", not "98,00 €"; cents still show when there are any.
      return isMoney(value) ? formatMoney(value, ctx.language, { wholeWithoutMinor: true }) : undefined
    case 'date':
      return typeof value === 'string' ? new Intl.DateTimeFormat(ctx.language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : undefined
    case 'choice': {
      const option = field.options.find((o) => o.value === value)
      return option ? label(option.label) : undefined
    }
    case 'choices':
      return Array.isArray(value) ? list(field.options.filter((o) => value.includes(o.value)).map((o) => label(o.label))) : undefined
    case 'list': {
      const column = listColumn(field)
      if (!column || !Array.isArray(value)) return undefined
      const name = Object.keys(field.of)[0]!
      return list(value.flatMap((row) => {
        const text = typeof row === 'object' && row !== null ? formatValue(column, (row as Record<string, unknown>)[name], ctx) : undefined
        return text === undefined ? [] : [text]
      }))
    }
    default:
      return undefined
  }
}

/** The text of a fact (`practice.price` → "98 €"), or undefined when the path or its value is missing. */
export function factText(path: string, ctx: FactContext): string | undefined {
  const [brick, name] = path.split('.')
  if (!brick || !name) return undefined
  const def = Object.hasOwn(ctx.bricks, brick) ? ctx.bricks[brick] : undefined
  const field = def && Object.hasOwn(def.fields, name) ? (def.fields as Fields)[name] : undefined
  const entry = Object.hasOwn(ctx.data, brick) ? ctx.data[brick] : undefined
  if (!def || !field || entry?.kind !== 'single' || !entry.data) return undefined
  // Intl throws on a date it cannot read or a language tag it does not know; a fact then shows nothing, not an error page.
  try {
    return formatValue(field, valueOn(def, entry.data, name, ctx.today), ctx)
  } catch {
    return undefined
  }
}

/** A text resolver for `textBlocks` and the Markdown twin: the fact component becomes its text, other tags stay. */
export function factResolver(ctx: FactContext): (tag: string, props: Readonly<Record<string, unknown>> | undefined) => string | undefined {
  return (tag, props) => (tag === FACT_TAG && typeof props?.name === 'string' ? factText(props.name, ctx) ?? '' : undefined)
}

/** `factResolver` for one locale's bundle, the form search, the Markdown twin and llms-full.txt use. */
export function bundleFactResolver(bundle: { bricks: FactContext['data']; locale: string; mainLocale: string }, bricks: FactContext['bricks'], language: string, today?: string) {
  return factResolver({ bricks, data: bundle.bricks, locale: bundle.locale, mainLocale: bundle.mainLocale, language, ...(today ? { today } : {}) })
}
