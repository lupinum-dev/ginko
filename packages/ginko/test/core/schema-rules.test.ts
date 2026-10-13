import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import { plan } from '../../src/cli/plan.ts'
import {
  buildBundle, checkSchema, checkSite, isShown, collection, defineComponents, defineSite, diffSchema, f, isCurrency, isLocale, labelOf, platformSchema, serializeSchema, single, validate,
  type Fields, type RouteTemplate, type Schema, type SiteInput,
} from '../../src/core/index.ts'

// One regression test per finding of the break-it phase 9 (schema rules). Each fails without its fix.

const base = (): Schema => structuredClone(serializeSchema(restaurant))
const node = (s: Schema, path: string) => path.split('.').reduce<unknown>((cur, key) => (cur as Record<string, unknown>)[key], s) as Record<string, any>

const optional = { optional: true } as const
type Bricks = SiteInput['bricks']

/** A small site: one collection `menu` with a name and the given extra fields. */
function site(fields: Fields = {}, over: Partial<SiteInput> = {}): SiteInput {
  return defineSite({
    site: 'linde', name: 'Linde', url: 'https://linde.example', timeZone: 'Europe/Vienna',
    locales: ['de', 'en'], currency: 'EUR', pages: { home: { de: '/', en: '/en' } },
    bricks: { menu: collection({ label: 'Karte', fields: { name: f.text('Name', { max: 120 }), ...fields }, max: 20, order: 'manual' }) },
    ...over,
  })
}
const problemsOf = (input: SiteInput) => checkSchema(serializeSchema(input))

describe('1. number options must be finite', () => {
  it.each([
    ['seo.title', 'max'], ['hours.holidayNoticeDays', 'min'], ['hours.holidayNoticeDays', 'max'], ['hours.holidayNoticeDays', 'step'],
    ['menu.price', 'min'], ['menu.price', 'max'], ['hours.week', 'min'], ['hours.week', 'max'],
  ])('%s.%s as null (what JSON makes of NaN), NaN and Infinity', (path, key) => {
    for (const bad of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = base()
      const [brick, name] = path.split('.')
      node(s, `bricks.${brick}.fields.${name}`)[key] = bad
      expect(checkSchema(s), `${path}.${key} = ${bad}`).toContain(`${path}: ${key} must be a finite number.`)
    }
  })

  it('serializeSchema does not turn NaN or Infinity into a silent null', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const problems = problemsOf(site({ amount: f.number('Menge', { min: 0, max: bad, step: 1, ...optional }) }))
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatch(/^menu\.amount\.max: (NaN|Infinity) cannot be stored/)
    }
  })
})

