import { describe, expect, it } from 'vitest'
import { compileCatalogs, compileMessage, compileTree, MessageError, mergeTrees, sourceProblem } from '../src/core/compiler'
import { defineCatalog } from '../src/core/catalog'
import { createFormatters } from '../src/core/format'
import { alternatesOf, cleanPath, inUserZone, localeFromPath, localizePath, negotiateLocale, ogLocale, resolveConfig, stripLocale } from '../src/core/locales'
import { createTranslator, formatParts } from '../src/core/messages'

const pexd = resolveConfig({ locales: ['de-AT', 'en-GB'], defaultLocale: 'de' })
const prefix = resolveConfig({ locales: ['de-AT', 'en-GB'], defaultLocale: 'de', strategy: 'prefix' })

describe('negotiateLocale with hostile headers', () => {
  it.each([
    ['en-US,en;q=0.9', 'en'],
    ['EN-gb', 'en'],
    ['fr-FR, en;q=0.1', 'en'],
    ['en;q=0, de;q=0.5', 'de'],
    ['*', undefined],
    ['', undefined],
    [';;;,,,q=', undefined],
    ['en;q=abc', undefined],
    ['de-CH', 'de'],
    [`${'zz,'.repeat(5000)}en`, 'en'],
  ])('%s → %s', (header, expected) => {
    expect(negotiateLocale(header, pexd)).toBe(expected)
  })
})

describe('paths', () => {
  it.each([
    ['/', 'de'], ['/en', 'en'], ['/en/', 'en'], ['/en/about', 'en'], ['/de', undefined], ['/de/x', undefined],
    ['/english', 'de'], ['/api/x', undefined], ['/__nuxt_island/x', undefined],
  ])('prefix_except_default %s → %s', (path, locale) => {
    expect(localeFromPath(path, pexd)).toBe(locale)
  })
  it.each([['/', undefined], ['/de', 'de'], ['/en/x', 'en'], ['/x', undefined]])('prefix %s → %s', (path, locale) => {
    expect(localeFromPath(path, prefix)).toBe(locale)
  })
  it('round-trips', () => {
    expect(localizePath('/', 'en', pexd)).toBe('/en')
    expect(localizePath('/', 'de', pexd)).toBe('/')
    expect(localizePath('/a', 'de', prefix)).toBe('/de/a')
    expect(stripLocale('/en', pexd)).toBe('/')
    expect(stripLocale('/en/a/b', pexd)).toBe('/a/b')
    expect(stripLocale('/english', pexd)).toBe('/english')
  })
  it.each([
    ['/app', true], ['/app/settings', true], ['/app/a/b', true], ['/billing', true], ['/apple', false], ['/', false], ['/en/app', false], ['/api/app', false],
  ])('user-locale zone /app/** and /billing: %s → %s', (path, zone) => {
    const config = resolveConfig({ locales: ['de-AT', 'en-GB'], userLocale: ['/app/**', '/billing'] })
    expect(inUserZone(path, config)).toBe(zone)
  })
  it('a zone of `/**` leaves excluded paths alone and owns every page path', () => {
    const config = resolveConfig({ locales: ['de-AT', 'en-GB'], userLocale: ['/**'], exclude: ['/studio'] })
    expect([inUserZone('/', config), inUserZone('/x/y', config), inUserZone('/studio', config), inUserZone('/api/x', config)]).toEqual([true, true, false, false])
    expect(localeFromPath('/en/about', config)).toBeUndefined()
  })
  // `/admin/*` (the routeRules style) used to match nothing, without an error.
  it.each([['exclude', '/admin/*'], ['exclude', 'studio'], ['userLocale', 'app/**'], ['userLocale', '/a/**/b'], ['userLocale', '/app*']])('rejects the %s pattern %s', (option, pattern) => {
    expect(() => resolveConfig({ locales: ['de-AT'], [option]: [pattern] })).toThrow(`i18n.${option} pattern "${pattern}" is neither an exact path nor a prefix`)
  })
  it('takes a locale code as defaultLocale, not a language tag', () => {
    expect(() => resolveConfig({ locales: ['de-AT', 'en-GB'], defaultLocale: 'de-AT' })).toThrow('Fix: use "de"')
    expect(() => resolveConfig({ locales: ['de-AT', 'en-GB'], defaultLocale: 'fr' })).toThrow('Fix: use one of "de", "en"')
  })
  it('accepts URL codes with capitals, as Ginko passes canonical tags', () => {
    const config = resolveConfig({ locales: ['de', ...['pt-BR', 'zh-Hant'].map(code => ({ code, language: code }))] })
    expect(config.locales.map(l => l.code)).toEqual(['de', 'pt-BR', 'zh-Hant'])
    expect(localeFromPath('/pt-BR/sobre', config)).toBe('pt-BR')
    expect(negotiateLocale('pt-br', config)).toBe('pt-BR')
  })
  it.each([
    ['//blog', '/blog'], ['/blog/', '/blog'], ['//en//blog/', '/en/blog'], ['/EN/about/', '/en/about'], ['/pt-br/x', '/pt-BR/x'], ['/PT-BR', '/pt-BR'],
    ['//evil.com', '/evil.com'], ['/', undefined], ['/en', undefined], ['/blog', undefined], ['/pt-BR/x', undefined],
  ])('cleanPath(%s) → %s', (path, expected) => {
    expect(cleanPath(path, resolveConfig({ locales: ['de', 'en', { code: 'pt-BR', language: 'pt-BR' }] }))).toBe(expected)
  })
  it('rejects two locales with one URL code', () => {
    expect(() => resolveConfig({ locales: ['en-GB', 'en-US'] })).toThrow(/Two locales use the URL code "en"/)
    expect(resolveConfig({ locales: ['en-GB', { language: 'en-US', code: 'us' }] }).locales.map(l => l.code)).toEqual(['en', 'us'])
  })
  it('knows RTL and native names', () => {
    const c = resolveConfig({ locales: ['ar', 'de-AT'] })
    expect(c.locales[0]).toMatchObject({ dir: 'rtl', code: 'ar' })
    expect(c.locales[1]!.name).toMatch(/^Deutsch/)
  })
})

