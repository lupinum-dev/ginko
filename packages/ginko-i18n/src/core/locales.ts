// Locale identity and URL rules. Pure functions: they run in Nuxt, Nitro, Convex and plain Vue.

export interface LocaleInput {
  /** BCP 47 tag used for hreflang, `lang` and Intl, e.g. `de-AT`. */
  language: string
  /** URL segment. Defaults to the language subtag (`de-AT` → `de`). */
  code?: string
  /** Name shown in a switcher. Defaults to the native name from Intl.DisplayNames. */
  name?: string
}

export interface LocaleInfo {
  code: string
  language: string
  name: string
  dir: 'ltr' | 'rtl'
}

export type Strategy = 'prefix_except_default' | 'prefix'

export interface LocaleConfig {
  locales: LocaleInfo[]
  defaultLocale: string
  strategy: Strategy
  /** Path patterns that never get a locale prefix (`/api/**`, `/studio/**`). */
  exclude: string[]
  /** Path patterns whose locale comes from the user (cookie, then Accept-Language), not from the URL. */
  userLocale: string[]
}

/**
 * A URL code: letters, digits and `-`, starting with a letter. Case is kept, so a canonical tag (`pt-BR`,
 * `zh-Hant`) can be the URL code; see `canonicalCase`. The module and the CLI share this rule.
 */
export const LOCALE_CODE = /^[a-z][a-z0-9-]*$/i

const RTL = new Set(['ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'sd', 'ur', 'yi'])

export function resolveLocale(input: string | LocaleInput): LocaleInfo {
  const def = typeof input === 'string' ? { language: input } : input
  const tag = new Intl.Locale(def.language)
  const code = def.code ?? tag.language
  if (!LOCALE_CODE.test(code))
    throw new Error(`[ginko-i18n] Locale code "${code}" must be letters, digits or "-". Fix: set \`code\` for ${def.language}.`)
  const name = def.name ?? nativeName(tag.baseName)
  return { code, language: tag.baseName, name, dir: RTL.has(tag.language) ? 'rtl' : 'ltr' }
}

function nativeName(language: string): string {
  try {
    const short = new Intl.Locale(language).language
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(short) ?? language
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1)
  }
  catch {
    return language
  }
}

/**
 * The tag that formats dates and numbers for `language` in a user-locale zone, where `browser` is the person's first
 * browser language (Accept-Language, `navigator.language`): its regional variant when it is the same language and
 * `language` names no region itself (`en` read in an `en-GB` browser formats as `en-GB`: 25/10/2026), else `language`.
 */
export function regionalLanguage(language: string, browser: string | undefined): string {
  if (!browser) return language
  try {
    const own = new Intl.Locale(language)
    const theirs = new Intl.Locale(browser)
    const same = theirs.language === own.language && (!own.script || own.script === theirs.script)
    return !own.region && theirs.region && same ? theirs.baseName : language
  }
  catch {
    return language
  }
}

/** `og:locale` wants `language_TERRITORY`: `de-AT` → `de_AT`, `zh-Hant-TW` → `zh_TW`, `zh-Hant` → `zh`. */
export function ogLocale(language: string): string {
  const tag = new Intl.Locale(language)
  return tag.region ? `${tag.language}_${tag.region}` : tag.language
}

export function resolveConfig(input: {
  locales: (string | LocaleInput)[]
  defaultLocale?: string
  strategy?: Strategy
  exclude?: string[]
  userLocale?: string[]
}): LocaleConfig {
  if (!input.locales?.length)
    throw new Error('[ginko-i18n] `i18n.locales` is empty. Fix: add at least one locale, e.g. `locales: [\'de-AT\']`.')
  const locales = input.locales.map(resolveLocale)
  const codes = new Set<string>()
  for (const l of locales) {
    // `pt-br` and `pt-BR` would be one URL for the router, which matches case-insensitively.
    if (codes.has(l.code.toLowerCase()))
      throw new Error(`[ginko-i18n] Two locales use the URL code "${l.code}". Fix: give one of them an explicit \`code\`.`)
    codes.add(l.code.toLowerCase())
  }
  const wanted = input.defaultLocale ?? locales[0]!.code
  const def = locales.find(l => l.code === wanted)
  if (!def) {
    const tagged = locales.find(l => l.language === wanted)
    throw new Error(tagged
      ? `[ginko-i18n] defaultLocale "${wanted}" is a language tag, not a locale code. Fix: use "${tagged.code}".`
      : `[ginko-i18n] defaultLocale "${wanted}" is not a locale code. Fix: use one of ${locales.map(l => `"${l.code}"`).join(', ')}.`)
  }
  checkPatterns('exclude', input.exclude ?? [])
  checkPatterns('userLocale', input.userLocale ?? [])
  return {
    locales,
    defaultLocale: def.code,
    strategy: input.strategy ?? 'prefix_except_default',
    exclude: ['/api/**', '/_nuxt/**', '/__nuxt_island/**', '/_ipx/**', ...(input.exclude ?? [])],
    userLocale: input.userLocale ?? [],
  }
}

/**
 * The hreflang links of one page, from its path per locale code: one per locale with its BCP 47
 * language, plus `x-default` for the default locale's path. One rule for the page head and the
 * sitemap, so search engines see the same alternates in both (D13).
 */
export function alternatesOf(paths: Partial<Record<string, string>>, config: Pick<LocaleConfig, 'locales' | 'defaultLocale'>): { hreflang: string, path: string }[] {
  const links = config.locales.flatMap(l => paths[l.code] ? [{ hreflang: l.language, path: paths[l.code]! }] : [])
  const fallback = paths[config.defaultLocale]
  return fallback ? [...links, { hreflang: 'x-default', path: fallback }] : links
}

/**
 * `exclude` and `userLocale` take an exact path (`/studio`) or a prefix (`/app/**`, which also matches
 * `/app`). Anything else, such as `/app/*`, would silently match nothing, so it fails setup.
 */
function checkPatterns(option: string, patterns: string[]) {
  for (const pattern of patterns) {
    const base = pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern
    if (!pattern.startsWith('/') || base.includes('*'))
      throw new Error(`[ginko-i18n] i18n.${option} pattern "${pattern}" is neither an exact path nor a prefix. Fix: write an exact path such as "/studio" or a prefix such as "/app/**".`)
  }
}

function matchesPattern(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith('/**')) {
      const base = pattern.slice(0, -3)
      return path === base || path.startsWith(`${base}/`)
    }
    return path === pattern
  })
}

