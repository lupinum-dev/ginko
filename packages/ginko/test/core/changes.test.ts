// A dated change (D117–D121): the values of a day, the check of an entry's changes, `timeline` in the schema and
// `upcoming` in the bundle, which never carries a waiting value of a field outside `timeline.public`.
import { describe, expect, it } from 'vitest'
import { statusRules } from '@lupinum/ginko/patterns'
import {
  buildBundle, changeIssues, checkSchema, collection, dataOn, defineSite, f, serializeSchema, servedBundle, single,
  type Change, type Json, type Schema, type SiteInput,
} from '../../src/core/index.ts'
import * as bothHomes from '../fixtures/both-homes.ts'

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
    ['yearly and name (not built yet)', [{ from: '2026-11-01', yearly: true, name: 'Winter', set: { price: money(1) } }], [[0, '$changes.0.yearly', 'NOT_YET'], [0, '$changes.0.name', 'NOT_YET']]],
    ['an unknown field', [{ from: '2026-11-01', set: { colour: 'red' } }], [[0, 'colour', 'UNKNOWN_FIELD']]],
    ['the slug', [{ from: '2026-11-01', set: { slug: de('neu') } }], [[0, 'slug', 'CHANGE']]],
    ['the field showUntil reads', [{ from: '2026-11-01', set: { servedUntil: '2026-12-01' } }], [[0, 'servedUntil', 'CHANGE']]],
    ['the field publishedOn reads', [{ from: '2026-11-01', set: { day: '2026-12-01' } }], [[0, 'day', 'CHANGE']]],
    // Wrong behaviour caught: two changes of one day pass, and the platform merges them into one row without a word.
    ['two changes of one day', [{ from: '2026-11-01', set: { price: money(1) } }, { from: '2026-11-01', set: { note: de('kalt') } }], [[1, '$changes.1.from', 'CHANGE']]],
    ['a value the field refuses', [{ from: '2026-11-01', set: { note: de('viel zu lang für dieses Feld') } }], [[0, 'note.de', 'TOO_LONG']]],
    ['a required field cleared', [{ from: '2026-11-01', set: { price: null } }], [[0, 'price', 'REQUIRED']]],
  ])('refuses %s', async (_, changes, expected) => {
    expect(await codes(changes)).toEqual(expected)
  })

  // Wrong behaviour caught: the check looked only at the change's own fields, so a change that shows a required field
  // (showWhen) passed with it empty.
  describe('the whole entry before and after each day', () => {
    const offer = collection({
      label: 'Angebote', listing: { title: 'name' }, max: 20, order: 'manual',
      fields: {
        name: f.text('Name', { max: 40, translate: false }),
        pricing: f.choice('Preisart', { options: [{ value: 'fixed', label: 'Fest' }, { value: 'onRequest', label: 'Auf Anfrage' }] }),
        amount: f.money('Betrag', { showWhen: { field: 'pricing', is: 'fixed' } }),
      },
    })
    const offers = schema({ bricks: { dishes, practice, offer } })
    const onRequest: Record<string, Json> = { name: 'Kurs', pricing: 'onRequest' }
    it.each([
      ['a change that shows a required field left empty', [{ from: '2026-11-01', set: { pricing: 'fixed' } }], [[0, 'amount', 'REQUIRED']]],
      ['one change that shows a field and fills it', [{ from: '2026-11-01', set: { pricing: 'fixed', amount: money(2500) } }], []],
      ['the field filled only on a later day', [{ from: '2026-11-01', set: { pricing: 'fixed' } }, { from: '2026-12-01', set: { amount: money(2500) } }], [[0, 'amount', 'REQUIRED']]],
    ])('%s', async (_, changes, expected) => {
      expect((await changeIssues(offers, 'offer', onRequest, changes)).map((i) => [i.change, i.path, i.code])).toEqual(expected)
    })
  })

  // Round F, the table: a day's changes are checked like a save of their fields on that day, plus what that day newly
  // breaks elsewhere. Wrong behaviour caught: rules across fields (times in order, a week start) are only warnings in a
  // release check, so an end before its start passed; and a problem the entry already had hid a new one of the same
  // field and code (a stored title too long, a change with another too long title).
  describe('the table of a day\'s check', () => {
    const notice = single({
      label: 'Aushang',
      fields: {
        title: f.text('Titel', { max: 10, translate: false }),
        price: f.money('Preis'),
        showNote: f.boolean('Hinweis zeigen'),
        note: f.text('Hinweis', { max: 40, translate: false, showWhen: { field: 'showNote', is: true } }),
        start: f.time('Beginn'),
        end: f.time('Ende', { after: 'start' }),
        weekOf: f.date('Woche'),
      },
      tasks: [{ id: 'week', label: 'Woche', kind: 'edit', fields: ['weekOf'], prefill: { weekOf: '@workWeek' } }],
    })
    const notices = schema({ bricks: { dishes, practice, notice } })
    const base: Record<string, Json> = { title: 'Kurz', price: money(100), showNote: false, start: '10:00', end: '11:30', weekOf: '2026-10-05' }
    const long = { ...base, title: 'Ein viel zu langer Titel' }
    const day1 = '2026-11-01'
    const day2 = '2026-12-01'
    it.each([
      ['1 a change that shows a required field left empty', base, [{ from: day1, set: { showNote: true } }], [[0, day1, 'note', 'REQUIRED']]],
      ['2 an end before its start', base, [{ from: day1, set: { end: '09:00' } }], [[0, day1, 'end', 'TIME_ORDER']]],
      ['3 a start after its end', base, [{ from: day1, set: { start: '12:00' } }], [[0, day1, 'end', 'TIME_ORDER']]],
      ['4 another field of an entry with a stored problem', long, [{ from: day1, set: { price: money(200) } }], []],
      ['5 the stored problem\'s field with another wrong value', long, [{ from: day1, set: { title: 'Noch ein zu langer Titel' } }], [[0, day1, 'title', 'TOO_LONG']]],
      ['6 a required field filled, then cleared on a later day', { ...base, showNote: true }, [{ from: day1, set: { note: 'x' } }, { from: day2, set: { note: null } }], [[1, day2, 'note', 'REQUIRED']]],
      ['7 one change that shows a field and fills it', base, [{ from: day1, set: { showNote: true, note: 'x' } }], []],
      ['10 a week that does not start on the site\'s first day', base, [{ from: day1, set: { weekOf: '2026-10-07' } }], [[0, day1, 'weekOf', 'NOT_WEEK_START']]],
    ])('%s', async (_, data, changes, expected) => {
      expect((await changeIssues(notices, 'notice', data, changes)).map((i) => [i.change, i.from, i.path, i.code])).toEqual(expected)
    })
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

const WHEN_FORMS = "dishes.price.when must be { from: 'now' }, { from: 'ask' }, { from: 'ask', until: 'ask' } or { from: '@today', until: '@today' }."

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
    ['another value', edit(['price'], { from: 'later' }), [WHEN_FORMS]],
    ['another key', edit(['price'], { from: 'ask', why: 'x' }), [WHEN_FORMS]],
    ['a create task', { id: 'add', label: 'Neu', kind: 'create', when: { from: 'ask' } }, ['dishes.add: when is only for an edit task.']],
    ['the slug', edit(['price', 'slug'], { from: 'ask' }), ['dishes.price.when: “slug” decides when or where an entry shows, so it cannot start on a day. Leave it out of the task or drop when.']],
  ])('in the stored model: %s', (_, task, expected) => {
    expect(problems([task])).toEqual(expected)
  })

  it('refuses a text field on a site with several languages', () => {
    const s = schema({ locales: ['de', 'en'], bricks: { dishes: { ...dishes, untranslated: 'fallback', route: { de: '/karte/[slug]', en: '/menu/[slug]' } }, practice } })
    ;(s.bricks.dishes as { tasks?: unknown }).tasks = [edit(['price', 'note'], { from: 'ask' })]
    expect(checkSchema(s, statusRules).filter((p) => p.includes('when'))).toEqual(['dishes.price.when: “note” has text per language. A change from a day is not possible for such a field yet.'])
  })

  // Slice 3, task keys. Wrong behaviour caught: a task that asks both days, or one for today only, is refused; or `until`
  // passes with `from: 'now'` (a value "at once, for good" that also ends), or a today-only task without its end.
  it.each([
    ['both days asked', edit(['price'], { from: 'ask', until: 'ask' }), []],
    ['today only', edit(['price'], { from: '@today', until: '@today' }), []],
    ['an end with now', edit(['price'], { from: 'now', until: 'ask' }), ["dishes.price.when: until needs from: 'ask' or '@today'. With from: 'now' the values hold at once, for good."]],
    ['today without its end', edit(['price'], { from: '@today' }), [WHEN_FORMS]],
    ['today with an asked end', edit(['price'], { from: '@today', until: 'ask' }), [WHEN_FORMS]],
    ['the slug with an end', edit(['slug'], { from: 'ask', until: 'ask' }), ['dishes.price.when: “slug” decides when or where an entry shows, so it cannot start on a day. Leave it out of the task or drop when.']],
  ])('in the stored model, with an end: %s', (_, task, expected) => {
    expect(problems([task])).toEqual(expected)
  })
})

