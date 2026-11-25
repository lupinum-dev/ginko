// A dated change (D117–D121): the values of a day, the check of an entry's changes, `timeline` in the schema and
// `upcoming` in the bundle, which never carries a waiting value of a field outside `timeline.public`.
import { describe, expect, it } from 'vitest'
import { statusRules } from '@lupinum/ginko/patterns'
import {
  buildBundle, changeIssues, checkSchema, collection, dataOn, defineSite, f, serializeSchema, servedBundle, single,
  type Change, type Json, type Schema, type SiteInput,
} from '../../src/core/index.ts'

const TODAY = '2026-10-08'

const dishes = collection({
  label: 'Gerichte',
  fields: {
    name: f.text('Name', { max: 40 }),
    slug: f.slug('Adresse', { from: 'name' }),
    price: f.money('Preis', { min: 0 }),
    note: f.text('Hinweis', { max: 20, optional: true }),
    story: f.markdown('Geschichte', { profile: 'inline', optional: true }),
    photo: f.image('Foto', { optional: true }),
    servedUntil: f.date('Bis', { optional: true }),
    day: f.date('Tag', { optional: true }),
  },
  listing: { title: 'name' },
  max: 50,
  order: 'manual',
  route: { de: '/karte/[slug]' },
  showUntil: { field: 'servedUntil' },
  publishedOn: 'day',
  timeline: { public: ['price', 'story', 'photo'] },
})

const practice = single({
  label: 'Praxis',
  fields: { price: f.money('Preis'), room: f.text('Raum', { max: 20 }) },
  timeline: { public: ['price'] },
})

const site = (over: Partial<SiteInput> = {}): SiteInput => defineSite({
  site: 'shop', name: 'Shop', url: 'https://shop.example', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] },
  pages: { home: '/' },
  bricks: { dishes, practice },
  ...over,
})
const schema = (over: Partial<SiteInput> = {}): Schema => serializeSchema(site(over))

// Stored money is cents; the bundle adds the currency.
const money = (amount: number) => ({ amount })
const shown = (amount: number) => ({ amount, currency: 'EUR' })
const de = (text: string) => ({ de: text })
const dish: Record<string, Json> = { name: de('Suppe'), slug: de('suppe'), price: money(900), note: de('heiß') }

describe('dataOn: the values of a day', () => {
  const changes: Change[] = [
    { from: '2026-12-01', set: { price: money(1100) } },
    { from: '2026-11-01', set: { price: money(1000), note: null } },
  ]
  it.each([
    ['before every change', '2026-10-31', { ...dish }],
    ['on the day of the first', '2026-11-01', { name: de('Suppe'), slug: de('suppe'), price: money(1000) }],
    ['after both, in the order of their days', '2027-01-01', { name: de('Suppe'), slug: de('suppe'), price: money(1100) }],
  ])('%s', (_, day, expected) => {
    expect(dataOn(dish, changes, day)).toEqual(expected)
  })

  it('leaves the stored data as it is', () => {
    dataOn(dish, changes, '2027-01-01')
    expect(dish.note).toEqual(de('heiß'))
  })
})