export function isExcluded(path: string, config: LocaleConfig): boolean {
  return matchesPattern(path, config.exclude)
}

/**
 * The path is a user-locale zone: its locale comes from the user's cookie or Accept-Language, not
 * from the URL. Excluded paths (`/api/**`, Nuxt internals, `exclude`) are never in a zone, so
 * `userLocale: ['/**']` leaves them alone.
 */
export function inUserZone(path: string, config: LocaleConfig): boolean {
  return !isExcluded(path, config) && matchesPattern(path, config.userLocale)
}

function firstSegment(path: string): string {
  return path.split('/')[1] ?? ''
}

/**
 * The path with its locale prefix in the code's own case (`/EN/about` → `/en/about`, `/pt-br/x` →
 * `/pt-BR/x`), or `undefined` when the case is already right or the first segment is no locale code.
 * The router matches case-insensitively, so a wrong-case URL would otherwise render in the default locale.
 */
export function canonicalCase(path: string, config: LocaleConfig): string | undefined {
  const segment = firstSegment(path)
  const locale = config.locales.find(l => l.code.toLowerCase() === segment.toLowerCase())
  if (!locale || locale.code === segment) return undefined
  return `/${locale.code}${path.slice(segment.length + 1)}`
}

/**
 * The one form of a path: no repeated slashes, no trailing slash (except `/`), the locale code in its
 * own case. `undefined` when the path already has it. Browsers read `\` as `/` in http(s) URLs, so a
 * run of mixed `/` and `\` collapses to one `/`: `//evil.com` and `/\evil.com/` become `/evil.com`,
 * and a redirect to the result never leaves the site.
 */
export function cleanPath(path: string, config: LocaleConfig): string | undefined {
  let clean = path.replace(/[\\/]{2,}/g, '/')
  if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1)
  clean = canonicalCase(clean, config) ?? clean
  return clean === path ? undefined : clean
}

/** The locale a path belongs to, or `undefined` when the path has no locale (`prefix` root, excluded paths, user-locale zones). */
export function localeFromPath(path: string, config: LocaleConfig): string | undefined {
  if (isExcluded(path, config) || inUserZone(path, config)) return undefined
  const segment = firstSegment(path)
  const prefixed = config.locales.find(l => l.code === segment)
  if (prefixed) {
    // With prefix_except_default, `/de/...` is not a valid URL for the default locale.
    if (config.strategy === 'prefix_except_default' && prefixed.code === config.defaultLocale) return undefined
    return prefixed.code
  }
  return config.strategy === 'prefix_except_default' ? config.defaultLocale : undefined
}

export function stripLocale(path: string, config: LocaleConfig): string {
  const segment = firstSegment(path)
  if (!config.locales.some(l => l.code === segment)) return path || '/'
  const rest = path.slice(segment.length + 1)
  return rest.startsWith('/') ? rest : `/${rest}`
}

export function prefixFor(locale: string, config: LocaleConfig): string {
  return config.strategy === 'prefix_except_default' && locale === config.defaultLocale ? '' : `/${locale}`
}

/** Add the locale prefix to an unprefixed path. `/` becomes `/en`, not `/en/`. */
export function localizePath(path: string, locale: string, config: LocaleConfig): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  const prefix = prefixFor(locale, config)
  if (!prefix) return clean
  return clean === '/' ? prefix : `${prefix}${clean}`
}

/**
 * Pick the best locale from an Accept-Language header. Exact tag first, then the language subtag.
 * Returns `undefined` when nothing matches, so callers choose their own fallback.
 */
export function negotiateLocale(header: string | null | undefined, config: LocaleConfig): string | undefined {
  if (!header) return undefined
  const ranges = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      const quality = q ? Number(q.slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index }
    })
    .filter(r => r.tag && r.tag !== '*' && r.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  for (const range of ranges) {
    const exact = config.locales.find(l => l.language.toLowerCase() === range.tag || l.code.toLowerCase() === range.tag)
    if (exact) return exact.code
    const base = range.tag.split('-')[0]
    const partial = config.locales.find(l => l.language.toLowerCase().split('-')[0] === base)
    if (partial) return partial.code
  }
  return undefined
}
