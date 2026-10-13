// The bridge to ginko-i18n: Ginko passes `locales`, `defaultLocale`, `baseUrl` and `timeZone` from ginko.config.ts.

/** The ginko-i18n options Ginko sets, and where each one lives in ginko.config.ts. */
const OWNED = { locales: 'locales', defaultLocale: 'the first entry of locales', baseUrl: 'url', timeZone: 'timezone' } as const

/**
 * Throws when nuxt.config `i18n` sets an option Ginko owns. Nuxt would merge it silently with Ginko's
 * value (Ginko's scalar wins, arrays concatenate), so `locales: ['fr']` would add a locale Ginko does not
 * know. The other options (strategy, exclude, userLocale, params, seo) pass through.
 */
export function checkI18nOptions(userI18n: unknown): void {
  const set = new Set(userI18n && typeof userI18n === 'object' ? Object.entries(userI18n).filter(([, value]) => value !== undefined).map(([key]) => key) : [])
  const clashes = (Object.keys(OWNED) as (keyof typeof OWNED)[]).filter((key) => set.has(key))
  if (clashes.length)
    throw new Error(`[ginko] nuxt.config sets ${clashes.map((key) => `i18n.${key}`).join(', ')}, which ginko.config.ts owns (${clashes.map((key) => OWNED[key]).join(', ')}). Fix: delete these keys from \`i18n\` in nuxt.config.`)
}