describe('changeIssues: the check of an entry\'s changes', () => {
  const check = (changes: unknown, s = schema(), brick = 'dishes', data = dish) => changeIssues(s, brick, data, changes)
  const codes = async (changes: unknown, s?: Schema, brick?: string) => (await check(changes, s, brick)).map((i) => [i.change, i.path, i.code])

  it('passes a change of a field a change may set, with a value the field takes', async () => {
    expect(await check([{ from: '2026-11-01', set: { price: money(1000), note: null } }, { from: '2026-12-01', set: { price: money(1100) } }])).toEqual([])
  })

  it.each([
    ['not a list', { from: '2026-11-01', set: {} }, [[-1, '$changes', 'CHANGE']]],
    ['not an object', ['x'], [[0, '$changes.0', 'CHANGE']]],
    ['no day', [{ set: { price: money(1) } }], [[0, '$changes.0.from', 'CHANGE']]],
    ['a day that does not exist', [{ from: '2026-02-30', set: { price: money(1) } }], [[0, '$changes.0.from', 'CHANGE']]],
    ['an empty set', [{ from: '2026-11-01', set: {} }], [[0, '$changes.0.set', 'CHANGE']]],
    ['another key', [{ from: '2026-11-01', set: { price: money(1) }, why: 'x' }], [[0, '$changes.0.why', 'CHANGE']]],
    ['an end (not built yet)', [{ from: '2026-11-01', until: '2026-12-01', set: { price: money(1) } }], [[0, '$changes.0.until', 'NOT_YET']]],
    ['yearly and name (not built yet)', [{ from: '2026-11-01', yearly: true, name: 'Winter', set: { price: money(1) } }], [[0, '$changes.0.yearly', 'NOT_YET'], [0, '$changes.0.name', 'NOT_YET']]],
    ['an unknown field', [{ from: '2026-11-01', set: { colour: 'red' } }], [[0, 'colour', 'UNKNOWN_FIELD']]],
    ['the slug', [{ from: '2026-11-01', set: { slug: de('neu') } }], [[0, 'slug', 'CHANGE']]],
    ['the field showUntil reads', [{ from: '2026-11-01', set: { servedUntil: '2026-12-01' } }], [[0, 'servedUntil', 'CHANGE']]],
    ['the field publishedOn reads', [{ from: '2026-11-01', set: { day: '2026-12-01' } }], [[0, 'day', 'CHANGE']]],
    ['one field twice on one day', [{ from: '2026-11-01', set: { price: money(1) } }, { from: '2026-11-01', set: { price: money(2) } }], [[1, 'price', 'CHANGE']]],
    ['a value the field refuses', [{ from: '2026-11-01', set: { note: de('viel zu lang für dieses Feld') } }], [[0, 'note.de', 'TOO_LONG']]],
    ['a required field cleared', [{ from: '2026-11-01', set: { price: null } }], [[0, 'price', 'REQUIRED']]],
  ])('refuses %s', async (_, changes, expected) => {
    expect(await codes(changes)).toEqual(expected)
  })

  it('names the day of a change in the problem of its value', async () => {
    const [issue] = await check([{ from: '2026-11-01', set: { price: null } }])
    expect(issue?.message).toBe('Änderung ab 2026-11-01: „Preis“ fehlt.')
  })

  it('a stored field that is already broken is not the change\'s problem', async () => {
    expect(await check([{ from: '2026-11-01', set: { price: money(1) } }], schema(), 'dishes', { ...dish, note: de('viel zu lang für dieses Feld') })).toEqual([])
  })

  it('a text may be dated on a site with one language, not yet on a site with several', async () => {
    const story = [{ from: '2026-11-01', set: { note: de('kalt') } }]
    expect(await codes(story)).toEqual([])
    const several = schema({ locales: ['de', 'en'], bricks: { dishes: { ...dishes, untranslated: 'fallback', route: { de: '/karte/[slug]', en: '/menu/[slug]' }, timeline: { public: ['price'] } }, practice } })
    expect(await codes([{ from: '2026-11-01', set: { note: { de: 'kalt', en: 'cold' } } }], several)).toEqual([[0, 'note', 'NOT_YET']])
    // An image has a description per language.
    expect(await codes([{ from: '2026-11-01', set: { photo: { file: 'f1', alt: { de: 'x' } } } }], several)).toEqual([[0, 'photo', 'NOT_YET']])
    expect(await codes([{ from: '2026-11-01', set: { price: money(1) } }], several)).toEqual([])
  })
})

describe('timeline in the schema', () => {
  const problems = (timeline: unknown, over: Partial<SiteInput> = {}) => {
    const s = schema(over)
    ;(s.bricks.dishes as { timeline?: unknown }).timeline = timeline
    return checkSchema(s, statusRules).filter((p) => p.includes('timeline'))
  }
  it.each([
    ['a field a change may set', { public: ['price'] }, []],
    ['not an object', ['price'], ["dishes: timeline must be an object { public: [fields] }, such as `{ public: ['price'] }`."]],
    ['an empty list', { public: [] }, ["dishes.timeline.public must list field names, such as `['price']`."]],
    ['another key', { public: ['price'], until: ['price'] }, ['dishes.timeline: unknown property “until”.']],
    ['an unknown field', { public: ['colour'] }, ['dishes.timeline.public: “colour” is not a field of the brick.']],
    ['the slug', { public: ['slug'] }, ['dishes.timeline.public: “slug” decides when or where an entry shows, so it cannot change on a day.']],
    ['a field twice', { public: ['price', 'price'] }, ['dishes.timeline.public names a field twice.']],
  ])('%s', (_, timeline, expected) => {
    expect(problems(timeline)).toEqual(expected)
  })
})