describe('messages with odd input', () => {
  const plural = compileMessage('k', '{n, plural, =0 {none} one {# item} other {# items}}').message
  it.each([
    [0, 'none'], [1, '1 item'], [2, '2 items'], [1.5, '1.5 items'], [-1, '-1 item'], ['1', '1 item'],
    [Number.NaN, '# items'], [undefined, '# items'], [1e21, '1,000,000,000,000,000,000,000 items'],
  ])('plural %s', (n, expected) => {
    expect(formatParts(plural, { n: n as number }, 'en-GB').join('')).toBe(expected)
  })
  it('keeps params as text, never as markup', () => {
    const msg = compileMessage('k', 'Hi <b>{name}</b>').message
    expect(formatParts(msg, { name: '<link>x</link>' }, 'en')).toEqual(['Hi ', { tag: 'b', children: ['<link>x</link>'] }])
  })
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('select with the value %s falls back to other', (value) => {
    const msg = compileMessage('k', '{role, select, admin {Admin} other {Guest}}').message
    expect(formatParts(msg, { role: value }, 'en').join('')).toBe('Guest')
  })
  it('does not find keys on Object.prototype', () => {
    const t = createTranslator({ messages: compileTree({ a: 'text' }).tree, language: 'en' })
    expect(t.t('constructor.name')).toBe('constructor.name')
  })
  it('names the key when ICU is broken', () => {
    expect(() => compileTree({ a: { b: 'Hi {name' } })).toThrow(/"a.b" is not valid ICU/)
    expect(() => compileTree({ a: '{n, plural, one {x}}' })).toThrow(/"a" is not valid ICU/)
  })
  // `"Mr. Smith"` as a key was typed as available but `t()` read `{ Mr: { ' Smith' } }` instead.
  it.each([
    [{ 'a.b': 'x' }, 'Message key "a.b" contains "."', '{ "a": { "b": … } }'],
    [{ nav: { 'v1.2': 'x' } }, 'Message key "v1.2" in "nav" contains "."', '{ "v1": { "2": … } }'],
    [{ nav: { '': 'x' } }, 'A message key in "nav" is empty', 'give it a name'],
  ])('rejects the key in %j', (raw, problem, fix) => {
    expect(() => compileTree(raw)).toThrow(problem)
    expect(() => compileTree(raw)).toThrow(fix)
  })
  // A library source without a valid namespace merged its keys into the app's, or made them unreachable.
  it.each([
    ['cms', false],
    ['', true],
    ['my.lib', true],
  ])('a ginko-i18n:sources namespace %j is refused: %s', (namespace, refused) => {
    expect(sourceProblem({ namespace, dir: '/lib/i18n' }) !== undefined).toBe(refused)
  })
  it('reports params per key', () => {
    expect(compileTree({ a: { b: '{x} {n, plural, other {{y}}}' } }).params).toEqual({ 'a.b': ['x', 'n', 'y'] })
  })
  it('shows the key, not an empty string, when missing', () => {
    const missing: string[] = []
    const t = createTranslator({ messages: {}, language: 'en', onMissing: k => missing.push(k) })
    expect(t.t('a.b')).toBe('a.b')
    expect(missing).toEqual(['a.b'])
  })
  it('does not treat a key path into a string as a message', () => {
    const t = createTranslator({ messages: compileTree({ a: 'text' }).tree, language: 'en' })
    expect(t.t('a.b')).toBe('a.b')
  })
  it('merges later sources per key', () => {
    expect(mergeTrees({ a: { b: '1', c: '2' } }, { a: { b: '3' } })).toEqual({ a: { b: '3', c: '2' } })
  })
  it('keeps apostrophes (ICU quoting) as typed', () => {
    expect(formatParts(compileMessage('k', 'Don\'t worry, it\'s {name}\'s').message, { name: 'Ana' }, 'en').join('')).toBe('Don\'t worry, it\'s Ana\'s')
  })
})