describe('set on a task (slice 3)', () => {
  const problems = (tasks: unknown[]) => {
    const s = schema()
    ;(s.bricks.dishes as { tasks?: unknown }).tasks = tasks
    return checkSchema(s, statusRules).filter((p) => p.includes('.set') || p.includes(': set'))
  }
  const today = (fields: string[], set: unknown) => ({ id: 'off', label: 'Heute aus', kind: 'edit', pick: true, fields, when: { from: '@today', until: '@today' }, set })

  // Wrong behaviour caught: a fixed value of a task names a field the brick lacks, a field the form also asks for (two
  // values for one field), a field a change may not set, a value the field refuses, or sits on a create task.
  it.each([
    ['a field with a value it takes', today([], { note: de('Heute aus') }), []],
    ['set beside asked fields', today(['price'], { note: de('Heute aus') }), []],
    ['a field the brick lacks', today([], { colour: 'red' }), ['dishes.off.set: “colour” is not a field of this brick.']],
    ['a field the form also asks for', today(['note'], { note: de('x') }), ['dishes.off.set: “note” is in the task\'s fields too. A field is either asked or set.']],
    ['a field a change may not set', today([], { servedUntil: '2026-12-01' }), ['dishes.off.set: “servedUntil” decides when or where an entry shows, so it cannot start on a day.']],
    ['a value the field refuses', today([], { note: de('viel zu lang für dieses Feld') }), [expect.stringMatching(/^dishes\.off\.set\.note(\.de)?: /)]],
    ['a create task', { id: 'add', label: 'Neu', kind: 'create', set: { note: de('x') } }, ['dishes.add: set is only for an edit task.']],
  ])('%s', (_, task, expected) => {
    expect(problems([task])).toEqual(expected)
  })
})

