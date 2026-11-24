// Labels. A label in the config is one text in the site's main language. The texts of other editor languages come
// from the site's label files (`i18n/studio/<locale>.json`, passed to `defineSite` as `texts`) and are merged into
// the stored label records here. The labels of the standard tasks are made from the word for one entry.
import type { Brick, Field, Fields, Label, Locale } from '../core/types.ts'
import type { StandardTask } from './bricks.ts'

/** The texts of one field in one language: its label alone, or label and more. */
export interface FieldTexts {
  label?: string
  hint?: string
  /** The word for one row of a list. */
  item?: string
  /** Labels of choice options by value. */
  options?: Record<string, string>
  /** The columns of a list. */
  fields?: Record<string, string | FieldTexts>
}
/** The texts of one brick in one language. */
export interface BrickTexts {
  label?: string
  /** The word for one entry of a collection. In French and Spanish with its article: "une prestation". */
  item?: string
  describe?: string
  fields?: Record<string, string | FieldTexts>
  /** The headings of field groups, by the heading in the main language: `{ "Adresse": "Address" }`. */
  groups?: Record<string, string>
  /** Task labels by task id. A text for `add`, `edit` or `remove` replaces the made label. */
  tasks?: Record<string, string>
}
/** One file `i18n/studio/<locale>.json`: the texts of the site's bricks in that language, by brick key. */
export type StudioTexts = Record<string, BrickTexts>

type ByLocale<T> = Record<Locale, T | undefined>

/** `label` with the texts of other languages. A record written in the config keeps its own texts. */
export function withTexts(label: Label, main: Locale, others: ByLocale<string>): Label {
  const given = Object.fromEntries(Object.entries(others).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  if (Object.keys(given).length === 0) return label
  return typeof label === 'string' ? { [main]: label, ...given } : { ...given, ...label }
}

/** `label` with `texts` in place of its own texts for those languages. */
export function replaceTexts(label: Label, main: Locale, texts: ByLocale<string>): Label {
  const given = Object.fromEntries(Object.entries(texts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  if (Object.keys(given).length === 0) return label
  return { ...(typeof label === 'string' ? { [main]: label } : label), ...given }
}

/** `pick` of every language's texts: `{ de: texts.de?.label }`. */
function each<T>(texts: ByLocale<T>, pick: (t: T) => string | undefined): ByLocale<string> {
  return Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t === undefined ? undefined : pick(t)]))
}
const sub = <T, U>(texts: ByLocale<T>, pick: (t: T) => U | undefined): ByLocale<U> =>
  Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t === undefined ? undefined : pick(t)]))

const asTexts = (t: string | FieldTexts | undefined): FieldTexts | undefined => (typeof t === 'string' ? { label: t } : t)

/** Keys of the texts that name nothing in `known`, as problems. */
function unknownKeys(texts: ByLocale<Record<string, unknown>>, known: readonly string[], path: string, what: string, problems: string[]) {
  for (const [locale, record] of Object.entries(texts)) {
    for (const key of Object.keys(record ?? {})) if (!known.includes(key)) problems.push(`i18n/studio/${locale}.json: ${path}.${key} names no ${what}.`)
  }
}

interface Context { main: Locale; groups: ByLocale<Record<string, string>>; usedGroups: Set<string>; problems: string[] }

function translateFields(fields: Fields, texts: ByLocale<Record<string, string | FieldTexts>>, path: string, ctx: Context): Fields {
  unknownKeys(texts, Object.keys(fields), path, 'field', ctx.problems)
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, translateField(field, sub(texts, (t) => asTexts(t[name])), `${path}.${name}`, ctx)]))
}

function translateField(field: Field, texts: ByLocale<FieldTexts>, path: string, ctx: Context): Field {
  const { main, problems } = ctx
  const out = { ...field, label: withTexts(field.label, main, each(texts, (t) => t.label)) } as Field
  const hint = each(texts, (t) => t.hint)
  if (field.hint !== undefined) out.hint = withTexts(field.hint, main, hint)
  else for (const [locale, text] of Object.entries(hint)) if (text !== undefined) problems.push(`i18n/studio/${locale}.json: ${path}.hint, but the field has no hint.`)
  if (field.group !== undefined) {
    // One table of group headings per brick, by the heading in the main language.
    const heading = typeof field.group === 'string' ? field.group : field.group[main]
    if (heading !== undefined) {
      ctx.usedGroups.add(heading)
      out.group = withTexts(field.group, main, each(ctx.groups, (t) => t[heading]))
    }
  }
  const options = sub(texts, (t) => t.options)
  if (out.type === 'choice' || out.type === 'choices') {
    unknownKeys(options, out.options.map((o) => o.value), `${path}.options`, 'option', problems)
    out.options = out.options.map((o) => ({ ...o, label: withTexts(o.label, main, each(options, (t) => t[o.value])) }))
  }
  if (out.type === 'list') {
    out.itemLabel = withTexts(out.itemLabel, main, each(texts, (t) => t.item))
    out.of = translateFields(out.of, sub(texts, (t) => t.fields), path, ctx)
  }
  return out
}

