// Facts (`facts` in the site config, `:fact{name="…"}` in texts): what a fact says, where the config is wrong, and
// that search and the Markdown twin show the value instead of a gap.
import { describe, expect, it } from 'vitest'
import {
  bundleFactResolver, checkSchema, checkSite, collection, defineSite, entryMarkdown, f, factCopies, factNamesIn, factText, factValues, parseMarkdown, serializeSchema, single,
  type Bundle, type FactContext, type SiteInput,
} from '../../src/core/index.ts'
import { searchSections } from '../../src/core/search-sections.ts'

const practice = single({
  label: 'Praxis',
  fields: {
    price: f.money('Preis pro Sitzung'),
    nextPrice: f.money('Neuer Preis', { optional: true }),
    priceFrom: f.date('Neuer Preis gilt ab', { optional: true }),
    validUntil: f.date('Preis gültig bis', { optional: true }),
    minutes: f.number('Dauer', { min: 15, max: 240, step: 5, unit: 'Minuten' }),
    days: f.choices('Tage', { options: [{ value: 'tue', label: 'Dienstag' }, { value: 'wed', label: 'Mittwoch' }, { value: 'thu', label: 'Donnerstag' }] }),
    times: f.list('Uhrzeiten', { itemLabel: 'Uhrzeit', max: 8, fields: { time: f.time('Beginn') } }),
    email: f.text('E-Mail', { max: 120, format: 'email' }),
    room: f.choice('Raum', { options: [{ value: 'a', label: 'Raum A' }] }),
    note: f.markdown('Hinweis', { profile: 'inline', optional: true }),
    rows: f.list('Zeilen', { itemLabel: 'Zeile', max: 4, fields: { a: f.text('A', { max: 10 }), b: f.text('B', { max: 10 }) } }),
  },
  planned: { field: 'price', next: 'nextPrice', from: 'priceFrom' },
})

const site = (over: Partial<SiteInput> = {}): SiteInput => defineSite({
  site: 'praxis', name: 'Praxis', url: 'https://praxis.example', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: '/' },
  bricks: {
    practice,
    docs: collection({ label: 'Seiten', fields: { title: f.text('Titel', { max: 120 }), body: f.markdown('Text', { profile: 'page' }) }, max: 20, order: 'manual', route: { de: '/[slug]' } }),
  },
  facts: ['practice.price', 'practice.minutes', 'practice.days', 'practice.times', 'practice.email', 'practice.validUntil'],
  ...over,
})

const data = {
  price: { amount: 9800, currency: 'EUR' }, nextPrice: { amount: 10550, currency: 'EUR' }, priceFrom: '2027-01-01', validUntil: '2026-12-31',
  minutes: 60, days: ['wed', 'tue'], times: [{ _id: 'r1', time: '11:00' }, { _id: 'r2', time: '12:15' }, { _id: 'r3', time: '13:30' }],
  email: 'praxis@example.test', room: 'a',
}
const ctx = (today?: string): FactContext => ({
  bricks: serializeSchema(site()).bricks, data: { practice: { kind: 'single', data } }, locale: 'de', mainLocale: 'de', language: 'de-AT', ...(today ? { today } : {}),
})

describe('factText', () => {
  // Wrong behaviour caught: a fact that shows the raw value ({amount: 9800}, ["wed","tue"]) or the wrong price on a day.
  it.each([
    ['practice.price', '2026-12-31', '€ 98'],
    ['practice.price', '2027-01-01', '€ 105,50'],
    ['practice.price', undefined, '€ 98'],
    ['practice.minutes', undefined, '60 Minuten'],
    ['practice.days', undefined, 'Dienstag und Mittwoch'],
    ['practice.times', undefined, '11:00, 12:15 und 13:30'],
    ['practice.email', undefined, 'praxis@example.test'],
    ['practice.validUntil', undefined, '31. Dezember 2026'],
    ['practice.room', undefined, 'Raum A'],
    ['practice.missing', undefined, undefined],
    ['docs.title', undefined, undefined],
  ])('%s on %s → %s', (path, today, expected) => {
    expect(factText(path, ctx(today))?.replace(/ /g, ' ')).toBe(expected)
  })

  // Wrong behaviour caught (the second and third): Intl threw, and one unreadable value broke the whole page.
  it.each([
    ['an empty value', 'practice.price', { price: undefined }],
    ['a date it cannot read', 'practice.validUntil', { validUntil: '31.12.2026' }],
    ['a language it does not know', 'practice.price', {}, 'not a language'],
  ])('is undefined for %s', (_, path, change, language = 'de-AT') => {
    expect(factText(path, { ...ctx(), language, data: { practice: { kind: 'single', data: { ...data, ...change } } } })).toBeUndefined()
  })
})