describe('dates', () => {
  const day = { day: 'numeric', month: 'long' } as const
  it.each([
    ['de-AT', '2026-10-24', '2026-10-25', day, '24.–25. Oktober'],
    ['en-GB', '2026-10-24', '2026-10-25', day, '24–25 October'],
    ['en-GB', '2026-06-30', '2026-07-02', day, '30 June – 2 July'],
    ['de-AT', '2026-10-13', '2026-10-16', 'long', '13.–16. Oktober 2026'],
    ['de-AT', '2026-10-13', '2026-10-13', 'long', '13. Oktober 2026'],
    ['de-AT', '2026-01-05', '2026-01-05', day, '5. Jänner'],
  ] as const)('%s %s–%s', (language, from, to, options, expected) => {
    expect(createFormatters(language).range(from, to, options)).toBe(expected)
  })
})

describe('site time zone and relative time', () => {
  const now = Date.parse('2026-10-11T12:00:00Z')
  const minute = 60_000
  it.each([
    ['timestamp in site zone', createFormatters('de-AT', { timeZone: 'Europe/Vienna' }).date(new Date('2026-10-08T22:30:00Z'), { hour: '2-digit', minute: '2-digit' }), '00:30'],
    ['calendar date ignores site zone', createFormatters('de-AT', { timeZone: 'Pacific/Auckland' }).date('2026-10-08'), '8. Oktober 2026'],
    ['5 minutes ago, en', createFormatters('en').relative(now - 5 * minute, now), '5 minutes ago'],
    ['5 minutes ago, de-AT', createFormatters('de-AT').relative(now - 5 * minute, now), 'vor 5 Minuten'],
    ['1 day ago, en', createFormatters('en').relative(now - 86_400_000, now), 'yesterday'],
    ['59.7 minutes round up to an hour', createFormatters('de-AT').relative(now - 59.7 * minute, now), 'vor 1 Stunde'],
    ['23.6 hours round up to a day', createFormatters('en').relative(now + 23.6 * 60 * minute, now), 'tomorrow'],
  ])('%s', (_, actual, expected) => {
    expect(actual).toBe(expected)
  })
})

