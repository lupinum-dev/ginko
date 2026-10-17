// Translatable labels and the open lists of languages and currencies (SPEC 2.1).
import type { Brick, Currency, Field, Label, Locale } from './types.ts'

/** Most content languages one site can have. */
export const MAX_LOCALES = 20

/**
 * A content language: a BCP-47 tag that `Intl.getCanonicalLocales` accepts and that is already canonical
 * (`es`, `pt-BR`, `zh-Hant`; not `EN-us` or `pt_BR`). Runtime check for `Locale`, which is a plain string.
 */
export function isLocale(value: unknown): value is Locale {
  if (typeof value !== 'string' || value === '') return false
  try {
    const canonical = Intl.getCanonicalLocales(value)
    return canonical.length === 1 && canonical[0] === value
  } catch {
    return false
  }
}

let currencies: Set<string> | undefined

/** An ISO-4217 code (`EUR`, `JPY`, `SGD`) that this runtime's `Intl` knows. */
export function isCurrency(value: unknown): value is Currency {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return false
  currencies ??= new Set(Intl.supportedValuesOf('currency'))
  return currencies.has(value)
}

/**
 * The text of a label in `locale`: that language, else the main language, else English, else the first one given.
 * A plain string is the main language's text and is shown in every language.
 */
export function labelOf(label: Label, locale: string, main: string): string {
  if (typeof label === 'string') return label
  if (Object.hasOwn(label, locale)) return label[locale]!
  if (Object.hasOwn(label, main)) return label[main]!
  if (Object.hasOwn(label, 'en')) return label.en!
  return Object.values(label)[0] ?? ''
}

/** Two labels with the same texts (record key order does not matter). */
export function sameLabel(a: Label | undefined, b: Label | undefined): boolean {
  if (typeof a === 'string' || typeof b === 'string' || a === undefined || b === undefined) return a === b
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && a[k] === b[k])
}

/**
 * Why a label is not valid, as an English sentence, or null. A text must not be empty or blank; a record needs the main
 * language (or English) and a text for every key, and its keys are content languages. The one rule for every label
 * of a schema: bricks, fields, tasks and components.
 */
export function labelProblem(path: string, label: unknown, main: string): string | null {
  if (typeof label === 'string') return label.trim() === '' ? `${path}: label is empty.` : null
  if (typeof label !== 'object' || label === null || Array.isArray(label)) return `${path}: label must be a text or an object with one text per language.`
  const record = label as Record<string, unknown>
  const bad = Object.keys(record).find((k) => !isLocale(k))
  if (bad !== undefined) return `${path}: label has the invalid language “${bad}”.`
  // English is the shared fallback, so labels from presets (`{ de, en }`) also work on a site in `es`.
  if (!Object.hasOwn(record, main) && !Object.hasOwn(record, 'en')) return `${path}: label needs a text in the main language “${main}” or in English.`
  if (Object.values(record).some((v) => typeof v !== 'string' || v.trim() === '')) return `${path}: label needs a text for each language.`
  return null
}

/**
 * A schema label in the Studio's languages (German, English, Spanish, French), for factories that ship ready-made
 * bricks. The stored schema keeps the record; `labelOf` picks the editor's language and falls back to English.
 */
export const studioLabel = (de: string, en: string, es: string, fr: string): Record<Locale, string> => ({ de, en, es, fr })

/**
 * `brick` with every label, hint, group, item label, option label and task label written as its plain text in
 * `locale`. For a package that shares a factory but keeps the one-language labels its sites already store
 * (ginko-docs): a changed label is a schema change on every such site.
 */
export function labelsIn<B extends Brick>(brick: B, locale: Locale): B {
  const text = (label: Label) => labelOf(label, locale, locale)
  const field = (input: Field): Field => {
    const out: Record<string, unknown> = { ...input, label: text(input.label) }
    if (input.hint !== undefined) out.hint = text(input.hint)
    if (input.group !== undefined) out.group = text(input.group)
    if (input.type === 'choice' || input.type === 'choices') out.options = input.options.map((o) => ({ ...o, label: text(o.label) }))
    if (input.type === 'list') {
      out.itemLabel = text(input.itemLabel)
      out.of = Object.fromEntries(Object.entries(input.of).map(([name, column]) => [name, field(column)]))
    }
    return out as unknown as Field
  }
  return {
    ...brick,
    label: text(brick.label),
    ...(brick.describe !== undefined ? { describe: text(brick.describe) } : {}),
    fields: Object.fromEntries(Object.entries(brick.fields).map(([name, f]) => [name, field(f)])),
    ...(brick.tasks ? { tasks: brick.tasks.map((task) => ({ ...task, label: text(task.label) })) } : {}),
  }
}
