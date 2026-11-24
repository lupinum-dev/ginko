import { slugKeyOf } from './fields.ts'
import type { CollectionBrick, Json } from './types.ts'

const replacements: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' }

/**
 * German-friendly URL slug: "Über uns & Team" → "ueber-uns-team". '' when the text has no letters or digits: each
 * caller states what it takes then (the platform takes the brick key, `nameBase`).
 */
export function slugify(input: string): string {
  const slug = input
    .replace(/[äöüßÄÖÜ]/g, (c) => replacements[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The longest entry name. */
export const ENTRY_NAME_MAX = 100

/**
 * An entry's name, the same in both homes (V2 5.6): the file name `content/<brick>/<name>.md` without order number,
 * language and extension, and the stored `name` of a platform entry. The shape of a slug, 1 to 100 characters.
 */
export function isEntryName(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= ENTRY_NAME_MAX && SLUG_PATTERN.test(value)
}

/** The rule of `isEntryName` as one sentence, for the messages that refuse a name. */
export const ENTRY_NAME_RULE = 'An entry name is 1 to 100 lower-case letters (a to z), digits and single hyphens between them, such as “summer-menu”.'

const textIn = (value: Json | undefined, main: string): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const text = (value as Record<string, Json>)[main]
    return typeof text === 'string' ? text : ''
  }
  return ''
}

/**
 * The text a new entry's name is made from, in the main language: for a brick with an address field the text its slug
 * is made from (`from`), so the name and the main slug start equal; for any other brick the field of `listing.title`
 * (a date title gives `2026-11-30`).
 */
export function nameSource(brick: CollectionBrick, data: Readonly<Record<string, Json>>, main: string): string {
  const slugKey = slugKeyOf(brick)
  const field = slugKey ? brick.fields[slugKey]! : undefined
  return textIn(data[field?.type === 'slug' ? field.from : brick.listing.title], main)
}

/** The name before it is made unique: from `nameSource`, or the brick key when that text gives none (`events`, then `events-2`). */
export function nameBase(brickKey: string, brick: CollectionBrick, data: Readonly<Record<string, Json>>, main: string): string {
  return slugify(nameSource(brick, data, main)) || slugify(brickKey)
}

/**
 * The names of stored entries of one brick, in the order given, as the upgrade and a corpus give them: a brick with an
 * address field takes each entry's main-language slug, any other the text of `listing.title`; a later entry with the
 * same name gets `-2`, `-3`. `taken` names a name some other entry already holds.
 */
export function namesOf(brickKey: string, brick: CollectionBrick, main: string, rows: readonly Readonly<Record<string, Json>>[], taken: (name: string) => boolean = () => false): string[] {
  const slugKey = slugKeyOf(brick)
  const given = new Set<string>()
  return rows.map((data) => {
    const slug = slugKey ? textIn(data[slugKey], main) : ''
    const name = uniqueSlug(isEntryName(slug) ? slug : nameBase(brickKey, brick, data, main), (n) => given.has(n) || taken(n))
    given.add(name)
    return name
  })
}

/**
 * The slug of a new entry per locale before it is made unique (SPEC 2.2), from the text of its `from` field in that
 * locale: the main locale (the first) always gets one, `fallback` when its text gives none (the brick key on the
 * platform); another locale gets one from its own text, or `undefined` when it has none and takes the main locale's
 * slug. The platform makes these unique; the Studio's preview of a new entry uses them as they are.
 */
export function slugBases(locales: readonly string[], texts: Readonly<Record<string, string | undefined>>, fallback: string): Record<string, string | undefined> {
  const main = locales[0]
  return Object.fromEntries(locales.map((locale) => {
    const own = slugify(texts[locale] ?? '')
    return [locale, locale === main ? own || fallback : own || undefined]
  }))
}

/** First free slug: base, base-2, base-3, … */
export function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  if (!taken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken(candidate)) return candidate
  }
}