// Slice 3, the model: a change with `until` lies over the normal value from the first minute of `from` to the last
// minute of `until` and is never written into the entry.
describe('dataOn with exceptions', () => {
  const offer: Change = { from: '2026-10-20', until: '2026-12-31', set: { price: money(990) } }
  // Wrong behaviour caught: an exception holds a day too long or too short, an overlap shows the earlier start, a new
  // normal price inside the offer wins over it (or is lost after it), a cleared value comes back while it holds.
  it.each([
    ['the day before', [offer], '2026-10-19', 900],
    ['its first day', [offer], '2026-10-20', 990],
    ['its last day', [offer], '2026-12-31', 990],
    ['the day after', [offer], '2027-01-01', 900],
    ['a later start wins where both hold', [offer, { from: '2026-12-24', until: '2027-01-02', set: { price: money(790) } }], '2026-12-25', 790],
    ['written in the other order', [{ from: '2026-12-24', until: '2027-01-02', set: { price: money(790) } }, offer], '2026-12-25', 790],
    ['a normal price inside it waits while it holds', [offer, { from: '2026-11-01', set: { price: money(1000) } }], '2026-11-01', 990],
    ['and shows once it ends', [offer, { from: '2026-11-01', set: { price: money(1000) } }], '2027-01-01', 1000],
  ])('%s', (_, changes, day, amount) => {
    expect(dataOn(dish, changes, day).price).toEqual(money(amount))
  })

  it('an exception that clears a field hides it only while it holds', () => {
    const changes: Change[] = [{ from: '2026-11-01', until: '2026-11-01', set: { note: null } }]
    expect([dataOn(dish, changes, '2026-11-01').note, dataOn(dish, changes, '2026-11-02').note]).toEqual([undefined, de('heiß')])
  })

  // Number 1, the core's own reading of the table both homes are tested against.
  it.each(bothHomes.days)('the table of both homes on %s', (day, amount, onMenu) => {
    expect(dataOn(bothHomes.stored, bothHomes.changes, day)).toEqual({ price: money(amount), onMenu })
  })
})