describe('ICU number, date and time styles', () => {
  it.each([
    ['de-AT', '{p, number, percent}', { p: 0.25 }, '25 %'],
    ['en-GB', '{p, number, percent}', { p: 0.25 }, '25%'],
    ['de-AT', '{x, number, ::currency/SGD}', { x: 9.5 }, 'SGD 9,50'],
    ['en-GB', '{x, number, ::currency/SGD}', { x: 9.5 }, 'SGD 9.50'],
    ['de-AT', '{d, date, long}', { d: '2026-10-08' }, '8. Oktober 2026'],
    ['en-GB', '{d, date, long}', { d: '2026-10-08' }, '8 October 2026'],
    ['de-AT', '{d, time, short}', { d: new Date('2026-10-08T22:30:00Z') }, '00:30'],
    ['en-GB', '{d, time, short}', { d: new Date('2026-10-08T22:30:00Z') }, '00:30'],
  ] as const)('%s %s', (language, source, params, expected) => {
    const t = createTranslator({ messages: compileTree({ m: source }).tree, language, timeZone: 'Europe/Vienna' })
    expect(t.t('m', params)).toBe(expected)
  })
  it('formats in the zone of one call, e.g. a site elsewhere', () => {
    const t = createTranslator({ messages: compileTree({ m: '{d, time, short}' }).tree, language: 'en-GB', timeZone: 'Europe/Vienna' })
    expect(t.t('m', { d: new Date('2026-10-08T22:30:00Z') }, { timeZone: 'America/New_York' })).toBe('18:30')
  })
  it('fails the compile on an unknown number style', () => {
    expect(() => compileMessage('k', '{x, number, bogus}')).toThrow(MessageError)
    expect(() => compileMessage('k', '{x, number, bogus}')).toThrow(/Unknown number style "bogus"/)
  })
})

it.each([['de-AT', 'de_AT'], ['en', 'en'], ['zh-Hant-TW', 'zh_TW'], ['zh-Hant', 'zh']])('ogLocale(%s) → %s', (language, expected) => {
  expect(ogLocale(language)).toBe(expected)
})

describe('alternatesOf', () => {
  it('lists each locale with its language and adds x-default for the default locale', () => {
    expect(alternatesOf({ 'de': '/', 'en': '/en' }, pexd)).toEqual([
      { hreflang: 'de-AT', path: '/' },
      { hreflang: 'en-GB', path: '/en' },
      { hreflang: 'x-default', path: '/' },
    ])
    expect(alternatesOf({ en: '/en/x' }, pexd)).toEqual([{ hreflang: 'en-GB', path: '/en/x' }])
  })
})

describe('defineCatalog', () => {
  it('falls back to the default locale for unknown locales and missing keys; a full tag finds its language', () => {
    const catalog = defineCatalog<'hi' | 'only'>(compileCatalogs({ de: { hi: 'Hallo {name}', only: 'Nur Deutsch' }, en: { hi: 'Hello {name}' } }), { defaultLocale: 'de' })
    expect([catalog.t('en', 'hi', { name: 'Ana' }), catalog.t('en', 'only'), catalog.t('xx', 'hi', { name: 'Ana' }), catalog.t('en-US', 'hi', { name: 'Ana' })])
      .toEqual(['Hello Ana', 'Nur Deutsch', 'Hallo Ana', 'Hello Ana'])
    expect(catalog.isLocale('en') && !catalog.isLocale('toString')).toBe(true)
  })
})

describe('numeric parameters', () => {
  it('marks plural, selectordinal and number arguments as numeric, plain arguments not', () => {
    expect(compileMessage('k', '{name}: {count, plural, other {#}} {place, selectordinal, other {#.}} {total, number}').numeric.sort()).toEqual(['count', 'place', 'total'])
  })
})
