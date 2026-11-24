// POC T2 (v2 spec, sections 7.5 and 8.1): labels. A label in the config is one text in the main language; the texts
// of other editor languages come from `i18n/studio/<locale>.json` and are merged into the v1 label records here. The
// labels of the standard tasks are made from the word for one entry.
import type { Brick, Field, Fields, Label, Locale } from '../core/types.ts'
import type { StandardTask } from './bricks.ts'
import { ROWS_KEY } from './fields.ts'

/** The texts of one field in one language: its label alone, or label and more. */
export interface FieldTexts {
  label?: string
  hint?: string
  group?: string
  /** The word for one row of a list or a table. */
  item?: string
  /** Labels of choice options by value; on a table (`f.rows`) the labels of its rows by key. */
  options?: Record<string, string>
  /** The columns of a list or a table. */
  fields?: Record<string, string | FieldTexts>
}
/** The texts of one brick in one language. */
export interface BrickTexts {
  label?: string
  /** The word for one entry of a collection. */
  item?: string
  describe?: string
  fields?: Record<string, string | FieldTexts>
  /** Task labels by task id. */
  tasks?: Record<string, string>
}
/** One file `i18n/studio/<locale>.json`: the texts of the site's bricks in that language, by brick key. */
export type StudioTexts = Record<string, BrickTexts>

/** `label` with the texts of other languages. A record written in the config keeps its own texts. */
export function withTexts(label: Label, main: Locale, others: Record<Locale, string | undefined>): Label {
  const given = Object.fromEntries(Object.entries(others).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  if (Object.keys(given).length === 0) return label
  return typeof label === 'string' ? { [main]: label, ...given } : { ...given, ...label }
}

/** `pick` of every language's texts: `{ de: texts.de?.label }`. */
function each<T>(texts: Record<Locale, T | undefined>, pick: (t: T) => string | undefined): Record<Locale, string | undefined> {
  return Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t === undefined ? undefined : pick(t)]))
}

const asTexts = (t: string | FieldTexts | undefined): FieldTexts | undefined => (typeof t === 'string' ? { label: t } : t)

/** Keys of the texts that name nothing in `known`, as problems. */
function unknownKeys(texts: Record<Locale, Record<string, unknown> | undefined>, known: readonly string[], path: string, what: string, problems: string[]) {
  for (const [locale, record] of Object.entries(texts)) {
    for (const key of Object.keys(record ?? {})) if (!known.includes(key)) problems.push(`i18n/studio/${locale}.json: ${path}.${key} names no ${what}.`)
  }
}

function translateFields(fields: Fields, main: Locale, texts: Record<Locale, Record<string, string | FieldTexts> | undefined>, path: string, problems: string[]): Fields {
  unknownKeys(texts, Object.keys(fields), path, 'field', problems)
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => {
    const own = Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, asTexts(t?.[name])]))
    return [name, translateField(field, main, own, `${path}.${name}`, problems)]
  }))
}

function translateField(field: Field, main: Locale, texts: Record<Locale, FieldTexts | undefined>, path: string, problems: string[]): Field {
  const out = { ...field, label: withTexts(field.label, main, each(texts, (t) => t.label)) } as Field
  const hint = each(texts, (t) => t.hint)
  const group = each(texts, (t) => t.group)
  if (field.hint !== undefined) out.hint = withTexts(field.hint, main, hint)
  else for (const [locale, text] of Object.entries(hint)) if (text !== undefined) problems.push(`i18n/studio/${locale}.json: ${path}.hint, but the field has no hint.`)
  if (field.group !== undefined) out.group = withTexts(field.group, main, group)
  const options = Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t?.options]))
  const withOptions = <O extends { value: string; label: Label }>(list: readonly O[]) => {
    unknownKeys(options, list.map((o) => o.value), `${path}.options`, 'option', problems)
    return list.map((o) => ({ ...o, label: withTexts(o.label, main, each(options, (t) => t[o.value])) }))
  }
  if (out.type === 'choice' || out.type === 'choices') out.options = withOptions(out.options)
  if (out.type === 'list') {
    const item = each(texts, (t) => t.item)
    out.itemLabel = withTexts(out.itemLabel, main, item)
    const columns = translateFields(out.of, main, Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t?.fields])), path, problems)
    // A table written with `f.rows`: the word for one row also names the key column, and `options` name its rows.
    const key = (field as { [ROWS_KEY]?: string })[ROWS_KEY]
    const column = key === undefined ? undefined : columns[key]
    if (key !== undefined && column?.type === 'choice') {
      columns[key] = { ...column, label: withTexts(column.label, main, item), options: withOptions(column.options) }
    }
    out.of = columns
  }
  return out
}

/** `brick` with the texts of other languages on its describe text, its fields and its tasks. The label is done by the caller. */
export function translateBrick(key: string, brick: Brick, main: Locale, texts: Record<Locale, BrickTexts | undefined>, problems: string[]): Brick {
  const tasks = Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t?.tasks]))
  unknownKeys(tasks, (brick.tasks ?? []).map((task) => task.id), `${key}.tasks`, 'task', problems)
  return {
    ...brick,
    ...(brick.describe !== undefined ? { describe: withTexts(brick.describe, main, each(texts, (t) => t.describe)) } : {}),
    fields: translateFields(brick.fields, main, Object.fromEntries(Object.entries(texts).map(([locale, t]) => [locale, t?.fields])), key, problems),
    ...(brick.tasks ? { tasks: brick.tasks.map((task) => ({ ...task, label: withTexts(task.label, main, each(tasks, (t) => t[task.id])) })) } : {}),
  }
}

/** The words of the standard tasks. Other editor languages use the English form (an open point of the POC). */
const WORDS: Record<string, { entry: string } & Record<StandardTask, (noun: string) => string>> = {
  de: { entry: 'Eintrag', add: (n) => `${n} hinzufügen`, edit: (n) => `${n} bearbeiten`, remove: (n) => `${n} entfernen` },
  en: { entry: 'Entry', add: (n) => `Add ${lower(n)}`, edit: (n) => `Edit ${lower(n)}`, remove: (n) => `Remove ${lower(n)}` },
  fr: { entry: 'Entrée', add: (n) => `Ajouter : ${lower(n)}`, edit: (n) => `Modifier : ${lower(n)}`, remove: (n) => `Retirer : ${lower(n)}` },
}
const wordsOf = (locale: Locale) => WORDS[locale.split('-')[0] ?? ''] ?? WORDS.en!
/** "Service" → "service", but "FAQ" stays. */
const lower = (noun: string) => (/^\p{Lu}\p{Ll}/u.test(noun) ? noun[0]!.toLowerCase() + noun.slice(1) : noun)

/** The word for one entry when a collection sets no `item`: "Eintrag" in the main language. */
export const entryWord = (main: Locale): string => wordsOf(main).entry

/** The label of a standard task: "Service hinzufügen", in every language the noun has. */
export function standardLabel(id: StandardTask, noun: Label, main: Locale): Label {
  if (typeof noun === 'string') return wordsOf(main)[id](noun)
  return Object.fromEntries(Object.entries(noun).map(([locale, word]) => [locale, wordsOf(locale)[id](word)]))
}
