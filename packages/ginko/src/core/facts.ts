// Facts: values of single bricks (a price, a phone number, opening times) that texts quote with `:fact{name="…"}`.
// The text keeps the reference, so a change in the Studio reaches every page, the search and the Markdown twin.
// The site lists its facts (`SiteInput.facts`); Ginko turns the list into the inline component `fact`. Pure: no Vue.
import type { ComponentDef, ComponentRegistry } from './components.ts'
import { labelOf } from './labels.ts'
import { formatMoney, minorDigits } from './money.ts'
import type { Money } from './infer.ts'
import type { Brick, Field, Fields, Label, Schema } from './types.ts'
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
  return safeFormat(field, valueOn(def, entry.data, name, ctx.today), ctx)
}

/** formatValue, but undefined where Intl throws (a date it cannot read, a language tag it does not know): a fact then shows nothing, not an error page. */
function safeFormat(field: Field, value: unknown, ctx: FactContext): string | undefined {
  try {
    return formatValue(field, value, ctx)
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

/** The facts a component registry offers: the choices of the `fact` component (the site's `facts`, in their order). */
export function factNames(components: ComponentRegistry | undefined): string[] {
  const name = components && Object.hasOwn(components, FACT_TAG) ? components[FACT_TAG]!.props.name : undefined
  return name?.type === 'choice' ? name.options.map((option) => String(option.value)) : []
}

const FACT_IN_TEXT = /:fact\{([^}]*)\}/g
const NAME_ATTRIBUTE = /(?:^|\s)name=(?:"([^"]*)"|'([^']*)'|([^\s"'}]+))/

/** The facts a Markdown source quotes (`:fact{name="practice.price"}`), each once, in the order of the text. */
export function factNamesIn(markdown: string): string[] {
  const names = new Set<string>()
  for (const [, attributes] of markdown.matchAll(FACT_IN_TEXT)) {
    const found = NAME_ATTRIBUTE.exec(attributes!)
    const name = found?.[1] ?? found?.[2] ?? found?.[3]
    if (name) names.add(name)
  }
  return [...names]
}

/** A fact as editors and agents see it: what the website shows now and, when a change is planned, from when on what. */
export interface FactValue {
  /** `brick.field`, the `name` of `:fact{name="…"}`. */
  name: string
  brick: string
  field: string
  /** What the website shows today; undefined when the field is empty. */
  text?: string
  /** A planned change (`planned` on the brick) that has not started yet: its text and first day (YYYY-MM-DD). */
  next?: { text: string; from: string }
  /**
   * The ways a text may have copied this value ("98 €", "€ 98", "98 Euro"), for finding copies that a fact should
   * replace (factCopies). Empty for values that are too common to tell apart from ordinary words (a name, one choice).
   */
  copies: string[]
}

/**
 * The value of every fact of the schema in `locale`. `data` holds the single bricks' data in that locale (as the
 * bundle serves it). Formats with the site's language tag for the locale (`schema.languages`), as the website does.
 */
export function factValues(
  schema: Pick<Schema, 'bricks' | 'components' | 'locales' | 'languages'>,
  data: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>,
  locale: string,
  today?: string,
): FactValue[] {
  const ctx: FactContext = {
    bricks: schema.bricks,
    data: Object.fromEntries(Object.entries(data).map(([brick, values]) => [brick, { kind: 'single', ...(values ? { data: values } : {}) }])),
    locale, mainLocale: schema.locales[0]!, language: schema.languages?.[locale] ?? locale, ...(today ? { today } : {}),
  }
  return factNames(schema.components).flatMap((name): FactValue[] => {
    const [brick, key] = name.split('.') as [string, string]
    const def = Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick] : undefined
    const field = def && Object.hasOwn(def.fields, key) ? def.fields[key] : undefined
    if (!def || !field) return []
    const values = data[brick] ?? {}
    const text = factText(name, ctx)
    const plan = def.planned
    const upcoming = plan && plan.field === key && today && typeof values[plan.from] === 'string' && (values[plan.from] as string) > today ? values[plan.next] : undefined
    const nextText = upcoming === undefined || upcoming === null ? undefined : safeFormat(field, upcoming, ctx)
    const shown = valueOn(def, values, key, today)
    return [{
      name, brick, field: key,
      ...(text ? { text } : {}),
      ...(nextText ? { next: { text: nextText, from: values[plan!.from] as string } } : {}),
      copies: text ? copiesOf(field, shown, text, ctx) : [],
    }]
  })
}

/** The forms a copy of a value takes in running text; see FactValue.copies. */
function copiesOf(field: Field, value: unknown, text: string, ctx: FactContext): string[] {
  const forms = new Set<string>()
  switch (field.type) {
    case 'money': {
      if (!isMoney(value)) break
      forms.add(text)
      const digits = minorDigits(value.currency)
      const amount = value.amount / 10 ** digits
      const symbol = new Intl.NumberFormat(ctx.language, { style: 'currency', currency: value.currency }).formatToParts(0).find((part) => part.type === 'currency')?.value
      for (const fraction of value.amount % 10 ** digits === 0 ? [0, digits] : [digits]) {
        const number = new Intl.NumberFormat(ctx.language, { minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(amount)
        for (const unit of [symbol, value.currency, value.currency === 'EUR' ? 'Euro' : undefined]) {
          if (unit) forms.add(`${number} ${unit}`).add(`${unit} ${number}`)
        }
      }
      break
    }
    case 'date':
      forms.add(text)
      if (typeof value === 'string') forms.add(new Intl.DateTimeFormat(ctx.language, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)))
      break
    case 'number':
      if (field.unit) forms.add(text)
      break
    case 'text':
      // A contact detail goes stale when copied; a name or a sentence is ordinary text.
      if (field.format === 'email' || field.format === 'tel' || field.format === 'url') forms.add(text)
      break
    case 'choices': case 'list':
      // Two or more values ("Dienstag und Mittwoch", "11:00 und 12:15"); a single one is an ordinary word.
      if (Array.isArray(value) && value.length > 1) forms.add(text)
      break
  }
  // A money form always has its currency; any other form that short ("ja", "12") is too common to count as a copy.
  return field.type === 'money' ? [...forms] : [...forms].filter((form) => form.replace(/\s/g, '').length >= 4)
}

/** A copy of a fact's value inside a text: `from`/`to` are offsets into the text. */
export interface FactCopy { name: string; text: string; from: number; to: number }

/**
 * The copies of fact values in `text` ("Eine Sitzung kostet 98 €." while `practice.price` is 98 €): places where the
 * text should quote the fact, so it follows the next change. Whitespace may differ (a space or a non-breaking one);
 * a copy must stand on its own (not inside a longer number or word). Longest match first, no overlaps.
 */
export function factCopies(text: string, values: readonly Pick<FactValue, 'name' | 'copies'>[]): FactCopy[] {
  const found: FactCopy[] = []
  const forms = values.flatMap((value) => value.copies.map((form) => ({ name: value.name, form }))).sort((a, b) => b.form.length - a.form.length)
  for (const { name, form } of forms) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${form.trim().split(/\s+/).map(escapeRegExp).join('[\\s\\u00a0\\u202f]+')}(?![\\p{L}\\p{N}])`, 'giu')
    for (const match of text.matchAll(pattern)) {
      const from = match.index
      const to = from + match[0].length
      if (found.some((copy) => from < copy.to && to > copy.from)) continue
      found.push({ name, text: match[0], from, to })
    }
  }
  return found.sort((a, b) => a.from - b.from)
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