describe('2. values lost in serializeSchema', () => {
  const loop: Record<string, unknown> = { a: 1 }
  loop.self = loop
  it.each([
    ['a function as default', { default: () => 'x' }, 'menu.note.default: a function'],
    ['a Symbol as default', { default: Symbol('x') }, 'menu.note.default: a symbol'],
    ['undefined as default', { default: undefined }, 'menu.note.default: undefined'],
    ['undefined in a field option', { max: undefined }, 'menu.note.max: undefined'],
    ['a BigInt as max', { max: 10n }, 'menu.note.max: a BigInt'],
    ['a circular default', { default: loop }, 'menu.note.default.self: a circular structure'],
  ])('%s is reported with its path', (_name, options, start) => {
    const problems = problemsOf(site({ note: f.text('Notiz', { ...optional, ...(options as object) }) }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`${start} cannot be stored`)
  })

  it('names the path of a lost value inside a list column', () => {
    const rows = f.list('Zeilen', { itemLabel: 'Zeile', fields: { c: f.text('C', { ...optional, default: (() => 1) as never }) }, max: 3 })
    expect(problemsOf(site({ rows }))[0]).toContain('menu.rows.c.default: a function cannot be stored')
  })

  // A computed key creates an own property, also for __proto__; it must reach checkSchema.
  it.each(['__proto__', 'prototype', 'constructor'])('a brick, field and list column named %s are refused, not dropped', (key) => {
    const text = f.text('X', optional)
    const brick = single({ label: 'X', fields: { t: f.text('T', optional) } })
    const column = f.list('Zeilen', { itemLabel: 'Zeile', fields: Object.fromEntries([[key, text]]), max: 3 })
    const cases: [string, SiteInput, string][] = [
      ['brick', site({}, { bricks: { ...site().bricks, ...Object.fromEntries([[key, brick]]) } as Bricks }), 'Invalid brick name'],
      ['field', site(Object.fromEntries([[key, text]])), 'invalid field name'],
      ['column', site({ rows: column }), 'invalid column name'],
    ]
    for (const [what, input, word] of cases) {
      const problems = checkSchema(serializeSchema(input))
      expect(problems.join('\n'), `${what} ${key}`).toContain(`${word} “${key}”`)
    }
  })
})

describe('3. the time zone must exist', () => {
  it.each([['Europe/Wien', false], ['Mars/Olympus', false], ['', false], ['Europe/Vienna', true], ['UTC', true]])('%s -> valid: %s', (timeZone, valid) => {
    expect(problemsOf(site({}, { timeZone })).some((p) => p.startsWith('Invalid time zone'))).toBe(!valid)
  })
})

describe('4. locales and currency', () => {
  // Any canonical language tag is a content language; the tag is the key of the stored content and the URL segment.
  it.each([
    ['de', true], ['it', true], ['es', true], ['pt-BR', true], ['zh-Hant', true], ['de-AT', true],
    ['EN-us', false], ['DE', false], ['de_AT', false], ['d', false], ['de-at', false], ['', false], ['not a tag', false],
  ])('locale "%s" -> valid: %s', (locale, valid) => {
    const problems = problemsOf(site({}, { locales: ['de', locale] as never, pages: {} }))
    expect(problems.some((p) => p.startsWith('Invalid locale')), problems.join()).toBe(!valid)
    expect(isLocale(locale)).toBe(valid)
  })

  it('accepts es and pt-BR as site languages and caps a site at 20', () => {
    expect(problemsOf(site({}, { locales: ['es', 'pt-BR'], pages: {} }))).toEqual([])
    const many = Array.from({ length: 21 }, (_, i) => `x${String.fromCharCode(97 + i)}`.slice(1) + 'a')
    expect(problemsOf(site({}, { locales: many as never, pages: {} }))).toContain('Too many locales (at most 20).')
  })

  // Any ISO-4217 code the runtime knows; a made-up or lower-case code is refused.
  it.each([['EUR', true], ['CHF', true], ['USD', true], ['JPY', true], ['SGD', true], ['eur', false], ['XYZ', false], ['EURO', false], ['', false]])('currency "%s" -> valid: %s', (currency, valid) => {
    expect(problemsOf(site({}, { currency: currency as never })).some((p) => p.startsWith('Invalid currency'))).toBe(!valid)
    expect(problemsOf(site({ price: f.money('Preis', { ...optional, currency: currency as never }) })).some((p) => p.includes('currency must be an ISO 4217 code'))).toBe(!valid)
    expect(isCurrency(currency)).toBe(valid)
  })
  // The site url builds canonical URLs and the sitemap; `new URL` on a bad value threw at runtime.
  it.each([
    ['https://linde.example', true], ['http://localhost:3000', true], ['https://linde.example/de/', true],
    ['linde.example', false], ['/linde', false], ['ftp://linde.example', false], ['mailto:a@linde.example', false], ['', false],
    ['https://linde.example/?a#b', false], ['https://u:p@linde.example', false], ['https://linde.example?', false], ['https://linde.example#', false],
  ])('url "%s" -> valid: %s', (url, valid) => {
    expect(problemsOf(site({}, { url })).some((p) => p.startsWith('Invalid site url'))).toBe(!valid)
  })

  // `languages` stays out of the schema, so only checkSite (Nuxt build, `ginko check`, `ginko release`) sees it.
  it.each([
    [{ de: 'de-AT', en: 'en-GB' }, []],
    [{ fr: 'fr-FR' }, ['languages: locale “fr” is not in locales.']],
    [{ de: 'de_AT' }, ['languages.de: invalid language “de_AT” (expected a canonical language tag such as “de-AT” or “en-US”).']],
  ])('languages %j', (languages, expected) => {
    expect(checkSite(site({}, { languages }))).toEqual(expected)
  })
})

describe('4b. translatable labels', () => {
  const main = 'de'
  it.each([
    ['a string is the main language in every locale', 'Karte', 'en', 'Karte'],
    ['the asked language', { de: 'Karte', en: 'Menu' }, 'en', 'Menu'],
    ['falls back to the main language', { de: 'Karte', en: 'Menu' }, 'fr', 'Karte'],
    ['falls back to English when the main language is absent', { fr: 'Carte', en: 'Menu' }, 'es', 'Menu'],
    ['falls back to the first without main language and English', { fr: 'Carte', it: 'Carta' }, 'es', 'Carte'],
  ] as const)('labelOf: %s', (_name, label, locale, expected) => {
    expect(labelOf(label, locale, main)).toBe(expected)
  })

  const withLabel = (label: unknown) => problemsOf(site({ price: f.money(label as never, optional) }))
  it('a record with the main language or English is valid, as are old strings', () => {
    expect(withLabel({ de: 'Preis', en: 'Price' })).toEqual([])
    expect(withLabel({ en: 'Price' })).toEqual([])
    expect(withLabel('Preis')).toEqual([])
  })
  it.each([
    ['a record without the main language and English', { fr: 'Prix' }, 'menu.price.label: label needs a text in the main language “de” or in English.'],
    ['a non-canonical language tag', { de: 'Preis', 'EN-us': 'Price' }, 'menu.price.label: label has the invalid language “EN-us”.'],
    ['a text that is not a string', { de: 1 }, 'menu.price.label: label needs a text for each language.'],
  ])('rejects %s', (_name, label, problem) => {
    expect(withLabel(label)).toContain(problem)
  })
  it('checks labels of bricks, options and tasks too', () => {
    const input = site({ kind: f.choice('Art', { options: [{ value: 'a', label: { fr: 'A' } }] }) }, {
      bricks: { menu: collection({ label: { fr: 'Menu' }, fields: { name: f.text('Name') }, max: 5, order: 'manual', tasks: [{ id: 'new', kind: 'create', label: { fr: 'Nouveau' } }] }) },
    })
    expect(problemsOf(input)).toEqual(['menu.label: label needs a text in the main language “de” or in English.', 'menu.new.label: label needs a text in the main language “de” or in English.'])
  })
  it('the German issue text names a record label by the main language', async () => {
    const s = serializeSchema(site({ price: f.money({ de: 'Preis', en: 'Price' }) }))
    const result = await validate(s, 'menu', { name: { de: 'Suppe' } }, { mode: 'create' })
    expect(result.errors.map((e) => e.message)).toEqual(['„Preis“ fehlt.'])
  })
  it('a changed label is a harmless text change', () => {
    const before = serializeSchema(site())
    const after = structuredClone(before)
    after.bricks.menu!.label = { de: 'Karte', en: 'Menu' }
    expect(diffSchema(before, after).rejected).toEqual([])
    expect(diffSchema(before, after).changes.map((c) => c.kind)).toEqual(['text'])
  })
})

describe('5. money options stay within SPEC 2.2', () => {
  it.each([
    ['min -1', { min: -1 }, 'menu.price: min cannot be negative.'],
    ['max 100000001', { max: 100_000_001 }, 'menu.price: max at most 100000000 cents.'],
    ['min above max', { min: 500, max: 100 }, 'menu.price: min/max is invalid.'],
  ])('%s is refused', (_name, options, problem) => {
    expect(problemsOf(site({ price: f.money('Preis', { ...optional, ...options }) }))).toEqual([problem])
  })

  it('min 0 and max 100000000 are fine', () => {
    expect(problemsOf(site({ price: f.money('Preis', { ...optional, min: 0, max: 100_000_000 }) }))).toEqual([])
  })
})

describe('6. routes and pages', () => {
  const news = (de: string, en = '/en/news/[slug]') => collection({
    // Invalid routes on purpose: the schema check must report what the type would reject.
    label: 'News', fields: { title: f.text('Titel', { max: 80 }), slug: f.slug('Adresse', { from: 'title' }) }, max: 5, order: 'manual', route: { de, en } as Record<string, RouteTemplate>,
  })
  const withBricks = (bricks: Bricks) => site({}, { bricks: { ...site().bricks, ...bricks } })

  it.each([['/../[slug]'], ['/a//[slug]'], ['/a/[slug]?x=1'], ['/a/[slug]#top']])('route %s is refused', (route) => {
    expect(problemsOf(withBricks({ news: news(route) })).join('\n')).toContain('news: route for “de” must not contain')
  })

  it('two collections with the same route pattern in one locale are refused', () => {
    expect(problemsOf(withBricks({ news: news('/n/[slug]', '/en/a/[slug]'), blog: news('/n/[slug]', '/en/b/[slug]') })))
      .toEqual(['blog: route “/n/[slug]” for “de” is also used by “news”.'])
  })

  it('different patterns, or the same pattern in different locales, are fine', () => {
    expect(problemsOf(withBricks({ news: news('/n/[slug]', '/en/n/[slug]'), blog: news('/b/[slug]', '/en/b/[slug]') }))).toEqual([])
  })

  it.each([['/x?y'], ['/a/../b'], ['//evil.example'], ['/a#b']])('page %s is refused', (page) => {
    expect(problemsOf(site({}, { pages: { home: { de: '/', en: '/en' }, x: { de: page } } })).join('\n')).toContain(`pages.x.de: page “${page}” must start with “/”`)
  })

  it('one path for two pages in one locale is refused, the same path in two locales is fine', () => {
    expect(problemsOf(site({}, { pages: { home: { de: '/' }, start: { de: '/' } } }))).toEqual(['pages.start.de: page “/” is already used by “home”.'])
    expect(problemsOf(site({}, { pages: { karte: { de: '/karte', en: '/karte' } } }))).toEqual([])
  })

  it('a page in a locale the site does not have is refused', () => {
    expect(problemsOf(site({}, { pages: { home: { de: '/', fr: '/fr' } } }))).toEqual(['pages.home: locale “fr” is not in locales.'])
  })
})

describe('7. duplicate locales and the order of checkSchema and diffSchema', () => {
  it('reports a duplicate locale as a duplicate', () => {
    expect(problemsOf(site({}, { locales: ['de', 'de'], pages: {} }))).toEqual(['Locale “de” is listed twice.'])
  })

  it('plan() reports the broken schema, not the removed language that diffSchema would invent', async () => {
    const state = { site: 'linde', schema: serializeSchema(site()), schemaRev: 1, contentRev: 1, migrations: [], entries: [] }
    const result = await plan(state, site({}, { locales: ['de', 'de'], pages: {} }))
    expect(result.rejected).toEqual([])
    expect(result.candidate?.problems).toContain('Locale “de” is listed twice.')
  })
})

describe('8. diffSchema', () => {
  it('a changed time zone is refused', () => {
    const next = base()
    next.timeZone = 'Europe/Berlin'
    expect(diffSchema(base(), next).rejected.map((r) => [r.kind, r.message])).toEqual([['timeZone', 'Zeitzone kann nicht geändert werden.']])
  })

  // Astra 9: sites:bootstrap stores an empty Vienna/EUR/de schema; the first release must set its own.
  it('a site without bricks takes time zone, currency and languages from its first release', () => {
    const empty = { ...base(), bricks: {}, timeZone: 'Europe/Vienna', currency: 'EUR' as const, locales: ['de'] as Schema['locales'] }
    const next = { ...base(), timeZone: 'Europe/London', currency: 'CHF' as const, locales: ['en', 'de'] as Schema['locales'] }
    expect(diffSchema(empty, next).rejected).toEqual([])
  })

  // Allowed values are min + k * step. A smaller min moves that grid unless the shift is whole steps.
  it.each([
    [5, 0, 1, true], [0, -5, 1, true], [10, 4, 2, true], [10, 5, 2, false], [0, -1, 2, false], [0, -0.3, 0.1, true], [1, 0.5, 1, false],
  ])('number min %s -> %s with step %s is allowed: %s', (before, after, step, allowedChange) => {
    const prod = base()
    delete node(prod, 'bricks.hours.fields.holidayNoticeDays').default
    Object.assign(node(prod, 'bricks.hours.fields.holidayNoticeDays'), { min: before, step, max: 100 })
    const next = structuredClone(prod)
    node(next, 'bricks.hours.fields.holidayNoticeDays').min = after
    expect(diffSchema(prod, next).rejected.map((r) => r.kind)).toEqual(allowedChange ? [] : ['minOffGrid'])
  })

  describe('a new language on a site with routes', () => {
    const withIt = (route: Record<string, string>): Schema => {
      const next = base()
      next.locales = ['de', 'en', 'it']
      node(next, 'bricks.events').route = route
      return next
    }
    const old = () => ({ ...node(base(), 'bricks.events.route') }) as Record<string, string>

    it('may add the route of the new language', () => {
      const { rejected, changes } = diffSchema(base(), withIt({ ...old(), it: '/it/eventi/[slug]' }))
      expect(rejected).toEqual([])
      expect(changes.map((c) => c.kind)).toContain('routeAdded')
    })

    it.each([
      ['changes the route of an existing language', (r: Record<string, string>) => ({ ...r, de: '/termine/[slug]', it: '/it/e/[slug]' })],
      ['adds a route for a language that is not new', (r: Record<string, string>) => ({ ...r, fr: '/fr/e/[slug]', it: '/it/e/[slug]' })],
      ['drops the route of an existing language', (r: Record<string, string>) => ({ de: r.de!, it: '/it/e/[slug]' })],
    ])('still refuses a release that %s', (_name, change) => {
      expect(diffSchema(base(), withIt(change(old()))).rejected.map((r) => r.kind)).toEqual(['routeChanged'])
    })
  })

  it('plan() accepts a new language together with its routes', async () => {
    const state = { site: 'restaurant', schema: serializeSchema(restaurant), schemaRev: 1, contentRev: 1, migrations: [], entries: [] }
    const events = restaurant.bricks.events
    const input = {
      ...restaurant, locales: ['de', 'en', 'it'], pages: { ...restaurant.pages, home: { ...restaurant.pages.home, it: '/it' } },
      bricks: { ...restaurant.bricks, events: { ...events, route: { ...events.route, it: '/it/eventi/[slug]' } } },
    } as unknown as SiteInput
    const result = await plan(state, input)
    expect(result.rejected).toEqual([])
    expect(result.candidate?.problems).toEqual([])
  })
})

describe('9. value rules (F12)', () => {
  const errorsAt = async (brick: string, field: string, value: unknown) =>
    (await validate(base(), brick, { [field]: value }, { mode: 'patch', changed: new Set([field]) })).errors.filter((e) => e.path === field)

  it.each([['-----', false], ['+43 12', false], ['(((12)))', false], ['12345', true], ['+43 1 234 567', true]])('phone "%s" valid: %s', async (phone, valid) => {
    expect((await errorsAt('contact', 'phone', phone)).length === 0).toBe(valid)
  })

  it.each([['0000-01-01', false], ['1899-12-31', false], ['2200-01-01', false], ['9999-12-31', false], ['1900-01-01', true], ['2199-12-31', true], ['2026-10-09', true]])('date "%s" valid: %s', async (date, valid) => {
    expect((await errorsAt('hours', 'closedOn', date)).length === 0).toBe(valid)
  })

  it('an optional formatted text stored as "" is left out of the bundle', () => {
    const contact = (email: string) => buildBundle({
      schema: base(), requestedLocale: 'de', files: () => undefined, schemaRev: 1, contentRev: 1,
      generatedAt: '2026-10-09T00:00:00.000Z', today: '2026-10-09',
      entries: { contact: [{ id: 'c1', data: { phone: '+43 1 234 567', email } }] },
    }).bricks.contact
    expect(contact('')).toEqual({ kind: 'single', data: { phone: '+43 1 234 567' }, fallback: [] })
    expect(contact('a@b.example')).toMatchObject({ data: { email: 'a@b.example' } })
  })
})

// Phase 13 (CONTENT.md): file bricks and their markdown field.
describe('file bricks', () => {
  const md = { body: f.markdown('Text') }
  const files = (fields: Fields, source?: 'files') => site({}, { bricks: { docs: collection({ label: 'Doku', source, fields: { title: f.text('Titel'), ...fields }, max: 50, order: 'manual' }) } })
  const list = (cell: Fields[string]) => ({ rows: f.list('Zeilen', { itemLabel: 'Zeile', fields: { cell }, max: 5 }) })

  it.each([
    ['two markdown fields in a file brick', files({ ...md, intro: f.markdown('Intro') }, 'files'), 'docs: at most one markdown field (the text of the file).'],
    ['markdown in a list of a file brick', files(list(f.markdown('Zelle')), 'files'), 'docs: in file bricks, markdown is only allowed as the text of the file, not in a list.'],
  ])('%s is refused', (_, input, problem) => {
    expect(problemsOf(input)).toContain(problem)
  })

  // Wrong behaviour caught: the old rule "markdown only in file bricks" comes back and blocks editable Markdown in the platform.
  it.each([
    ['one markdown field in a file brick', files(md, 'files')],
    ['markdown in a platform brick', files(md)],
    ['markdown in a list of a platform brick', files(list(f.markdown('Zelle')))],
  ])('%s is fine', (_, input) => {
    expect(problemsOf(input)).toEqual([])
  })

  it('the platform never sees a file brick', async () => {
    const input = site({}, { bricks: { ...site().bricks, docs: collection({ label: 'Doku', source: 'files', fields: { title: f.text('Titel'), ...md }, max: 50, order: 'manual' }) } })
    expect(Object.keys(platformSchema(serializeSchema(input)).bricks)).toEqual(['menu'])
    const state = { site: 'linde', schema: serializeSchema(site()), schemaRev: 1, contentRev: 1, migrations: [], entries: [] }
    expect((await plan(state, input)).schema.bricks.docs).toBeUndefined()
  })
})

describe('text field limits', () => {
  const field = (over: Record<string, unknown>) => site({ name: { ...f.text('Name'), ...over } as Fields[string] })

  it('an address may be longer than prose', () => {
    expect(problemsOf(field({ format: 'url', max: 2000 }))).toEqual([])
    expect(problemsOf(field({ max: 501 }))).toContain('menu.name: max at most 500.')
    expect(problemsOf(field({ format: 'url', max: 2001 }))).toContain('menu.name: max at most 2000.')
  })
})

describe('markdown field rules', () => {
  const field = (over: Record<string, unknown>) => site({ body: { ...f.markdown('Text'), ...over } as Fields[string] })

  it.each([
    ['an unknown profile', { profile: 'huge' }, 'menu.body: profile must be inline, basic, rich, page.'],
    ['a max above 500000', { max: 500001 }, 'menu.body: max at most 500000.'],
    ['a default', { default: { de: 'Hallo' } }, 'menu.body: markdown cannot have a default.'],
  ])('%s is refused', (_, over, problem) => {
    expect(problemsOf(field(over))).toContain(problem)
  })

  it.each([{ profile: 'inline' }, { profile: 'page', max: 500000 }, {}])('%j is fine', (over) => {
    expect(problemsOf(field(over))).toEqual([])
  })

  it('a value is a Markdown string, not a parsed tree', async () => {
    const schema = serializeSchema(field({}))
    const check = async (body: unknown) => (await validate(schema, 'menu', { name: { de: 'A' }, body: { de: body } }, { mode: 'create' })).errors.map((i) => i.code)
    expect(await check('## Hallo')).toEqual([])
    expect(await check({ nodes: [['p', {}, 'Hallo']] })).toEqual(['TYPE'])
  })
})

describe('drafts must be a boolean', () => {
  it('a non-boolean drafts value is reported with its path', () => {
    const input = site({}, { bricks: { menu: collection({ label: 'Karte', fields: { name: f.text('Name', { max: 120 }) }, max: 20, order: 'manual', drafts: 'yes' as unknown as boolean }) } })
    expect(problemsOf(input)).toEqual(['menu: drafts must be true or false.'])
  })

  it('drafts on a single brick is refused', () => {
    const input = site({}, { bricks: { hours: { ...single({ label: 'Zeiten', fields: { note: f.text('Hinweis') } }), drafts: true } as never } })
    expect(problemsOf(input)).toEqual(['hours: drafts are only allowed for collections.'])
  })
})

describe('week tokens', () => {
  const withPrefill = (prefill: Record<string, unknown>) => site({}, {
    bricks: { lunch: single({ label: 'Mittag', fields: { weekOf: f.date('Woche'), handle: f.text('Instagram', { translate: false, max: 40 }) }, tasks: [{ id: 'w', label: 'Woche', kind: 'edit', fields: ['weekOf'], prefill: prefill as never }] }) },
  })
  // Wrong behaviour caught: a mistyped token or a token on a text field is stored as literal text, so the form starts
  // with an empty date or a date in a text; a plain text starting with @ (a handle) is refused as an unknown token.
  it.each([
    [{ weekOf: '@workWeek' }, []],
    [{ handle: '@linde' }, []],
    [{ weekOf: '@thisWeek' }, ['lunch.w.prefill.weekOf: unknown token “@thisWeek” (known: @today, @workWeek, @nextWorkWeek).']],
    [{ weekOf: 'tomorrow' }, ['lunch.w.prefill.weekOf: “Woche” is not a valid date.']],
    [{ handle: '@today' }, ['lunch.w.prefill.handle: “@today” needs a date field.']],
    [{ nope: 'x' }, ['lunch.w.prefill.nope: the field is missing.']],
  ])('prefill %j', (prefill, problems) => {
    expect(problemsOf(withPrefill(prefill))).toEqual(problems)
  })

  // Wrong behaviour caught: the week is not stored on the schema, so server, Studio and site disagree about the first day.
  it('stores the week of the main language, with firstDayOfWeek as override', () => {
    expect(serializeSchema(site({}, { languages: { de: 'en-US' } })).week).toEqual({ firstDay: 7, weekend: [6, 7] })
    expect(serializeSchema(site({}, { languages: { de: 'de-AT' }, firstDayOfWeek: 6 })).week).toEqual({ firstDay: 6, weekend: [6, 7] })
  })
})

describe('defaults in the stored form', () => {
  const stored = (fields: Fields, tasks?: unknown) => serializeSchema(site({}, { bricks: { menu: collection({ label: 'Karte', fields, max: 20, order: 'manual', tasks: tasks as never }) } })).bricks.menu!
  // Wrong behaviour caught: a plain default of a translatable field is stored as a string and fails the release check,
  // or a preset's `{ de, en }` text keeps locales the site does not have.
  it.each([
    ['a plain text is the main language', f.text('Name', { default: 'Linde' }), { de: 'Linde' }],
    ['texts per language keep the site locales', f.text('Name', { default: { de: 'Linde', en: 'Linden', fr: 'Tilleul' } }), { de: 'Linde', en: 'Linden' }],
    ['a text of other languages only is left out', f.text('Name', { default: { fr: 'Tilleul' } }), undefined],
    ['a text of the site locales without the main language is left out', f.text('Name', { default: { en: 'Linden' } }), undefined],
    ['a text that is not translated stays plain', f.text('Ort', { translate: false, default: 'Salzburg' }), 'Salzburg'],
    ['list rows store their texts per language', f.list('Tage', { itemLabel: 'Tag', max: 2, fields: { dish: f.text('Gericht') }, default: [{ _id: 'r000000001', dish: 'Suppe' }] }), [{ _id: 'r000000001', dish: { de: 'Suppe' } }]],
    ['a list with a row of other languages only is left out', f.list('Tage', { itemLabel: 'Tag', max: 2, fields: { dish: f.text('Gericht') }, default: [{ _id: 'r000000001', dish: { fr: 'Soupe' } }] }), undefined],
  ])('%s', (_name, field, expected) => {
    expect(stored({ field }).fields.field!.default).toEqual(expected)
  })

  it('stores prefilled texts the same way and keeps tokens', () => {
    const task = { id: 'add', label: 'Neu', kind: 'create', prefill: { name: { de: 'Ausgebucht', en: 'Booked out', it: 'Esaurito' }, day: '@today' } }
    expect(stored({ name: f.text('Name'), day: f.date('Tag') }, [task]).tasks![0]).toMatchObject({ prefill: { name: { de: 'Ausgebucht', en: 'Booked out' }, day: '@today' } })
  })

  // Wrong behaviour caught: a component prop's plain default was stored as written and failed the release check.
  it('stores component prop defaults the same way', () => {
    const components = defineComponents({ box: { kind: 'block', label: 'Box', describe: 'Box', props: { title: f.text('T', { optional: true, default: 'Hallo' }) } } })
    const input = site({}, { components })
    expect(serializeSchema(input).components!.box!.props.title!.default).toEqual({ de: 'Hallo' })
    expect(checkSite(input)).toEqual([])
  })
})

describe('brick describe', () => {
  // Wrong behaviour caught: a per-language describe without the main language shows an empty text in the Studio.
  it('is checked like a label', () => {
    const input = site({}, { bricks: { menu: collection({ label: 'Karte', describe: { fr: 'Carte' }, fields: { name: f.text('Name', { max: 120 }) }, max: 20, order: 'manual' }) } })
    expect(problemsOf(input)).toEqual(['menu.describe: label needs a text in the main language “de” or in English.'])
  })
})

describe('visible', () => {
  const withVisible = (visible: unknown) => site({}, {
    bricks: { menu: collection({ label: 'Karte', fields: { name: f.text('Name', { max: 120 }), until: f.date('Bis', optional), when: f.daterange('Wann', optional) }, max: 20, order: 'manual', visible: visible as never }) },
  })
  // Wrong behaviour caught: a mode or option name from before 0.4 is stored and every entry shows for ever.
  it.each([
    [{ mode: 'until', field: 'until', days: 6, deleteExpired: true }, []],
    [{ mode: 'until', field: 'when' }, []],
    [{ mode: 'active', field: 'until' }, ['menu: visible.mode must be “always” or “until”.']],
    [{ mode: 'until', field: 'name' }, ['menu: visibility needs a date or daterange field.']],
    [{ mode: 'until', field: 'until', autoRemoveExpired: true }, ['menu.visible: unknown property “autoRemoveExpired”.']],
    [{ mode: 'always', field: 'until' }, ['menu: visible: “always” takes no other options.']],
    [{ mode: 'until', field: 'until', deleteExpired: 'yes' }, ['menu: visibility: deleteExpired must be true or false.']],
  ])('%j', (visible, problems) => {
    expect(problemsOf(withVisible(visible))).toEqual(problems)
  })
})

describe('plans (weeks planned ahead)', () => {
  const week = single({ label: 'Mittag', fields: { weekOf: f.date('Woche') }, tasks: [{ id: 'w', label: 'Woche', kind: 'edit', fields: ['weekOf'], prefill: { weekOf: '@workWeek' } }] })
  const planner = (plans: { brick: string; field: string }) => site({}, {
    bricks: {
      lunch: week,
      other: collection({ label: 'Andere', fields: { name: f.text('Name', { max: 20 }) }, max: 3, order: 'manual' }),
      plan: collection({ label: 'Plan', fields: { weekOf: f.date('Woche'), note: f.text('Hinweis', { max: 20 }) }, max: 3, order: 'manual', plans: plans as never }),
    },
  })

  // Wrong behaviour caught: a plan pointing nowhere or at a field that cannot hold a week start ships and silently never counts.
  it.each([
    ['a valid plan', { brick: 'lunch', field: 'weekOf' }, []],
    ['a missing brick', { brick: 'nope', field: 'weekOf' }, ['plan: plans names the brick “nope”, which does not exist.']],
    ['a collection', { brick: 'other', field: 'weekOf' }, ['plan: plans needs a single brick, “other” is a collection.']],
    ['a non-date field', { brick: 'lunch', field: 'note' }, ['plan: plans needs a date field for the week start.']],
  ])('%s', (_name, plans, expected) => {
    expect(problemsOf(planner(plans))).toEqual(expected)
  })
})

describe('approvals (SPEC 17)', () => {
  const withTasks = (needsApproval: unknown, over: Partial<SiteInput> = {}) => site({}, {
    bricks: { menu: collection({ label: 'Karte', fields: { name: f.text('Name', { max: 120 }) }, max: 20, order: 'manual', tasks: [{ id: 'add', label: 'Gericht hinzufügen', kind: 'create', needsApproval } as never] }) },
    ...over,
  })

  it('needsApproval and agents.review survive serializeSchema', () => {
    const schema = serializeSchema(withTasks(true, { agents: { review: true, description: 'Karte' } }))
    expect(schema.bricks.menu!.tasks).toEqual([{ id: 'add', label: 'Gericht hinzufügen', kind: 'create', needsApproval: true }])
    expect(schema.agents).toEqual({ review: true })
    expect(checkSchema(schema)).toEqual([])
  })

  it('a schema without the flags has no agents key', () => {
    expect('agents' in serializeSchema(site())).toBe(false)
  })

  it('a non-boolean needsApproval is reported with its path', () => {
    expect(problemsOf(withTasks('yes'))).toEqual(['menu.add: needsApproval must be true or false.'])
  })

  it.each([['yes', ['agents.review must be true or false.']], [undefined, []]])('agents.review %j', (review, expected) => {
    const s = serializeSchema(site())
    ;(s as unknown as Record<string, unknown>).agents = { review }
    expect(checkSchema(s)).toEqual(expected)
  })

  it('an unknown agents property is refused', () => {
    const s = serializeSchema(site())
    ;(s as unknown as Record<string, unknown>).agents = { review: true, speed: 1 }
    expect(checkSchema(s)).toEqual(['agents: unknown property “speed”.'])
  })
})

describe('ref fields (SPEC 2.2)', () => {
  const withRef = (field: Record<string, unknown>) => {
    const s = base()
    node(s, 'bricks.menu.fields').side = { type: 'ref', label: 'Beilage', optional: true, ...field }
    return checkSchema(s)
  }

  // Wrong behaviour caught: a ref to a missing brick or a single brick is released, so no entry could ever be picked.
  it.each([
    ['a collection brick', { to: 'menu' }, []],
    ['an unknown brick', { to: 'nope' }, ['menu.side: to must name a collection (“nope” does not exist).']],
    ['a single brick', { to: 'contact' }, ['menu.side: to must name a collection (“contact” does not exist).']],
    ['max without multiple', { to: 'menu', max: 2 }, ['menu.side: max needs multiple.']],
    ['max 0', { to: 'menu', multiple: true, max: 0 }, ['menu.side: max must be greater than 0.']],
    ['multiple with max', { to: 'menu', multiple: true, max: 2 }, []],
  ])('ref to %s', (_name, field, expected) => {
    expect(withRef(field)).toEqual(expected)
  })
})

describe('showWhen', () => {
  it.each([
    [{ field: 'closed', not: true }, { closed: true }, false],
    [{ field: 'closed', not: true }, {}, true],
    [{ field: 'closed', is: true }, {}, false],
    [{ field: 'kind', is: 'event' }, { kind: 'event' }, true],
  ] as const)('%j with %j → %s', (showWhen, siblings, shown) => {
    expect(isShown(f.time('Von', { showWhen }), siblings)).toBe(shown)
  })
  it.each([
    [{ field: 'nope', is: true }, 'menu.from.showWhen: “nope” is not another field next to this one.'],
    [{ field: 'from', is: true }, 'menu.from.showWhen: “from” is not another field next to this one.'],
    [{ field: 'closed' }, 'menu.from.showWhen: needs `field` and one of `is` or `not`.'],
  ])('rejects %j', (showWhen, problem) => {
    const problems = problemsOf(site({ closed: f.boolean('Zu'), from: f.time('Von', { optional: true, showWhen: showWhen as never }) })); expect(problems, JSON.stringify(problems)).toContain(problem)
  })
})

describe('group and layout (display only)', () => {
  it('serializeSchema keeps them and the schema stays valid', () => {
    const input = site({ note: f.longtext('Notiz', { group: { de: 'Mehr', en: 'More' } }) }, {
      bricks: { menu: collection({ label: 'Karte', layout: 'tabs', fields: { name: f.text('Name', { group: 'Basis' }) }, max: 20, order: 'manual' }) },
    })
    const schema = serializeSchema(input)
    expect(schema.bricks.menu).toMatchObject({ layout: 'tabs', fields: { name: { group: 'Basis' } } })
    expect(checkSchema(schema)).toEqual([])
  })
  it.each([
    ['empty group', { group: '' }, 'menu.note.group: label is empty.'],
    ['blank group in every language', { group: { de: ' ', en: '' } }, 'menu.note.group: label needs a text for each language.'],
    ['group that is a number', { group: 3 }, 'menu.note.group: label must be a text or an object with one text per language.'],
  ])('rejects %s', (_name, extra, problem) => {
    const problems = problemsOf(site({ note: f.longtext('Notiz', extra as never) })); expect(problems, JSON.stringify(problems)).toContain(problem)
  })
  it('rejects an unknown layout', () => {
    const input = site({}, { bricks: { menu: collection({ label: 'Karte', layout: 'columns' as never, fields: { name: f.text('Name') }, max: 20, order: 'manual' }) } })
    expect(problemsOf(input)).toContain('menu: layout must be “sections” or “tabs”.')
  })
})