describe('facts in the site config', () => {
  it('adds the fact component with the facts as choices, labelled like their fields', () => {
    const fact = serializeSchema(site()).components!.fact!
    expect(fact.kind).toBe('inline')
    const name = fact.props.name
    if (name?.type !== 'choice') throw new Error('name is a choice')
    expect(name.options.slice(0, 2)).toEqual([
      { value: 'practice.price', label: 'Preis pro Sitzung' },
      { value: 'practice.minutes', label: 'Dauer' },
    ])
  })

  it('leaves a site without facts without the component', () => {
    expect(serializeSchema(site({ facts: undefined })).components).toBeUndefined()
  })

  // Wrong behaviour caught: a fact path that silently shows nothing on every page.
  it.each([
    ['practice', 'must be “brick.field”'],
    ['menu.price', 'not a brick of the site'],
    ['docs.title', 'only fields of single bricks'],
    ['practice.nope', 'not a field of “practice”'],
    ['practice.note', 'a markdown field'],
    ['practice.rows', 'a list field'],
  ])('reports %s', (path, problem) => {
    expect(checkSite(site({ facts: [path] })).join('\n')).toContain(problem)
  })

  it('reports a retired field', () => {
    expect(checkSite(site({ retired: { 'practice.minutes': { drop: true } } })).join('\n')).toContain('“practice.minutes” is retired')
  })

  // Wrong behaviour caught: turning on facts made every text strict, so a site without components of its own could no
  // longer save texts with `::callout` or other tags it used before.
  it.each([
    ['without components of its own, texts stay open', undefined, []],
    ['with components of its own, texts stay strict', { note: { kind: 'block' as const, label: 'Hinweis', describe: 'Ein Hinweis', props: {} } }, ['Komponente „callout“ gibt es nicht.']],
  ])('%s', async (_, components, problems) => {
    const schema = serializeSchema(site({ components }))
    const text = '::callout\nAchtung\n::\n\nPreis: :fact{name="practice.price"}'
    expect((await parseMarkdown(text, { profile: 'page', components: schema.components })).problems).toEqual(problems)
    expect((await parseMarkdown(':fact{name="practice.nope"}', { profile: 'page', components: schema.components })).problems).not.toEqual([])
  })

  it('reports a site component named fact next to facts', () => {
    const components = { fact: { kind: 'inline' as const, label: 'Fakt', describe: 'Eigener', props: {} } }
    expect(checkSite(site({ components })).join('\n')).toContain('“fact” is the component of facts')
  })
})

describe('facts in search and in the Markdown twin', () => {
  const schema = serializeSchema(site())
  async function bundleWith(text: string): Promise<Bundle> {
    const parsed = await parseMarkdown(text, { profile: 'page', components: schema.components })
    return {
      format: 3, site: 'praxis', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '2026-10-23T00:00:00Z',
      bricks: {
        practice: { kind: 'single', data, fallback: [] },
        docs: { kind: 'collection', items: [{ id: 'd1', order: 1, data: { title: 'Kosten', body: parsed.value }, urls: { de: '/kosten' }, updatedAt: '2026-10-23T00:00:00Z' }] },
      },
    } as unknown as Bundle
  }
  const text = 'Eine Sitzung dauert :fact{name="practice.minutes"} und kostet :fact{name="practice.price"}.'

  // Wrong behaviour caught: "dauert und kostet ." in search excerpts, and no hit for the price.
  it('puts the value into the search record', async () => {
    const [record] = searchSections(await bundleWith(text), { schema, language: 'de-AT', today: '2027-02-01' })
    expect(record!.text.replace(/ /g, ' ')).toBe('Eine Sitzung dauert 60 Minuten und kostet € 105,50.')
  })

  it('writes the value into the Markdown twin', async () => {
    const bundle = await bundleWith(text)
    const docs = bundle.bricks.docs
    if (docs?.kind !== 'collection') throw new Error('docs is a collection')
    const item = docs.items[0]!
    const markdown = await entryMarkdown(item, 'docs', { schema, resolve: bundleFactResolver(bundle, schema.bricks, 'de-AT', '2026-11-01') })
    expect(markdown.replace(/ /g, ' ')).toContain('Eine Sitzung dauert 60 Minuten und kostet € 98.')
  })
})