describe('when on a task (D123)', () => {
  const problems = (tasks: unknown[]) => {
    const s = schema()
    ;(s.bricks.dishes as { tasks?: unknown }).tasks = tasks
    return checkSchema(s, statusRules).filter((p) => p.includes('when'))
  }
  const edit = (fields: string[], when: unknown) => ({ id: 'price', label: 'Preis', kind: 'edit', pick: true, fields, when })

  it.each([
    ['a field a change may set', edit(['price', 'note'], { from: 'ask' }), []],
    ['now', edit(['slug'], { from: 'now' }), []],
    ['another value', edit(['price'], { from: 'later' }), ["dishes.price.when must be { from: 'now' } or { from: 'ask' }."]],
    ['another key', edit(['price'], { from: 'ask', until: 'ask' }), ["dishes.price.when must be { from: 'now' } or { from: 'ask' }."]],
    ['a create task', { id: 'add', label: 'Neu', kind: 'create', when: { from: 'ask' } }, ['dishes.add: when is only for an edit task.']],
    ['the slug', edit(['price', 'slug'], { from: 'ask' }), ['dishes.price.when: “slug” decides when or where an entry shows, so it cannot start on a day. Leave it out of the task or drop when.']],
  ])('in the stored model: %s', (_, task, expected) => {
    expect(problems([task])).toEqual(expected)
  })

  it('refuses a text field on a site with several languages', () => {
    const s = schema({ locales: ['de', 'en'], bricks: { dishes: { ...dishes, untranslated: 'fallback', route: { de: '/karte/[slug]', en: '/menu/[slug]' } }, practice } })
    ;(s.bricks.dishes as { tasks?: unknown }).tasks = [edit(['price', 'note'], { from: 'ask' })]
    expect(checkSchema(s, statusRules).filter((p) => p.includes('when'))).toEqual(['dishes.price.when: “note” has text per language, and a translated value in a change is not built yet.'])
  })
})

describe('upcoming in the bundle', () => {
  const files = (id: string) => (id === 'f2' ? { url: 'https://cdn.example/f2.jpg', name: 'f2.jpg', size: 1, width: 4, height: 3 } : undefined)
  const changes: Change[] = [
    { from: '2026-12-01', set: { price: money(1100), note: de('geheim') } },
    { from: '2026-11-01', set: { note: de('nur intern') } },
    { from: '2026-11-15', set: { story: de('Neu mit **Kräutern**'), photo: { file: 'f2', alt: { de: 'Teller' } } } },
    { from: '2026-10-08', set: { price: money(950) } },
  ]
  const input = (s = schema()) => ({
    schema: s, requestedLocale: 'de', files, schemaRev: 1, contentRev: 1, generatedAt: '2026-10-08T10:00:00Z', today: TODAY,
    entries: {
      dishes: [{ id: 'd1', data: dish, changes }],
      practice: [{ id: 'practice', data: { price: money(9000), room: de('A') }, changes: [{ from: '2027-01-01', set: { price: money(9500), room: de('B') } }] }],
    },
  })

  it('carries the public fields of the changes still ahead, in the order of their days, resolved like data', async () => {
    const bundle = await servedBundle(input())
    const [item] = bundle.bricks.dishes!.kind === 'collection' ? bundle.bricks.dishes!.items : []
    expect(item?.data.price).toEqual(shown(900))
    expect(item?.upcoming).toEqual([
      { from: '2026-11-15', data: { story: expect.objectContaining({ nodes: expect.any(Array) }), photo: { url: 'https://cdn.example/f2.jpg', alt: 'Teller', width: 4, height: 3 } } },
      { from: '2026-12-01', data: { price: shown(1100) } },
    ])
    expect(JSON.stringify(item?.upcoming?.[0]?.data.story)).toContain('"strong",{},"Kräutern"')
    expect(bundle.bricks.practice).toMatchObject({ data: { price: shown(9000), room: 'A' }, upcoming: [{ from: '2027-01-01', data: { price: shown(9500) } }] })
  })

  it('never carries a waiting value of a field outside timeline.public', () => {
    const text = JSON.stringify(buildBundle(input()))
    for (const secret of ['geheim', 'nur intern', '"B"']) expect(text).not.toContain(secret)
  })

  it('carries nothing ahead for a brick without timeline', () => {
    const s = schema()
    delete s.bricks.dishes!.timeline
    delete s.bricks.practice!.timeline
    const bundle = buildBundle(input(s))
    expect(JSON.stringify(bundle)).not.toContain('upcoming')
  })
})