/** `brick` with the texts of other languages on its describe text, its fields, its group headings and its tasks. The label is done by the caller. */
export function translateBrick(key: string, brick: Brick, main: Locale, texts: ByLocale<BrickTexts>, problems: string[]): Brick {
  const tasks = sub(texts, (t) => t.tasks)
  unknownKeys(tasks, (brick.tasks ?? []).map((task) => task.id), `${key}.tasks`, 'task', problems)
  const ctx: Context = { main, groups: sub(texts, (t) => t.groups), usedGroups: new Set(), problems }
  const fields = translateFields(brick.fields, sub(texts, (t) => t.fields), key, ctx)
  unknownKeys(ctx.groups, [...ctx.usedGroups], `${key}.groups`, 'group heading', problems)
  return {
    ...brick,
    ...(brick.describe !== undefined ? { describe: withTexts(brick.describe, main, each(texts, (t) => t.describe)) } : {}),
    fields,
    ...(brick.tasks ? { tasks: brick.tasks.map((task) => ({ ...task, label: withTexts(task.label, main, each(tasks, (t) => t[task.id])) })) } : {}),
  }
}

/** "Service" → "service", but "FAQ" stays. */
const lower = (noun: string) => (/^\p{Lu}\p{Ll}/u.test(noun) ? noun[0]!.toLowerCase() + noun.slice(1) : noun)
/** "service" → "a service", "event" → "an event". A word that brings its article or is written as a name keeps it. */
const withArticle = (noun: string) => (/^(a|an|the|your|our) /i.test(noun) ? lower(noun) : `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${lower(noun)}`)

/**
 * The words of the standard tasks, in the languages of the Studio. Measured on the hand-written labels of the 14
 * example sites (Nov 2026): German is "Hinweis hinzufügen", English "Add a notice", French "Ajouter une prestation",
 * Spanish "Añadir una persona". English gets its article here; French and Spanish need the word's gender, so there
 * the word is written with its article.
 */
const WORDS: Record<string, { entry: string } & Record<StandardTask, (noun: string, one: boolean) => string>> = {
  de: { entry: 'Eintrag', add: (n) => `${n} hinzufügen`, edit: (n) => `${n} bearbeiten`, remove: (n) => `${n} entfernen` },
  en: { entry: 'entry', add: (n, one) => `Add ${one ? withArticle(n) : lower(n)}`, edit: (n, one) => `Edit ${one ? withArticle(n) : lower(n)}`, remove: (n, one) => `Remove ${one ? withArticle(n) : lower(n)}` },
  es: { entry: 'una entrada', add: (n) => `Añadir ${lower(n)}`, edit: (n) => `Editar ${lower(n)}`, remove: (n) => `Eliminar ${lower(n)}` },
  fr: { entry: 'une entrée', add: (n) => `Ajouter ${lower(n)}`, edit: (n) => `Modifier ${lower(n)}`, remove: (n) => `Retirer ${lower(n)}` },
}
const wordsOf = (locale: Locale) => WORDS[locale.split('-')[0] ?? '']

/** The word for one entry when a collection sets no `item`: "Eintrag" in the main language (English for a language without words). */
export const entryWord = (main: Locale): string => (wordsOf(main) ?? WORDS.en!).entry

/**
 * The label of a standard task in every language the noun has: "Leistung hinzufügen", "Add a service". `one` says
 * that the noun is the word for one entry of a collection (else it is the label of a single). A language without
 * words gets no text; the Studio then shows the main language.
 */
export function standardLabel(id: StandardTask, noun: Label, main: Locale, one: boolean): Label {
  const record = typeof noun === 'string' ? { [main]: noun } : noun
  const made = Object.fromEntries(Object.entries(record).flatMap(([locale, word]) => (wordsOf(locale) ? [[locale, wordsOf(locale)![id](word, one)]] : [])))
  // The main language always has a text: without words for it, the English form with the main-language noun.
  if (!Object.hasOwn(made, main)) made[main] = WORDS.en![id](record[main] ?? Object.values(record)[0] ?? '', one)
  return typeof noun === 'string' ? made[main]! : made
}