describe('facts for editors and agents', () => {
  // Wrong behaviour caught: the platform refused the schema of a site with facts and no components of its own
  // (the generated component's `open` was an unknown property), and dropped the site's language tags.
  it('stores the language tags and passes the platform check', () => {
    const schema = serializeSchema(site({ languages: { de: 'de-AT' } }))
    expect(schema.languages).toEqual({ de: 'de-AT' })
    expect(checkSchema(schema)).not.toContainEqual(expect.stringMatching(/open|languages/))
    expect(checkSchema({ ...schema, languages: { de: 'not a tag', en: 'en-US' } }).join('\n')).toMatch(/languages\.de: invalid language[\s\S]*locale “en” is not in locales/)
  })

  it.each([
    ['Preis :fact{name="practice.price"}, Dauer :fact{name=\'practice.minutes\'} und :fact{name=practice.price}', ['practice.price', 'practice.minutes']],
    ['Ein :badge[neu]{color="success"} ohne Angaben', []],
  ])('factNamesIn(%j)', (text, names) => {
    expect(factNamesIn(text)).toEqual(names)
  })

  // Wrong behaviour caught: the Studio showed "98 €" while the de-AT site shows "€ 98", or no planned change.
  it('formats every fact as the site does, with the planned change and the forms of a copy', () => {
    const schema = serializeSchema(site({ languages: { de: 'de-AT' } }))
    const values = factValues(schema, { practice: data }, 'de', '2026-12-31')
    const byName = Object.fromEntries(values.map((v) => [v.name, v]))
    expect(values.map((v) => v.name)).toEqual(['practice.price', 'practice.minutes', 'practice.days', 'practice.times', 'practice.email', 'practice.validUntil'])
    expect({ ...byName['practice.price'], copies: undefined }).toEqual({ name: 'practice.price', brick: 'practice', field: 'price', text: '€\u00a098', next: { text: '€\u00a0105,50', from: '2027-01-01' }, copies: undefined })
    expect(byName['practice.price']!.copies).toEqual(expect.arrayContaining(['98 €', '€ 98', '98 Euro', '98,00 €', '98 EUR']))
    expect(byName['practice.minutes']!.copies).toEqual(['60 Minuten'])
    expect(byName['practice.validUntil']!.copies).toEqual(['31. Dezember 2026', '31.12.2026'])
    expect(byName['practice.email']!.copies).toEqual(['praxis@example.test'])
    // On the day of the change the new price is shown and nothing is planned any more.
    expect(factValues(schema, { practice: data }, 'de', '2027-01-01')[0]).toMatchObject({ text: '€\u00a0105,50' })
    expect(factValues(schema, { practice: data }, 'de', '2027-01-01')[0]!.next).toBeUndefined()
    expect(factValues(schema, {}, 'de')[0]).toEqual({ name: 'practice.price', brick: 'practice', field: 'price', copies: [] })
  })

  // Wrong behaviour caught: a copied price stays in a text after the price changes, or an ordinary number is flagged.
  it('finds copies of fact values in a text, standing on their own', () => {
    const values = factValues(serializeSchema(site()), { practice: data }, 'de', '2026-12-31')
    const text = 'Eine Sitzung kostet 98 € und dauert 60 Minuten, an Dienstag und Mittwoch. 198 € kostet das Paket. Mail: praxis@example.test'
    expect(factCopies(text, values).map((c) => [c.name, c.text, text.slice(c.from, c.to)])).toEqual([
      ['practice.price', '98 €', '98 €'],
      ['practice.minutes', '60 Minuten', '60 Minuten'],
      ['practice.days', 'Dienstag und Mittwoch', 'Dienstag und Mittwoch'],
      ['practice.email', 'praxis@example.test', 'praxis@example.test'],
    ])
  })
})