describe('changeIssues with exceptions', () => {
  const codes = async (changes: unknown, data = dish) => (await changeIssues(schema(), 'dishes', data, changes)).map((i) => [i.change, i.path, i.code])
  // Wrong behaviour caught: an end that is no day, or before the start, passes; two exceptions with one start set one
  // field (which wins?); an exception beside a normal change of the same day, or two exceptions of one start for other
  // fields, are refused although the platform keeps them apart.
  it.each([
    ['an exception', [{ from: '2026-11-01', until: '2026-12-31', set: { price: money(990) } }], []],
    ['one day only', [{ from: '2026-11-01', until: '2026-11-01', set: { price: money(990) } }], []],
    ['an end that is no day', [{ from: '2026-11-01', until: 'Silvester', set: { price: money(990) } }], [[0, '$changes.0.until', 'CHANGE']]],
    ['an end before its start', [{ from: '2026-11-01', until: '2026-10-31', set: { price: money(990) } }], [[0, '$changes.0.until', 'CHANGE']]],
    ['two exceptions of one start for one field', [{ from: '2026-11-01', until: '2026-11-30', set: { price: money(990) } }, { from: '2026-11-01', until: '2026-12-31', set: { price: money(890) } }], [[1, '$changes.1.from', 'CHANGE']]],
    ['two exceptions of one start for other fields', [{ from: '2026-11-01', until: '2026-11-30', set: { price: money(990) } }, { from: '2026-11-01', until: '2026-12-31', set: { note: de('Aktion') } }], []],
    ['an exception and a normal change of one day', [{ from: '2026-11-01', set: { price: money(1000) } }, { from: '2026-11-01', until: '2026-11-30', set: { price: money(990) } }], []],
    ['still not yearly', [{ from: '2026-11-01', until: '2026-11-30', yearly: true, set: { price: money(990) } }], [[0, '$changes.0.yearly', 'NOT_YET']]],
    ['an exception that clears a required field', [{ from: '2026-11-01', until: '2026-11-30', set: { price: null } }], [[0, 'price', 'REQUIRED']]],
  ])('%s', async (_, changes, expected) => {
    expect(await codes(changes)).toEqual(expected)
  })

  it('a problem of an exception is named with its first day', async () => {
    const [issue] = await changeIssues(schema(), 'dishes', dish, [{ from: '2026-11-01', until: '2026-11-30', set: { price: null } }])
    expect([issue?.from, issue?.message]).toEqual(['2026-11-01', 'Änderung ab 2026-11-01: „Preis“ fehlt.'])
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

  // Wrong behaviour caught: a page announces a new price for a day after the dish is taken off the menu.
  it('leaves out a change whose day comes after the entry\'s last shown day', () => {
    const ending = { ...input(), entries: { dishes: [{ id: 'd1', data: { ...dish, servedUntil: '2026-11-20' }, changes }] } }
    const bundle = buildBundle(ending)
    const [item] = bundle.bricks.dishes!.kind === 'collection' ? bundle.bricks.dishes!.items : []
    expect(item?.upcoming?.map((u) => u.from)).toEqual(['2026-11-15'])
  })

  // Slice 3, what a page gets of an exception. Wrong behaviour caught: the page shows the normal price while an offer
  // holds; it cannot show the offer as an offer ("9,90 € bis 31. Dez., sonst 12,90 €"); a waiting offer is announced
  // without its end; or the covered normal value of a field outside timeline.public leaves the server.
  describe('exceptions', () => {
    const offer: Change = { from: '2026-10-01', until: '2026-10-31', set: { price: money(700), note: de('Aktion') } }
    const later: Change = { from: '2026-11-15', until: '2026-11-30', set: { price: money(800), note: de('geheim') } }
    const withOffer = (s = schema()) => ({ ...input(s), entries: { dishes: [{ id: 'd1', data: dish, changes: [offer, later] }] } })
    const first = (bundle: ReturnType<typeof buildBundle>) => (bundle.bricks.dishes!.kind === 'collection' ? bundle.bricks.dishes!.items[0] : undefined)

    it('today\'s values hold the exception; holding names it with the normal value it covers; upcoming carries the end', async () => {
      const item = first(await servedBundle(withOffer()))
      expect(item?.data).toMatchObject({ price: shown(700), note: 'Aktion' })
      expect(item?.holding).toEqual([{ from: '2026-10-01', until: '2026-10-31', data: { price: shown(700) }, normal: { price: shown(900) } }])
      expect(item?.upcoming).toEqual([{ from: '2026-11-15', until: '2026-11-30', data: { price: shown(800) } }])
    })

    it('neither holding nor upcoming carries a field outside timeline.public', () => {
      const text = JSON.stringify(first(buildBundle(withOffer()))?.holding)
      expect(text).not.toContain('heiß')
      expect(JSON.stringify(buildBundle(withOffer()))).not.toContain('geheim')
    })

    it('a brick without timeline gets today\'s values and nothing else', () => {
      const s = schema()
      delete s.bricks.dishes!.timeline
      const item = first(buildBundle(withOffer(s)))
      expect([item?.data.price, item?.holding, item?.upcoming]).toEqual([shown(700), undefined, undefined])
    })

    it('an entry without a holding exception gets no holding key', () => {
      expect(JSON.stringify(buildBundle(input()))).not.toContain('holding')
    })
  })

  it('carries nothing ahead for a brick without timeline', () => {
    const s = schema()
    delete s.bricks.dishes!.timeline
    delete s.bricks.practice!.timeline
    const bundle = buildBundle(input(s))
    expect(JSON.stringify(bundle)).not.toContain('upcoming')
  })
})
