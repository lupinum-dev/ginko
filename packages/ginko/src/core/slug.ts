const replacements: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' }

/** German-friendly URL slug: "Über uns & Team" → "ueber-uns-team". Empty input gives "eintrag". */
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
  return slug || 'eintrag'
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * The slug of a new entry per locale before it is made unique (SPEC 2.2), from the text of its `from` field in that
 * locale: the main locale (the first) always gets one; another locale gets one from its own text, or `undefined`
 * when it has none and takes the main locale's slug. The platform makes these unique; the Studio's preview of a new
 * entry uses them as they are.
 */
export function slugBases(locales: readonly string[], texts: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  const main = locales[0]
  return Object.fromEntries(locales.map((locale) => {
    const own = texts[locale] ?? ''
    return [locale, locale === main ? slugify(own) : own ? slugify(own) : undefined]
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
