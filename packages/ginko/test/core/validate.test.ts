import { describe, expect, it } from 'vitest'
import site from '../../../../sites/restaurant/ginko.config.ts'
import { collection, f, isEntryName, namesOf, serializeSchema, single, slugify, uniqueSlug, validate, type Issue, type Schema, type ValidateOptions } from '../../src/core/index.ts'

// Schema of the restaurant acceptance config (SPEC 13), plus a small extra brick
// for the email and tel formats the restaurant does not use.
const schema = serializeSchema(site)
const withContact = serializeSchema({
  ...site,
  bricks: {
    ...site.bricks,
    contact: single({
      label: 'Kontakt',
      fields: {
        email: f.text('E-Mail', { format: 'email', optional: true }),
        phone: f.text('Telefon', { format: 'tel', optional: true }),
        website: f.text('Website', { format: 'url', optional: true }),
      },
    }),
  },
})

const weekdays = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
// The weekly hours: a rows field, one row per day by its key.
const week = (): Record<string, Record<string, unknown>> => Object.fromEntries(weekdays.map((day) => [day, {
  closed: day === 'mo',
  ...(day === 'mo' ? {} : { from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' }),
}]))
const hours = (over: Record<string, unknown> = {}) => ({ week: week(), exceptions: [], holidayNoticeDays: 14, ...over })

const lunch = (over: Record<string, unknown> = {}) => ({
  weekOf: '2026-10-05',
  days: Object.fromEntries(weekdays.slice(0, 5).map((day) => [day, { dish: { de: 'Gulasch' }, allergens: [] }])),
  ...over,
})

const menuEntry = (over: Record<string, unknown> = {}) => ({
  category: 'mains',
  name: { de: 'Wiener Schnitzel' },
  price: { amount: 1290 },
  allergens: ['A', 'C'],
  veg: 'none',
  ...over,
})

const check = (mode: ValidateOptions['mode'], changed?: ReadonlySet<string>) => ({ mode, changed })
/** Compact view of issues for literal assertions. */
const pairs = (issues: Issue[]) => issues.map((i) => [i.path, i.code])

describe('validate modes (SPEC 2.3)', () => {
  // Wrong behaviour caught: a patch that does not touch holidayNoticeDays blocks the save on an old bad value,
  // or a release that skips checks because `changed` is set.
  it.each([
    ['create, nothing changed', check('create'), [['holidayNoticeDays', 'RANGE']], []],
    ['release ignores changed', check('release', new Set(['week'])), [['holidayNoticeDays', 'RANGE']], []],
    ['patch, field outside changed is a warning', check('patch', new Set(['week'])), [], [['holidayNoticeDays', 'RANGE']]],
    ['patch, field inside changed is an error', check('patch', new Set(['holidayNoticeDays'])), [['holidayNoticeDays', 'RANGE']], []],
    ['patch without changed is a warning', check('patch'), [], [['holidayNoticeDays', 'RANGE']]],
  ] as const)('%s', async (_name, opts, errors, warnings) => {
    const result = (await validate(schema, 'hours', hours({ holidayNoticeDays: 99 }), opts))
    expect(pairs(result.errors)).toEqual(errors)
    expect(pairs(result.warnings)).toEqual(warnings)
  })

  // Wrong behaviour caught: a patch lets an unknown key through because it is outside `changed`.
  it('patch keeps UNKNOWN_FIELD an error outside changed', async () => {
    const result = (await validate(schema, 'hours', hours({ color: 'red' }), check('patch', new Set(['week']))))
    expect(pairs(result.errors)).toEqual([['color', 'UNKNOWN_FIELD']])
    expect(result.warnings).toEqual([])
  })
})

describe('unknown keys (SPEC 2.3)', () => {
  // Wrong behaviour caught: a prototype key from JSON is treated as a known field, or crashes the validator.
  it.each(['__proto__', 'constructor', 'toString'])('rejects the JSON key %s', async (key) => {
    const data = JSON.parse(`{"week":${JSON.stringify(week())},"exceptions":[],"holidayNoticeDays":14,${JSON.stringify(key)}:1}`)
    expect(pairs((await validate(schema, 'hours', data, check('create'))).errors)).toEqual([[key, 'UNKNOWN_FIELD']])
  })

  // Wrong behaviour caught: an unknown key inside a row is accepted and stored.
  it('rejects an unknown key inside a row', async () => {
    const rows = week()
    rows.mo = { ...rows.mo, color: 'red' }
    expect(pairs((await validate(schema, 'hours', hours({ week: rows }), check('create'))).errors)).toEqual([['week.mo.color', 'UNKNOWN_FIELD']])
  })

  // Wrong behaviour caught: a request for a brick that does not exist returns something other than UNKNOWN_BRICK.
  it('returns UNKNOWN_BRICK for a missing brick key', async () => {
    expect(pairs((await validate(schema, 'nope', {}, check('create'))).errors)).toEqual([['', 'UNKNOWN_BRICK']])
  })

  // Wrong behaviour caught: a prototype name as brick key crashes the validator (TypeError) instead of UNKNOWN_BRICK.
  // SPEC 2.3: unknown keys are an error. Code: validate.ts looks up schema.bricks[key] and finds Object.prototype members.
  it.each(['constructor', '__proto__'])('returns UNKNOWN_BRICK for the prototype brick key %s', async (key) => {
    // SPEC 2.3: unbekannte Schlüssel sind ein Fehler; code does TypeError (validate.ts:49) for these keys.
    expect(pairs((await validate(schema, key, {}, check('create'))).errors)).toEqual([['', 'UNKNOWN_BRICK']])
  })
})

describe('calendar dates, times and ranges (SPEC 2.2, 2.3)', () => {
  // Wrong behaviour caught: impossible calendar days (30 Feb, 29 Feb in a non-leap year) are stored.
  it.each([
    ['2026-02-30', [['closedOn', 'DATE']]],
    ['2026-02-29', [['closedOn', 'DATE']]],
    ['2026-13-01', [['closedOn', 'DATE']]],
    ['2026-10-8', [['closedOn', 'DATE']]],
    ['2028-02-29', []],
  ] as const)('closedOn %s', async (value, expected) => {
    expect(pairs((await validate(schema, 'hours', hours({ closedOn: value }), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: 24:00 or a malformed clock time is accepted as a time of day.
  it.each([
    ['00:00', []],
    ['23:59', []],
    ['24:00', [['week.tu.from1', 'TIME']]],
    ['9:00', [['week.tu.from1', 'TIME']]],
    ['12:60', [['week.tu.from1', 'TIME']]],
  ] as const)('opening time %s', async (value, expected) => {
    const rows = week()
    rows.tu = { ...rows.tu, from1: value }
    expect(pairs((await validate(schema, 'hours', hours({ week: rows }), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: a holiday period that ends before it starts is saved.
  it.each([
    ['2026-12-23', '2026-12-24', []],
    ['2026-12-24', '2026-12-24', []],
    ['2026-12-24', '2026-12-23', [['exceptions.ex00000001.when', 'DATE_ORDER']]],
  ] as const)('holiday period from %s to %s', async (from, to, expected) => {
    const exceptions = [{ _id: 'ex00000001', when: { from, to }, reason: { de: 'Betriebsurlaub' }, closed: true }]
    expect(pairs((await validate(schema, 'hours', hours({ exceptions }), check('create'))).errors)).toEqual(expected)
  })
})

describe('a week start (lunch.weekOf, lunchPlans.weekOf)', () => {
  const sundayFirst: Schema = { ...schema, week: { firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] } }
  // Wrong behaviour caught: a lunch week saved as a Thursday is stored and never shows, because the site looks for the
  // week that starts on the week's first day.
  it.each([
    ['lunch', 'a Monday', schema, '2026-10-12', []],
    ['lunch', 'a Thursday', schema, '2026-10-15', [['weekOf', 'NOT_WEEK_START']]],
    ['lunchPlans', 'a Monday', schema, '2026-10-12', []],
    ['lunchPlans', 'a Thursday', schema, '2026-10-15', [['weekOf', 'NOT_WEEK_START']]],
    ['lunchPlans', 'a Sunday on a Sunday-first site', sundayFirst, '2026-10-11', []],
    ['lunchPlans', 'a Monday on a Sunday-first site', sundayFirst, '2026-10-12', [['weekOf', 'NOT_WEEK_START']]],
  ] as const)('%s: %s', async (brick, _name, s, weekOf, expected) => {
    // The six workdays of a Sunday-first site are Sunday to Friday: the lunch week has a row for each.
    const days = s === sundayFirst ? { su: { dish: { de: 'Gulasch' }, allergens: [] }, ...(lunch().days as object) } : lunch().days
    expect(pairs((await validate(s, brick, lunch({ weekOf, days }), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: an old week stored mid-week blocks every later save that does not touch the week.
  it('a save of the days only warns about a stored mid-week start', async () => {
    const result = await validate(schema, 'lunch', lunch({ weekOf: '2026-10-15' }), check('patch', new Set(['days'])))
    expect([pairs(result.errors), pairs(result.warnings)]).toEqual([[], [['weekOf', 'NOT_WEEK_START']]])
  })
})

describe('numbers and money (SPEC 2.2, 2.3)', () => {
  // Wrong behaviour caught: a value between two steps (14.5 with step 1) or outside min/max is saved.
  it.each([
    [0, []],
    [60, []],
    [14.5, [['holidayNoticeDays', 'STEP']]],
    [61, [['holidayNoticeDays', 'RANGE']]],
    [-1, [['holidayNoticeDays', 'RANGE']]],
    ['14', [['holidayNoticeDays', 'TYPE']]],
  ] as const)('holidayNoticeDays %s', async (value, expected) => {
    expect(pairs((await validate(schema, 'hours', hours({ holidayNoticeDays: value }), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: money in euros, fractions of a cent, negative or absurd amounts are stored.
  it.each([
    [{ amount: 0 }, []],
    [{ amount: 100_000_000 }, []],
    [{ amount: -1 }, [['price', 'RANGE']]],
    [{ amount: 100_000_001 }, [['price', 'RANGE']]],
    [{ amount: 12.5 }, [['price', 'TYPE']]],
    [{ amount: '1290' }, [['price', 'TYPE']]],
    [{ amount: 1290, currency: 'EUR' }, [['price', 'TYPE']]],
  ] as const)('menu price %j', async (price, expected) => {
    expect(pairs((await validate(schema, 'menu', menuEntry({ price }), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: a fixed price saved without its amount (the site then shows "on request"), or an amount
  // demanded for an entry priced on request.
  it.each([
    [{ pricing: 'price', price: { amount: 39000 } }, []],
    [{ pricing: 'price' }, [['price', 'REQUIRED']]],
    [{ pricing: 'onRequest' }, []],
  ] as const)('a required field with showWhen is required only while shown: %j', async (data, expected) => {
    const priced = serializeSchema({
      ...site,
      bricks: {
        ...site.bricks,
        offer: single({
          label: 'Angebot',
          fields: {
            pricing: f.choice('Preis', { options: [{ value: 'price', label: 'Fest' }, { value: 'onRequest', label: 'Auf Anfrage' }] }),
            price: f.money('Betrag', { showWhen: { field: 'pricing', is: 'price' } }),
          },
        }),
      },
    })
    expect(pairs((await validate(priced, 'offer', data, check('create'))).errors)).toEqual(expected)
  })
})

describe('text formats (SPEC 2.2, 2.3)', () => {
  // Wrong behaviour caught: a javascript: or schemeless link, a malformed email or a short phone number is saved.
  it.each([
    ['website', 'javascript:alert(1)', [['website', 'FORMAT']]],
    ['website', 'lupinum.com', [['website', 'FORMAT']]],
    ['website', 'https://lupinum.com/reservierung', []],
    ['email', 'hallo@linde', [['email', 'FORMAT']]],
    ['email', 'a b@linde.at', [['email', 'FORMAT']]],
    ['email', 'hallo@linde.at', []],
    ['phone', '12', [['phone', 'FORMAT']]],
    ['phone', 'anrufen', [['phone', 'FORMAT']]],
    ['phone', '+43 662 123456', []],
    ['phone', '0662/123456', []],
  ] as const)('%s = %s', async (field, value, expected) => {
    expect(pairs((await validate(withContact, 'contact', { [field]: value }, check('create'))).errors)).toEqual(expected)
  })
})

describe('localized text (SPEC 2.2)', () => {
  // Wrong behaviour caught: a text without the main locale is saved, or a locale the site does not have is stored.
  it.each([
    [{ en: 'Viennese schnitzel' }, [['name.de', 'REQUIRED']]],
    [{ de: 'Wiener Schnitzel', fr: 'Schnitzel' }, [['name.fr', 'UNKNOWN_LOCALE']]],
    [{ de: 'Wiener Schnitzel', en: '' }, []],
    [{ de: 'Wiener Schnitzel', en: 'Viennese schnitzel' }, []],
    ['Wiener Schnitzel', [['name', 'NOT_LOCALIZED']]],
  ] as const)('name %j', async (name, expected) => {
    expect(pairs((await validate(schema, 'menu', menuEntry({ name }), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: an empty or blank main-locale text passes as filled in.
  it.each(['', '   '])('blank main locale %j is rejected', async (value) => {
    expect(pairs((await validate(schema, 'menu', menuEntry({ name: { de: value } }), check('create'))).errors)).toContainEqual(['name.de', 'REQUIRED'])
  })
})

describe('list rows (SPEC 2.2, 2.3)', () => {
  const exception = (id: string) => ({ _id: id, when: { from: '2026-01-01', to: '2026-01-02' }, reason: { de: 'Urlaub' }, closed: true })
  // Wrong behaviour caught: a row id that is not 10 safe characters is stored.
  it.each([
    ['too short', 'ex000000'],
    ['contains a space', 'ex 0000000'],
    ['too long', 'ex000000000'],
  ])('row id is %s', async (_name, id) => {
    expect(pairs((await validate(schema, 'hours', hours({ exceptions: [exception(id)] }), check('create'))).errors)).toEqual([['exceptions.0', 'ROW_ID']])
  })

  // Wrong behaviour caught: two rows of one list share an id, so edits hit the wrong row.
  it('rejects a duplicate row id', async () => {
    const exceptions = [exception('ex00000001'), exception('ex00000001')]
    expect(pairs((await validate(schema, 'hours', hours({ exceptions }), check('create'))).errors)).toEqual([['exceptions.ex00000001', 'ROW_ID']])
  })

  // Wrong behaviour caught: the exception list exceeds its max of 20.
  it('rejects exceptions with 21 rows', async () => {
    const exceptions = Array.from({ length: 21 }, (_, i) => exception(`ex${String(i).padStart(8, '0')}`))
    expect(pairs((await validate(schema, 'hours', hours({ exceptions }), check('create'))).errors)).toEqual([['exceptions', 'TOO_MANY']])
  })
})

describe('rows fields (f.rows)', () => {
  // Wrong behaviour caught: a weekly plan without a day, or with a day the field does not have, is stored, and the
  // owner reads a sentence that does not name the row.
  it.each([
    ['a missing day', 'hours', hours({ week: (({ su: _su, ...rest }) => rest)(week()) }), ['week.su', 'REQUIRED', '„Wochenplan“: Die Zeile „su“ fehlt.']],
    ['a day the field does not have', 'hours', hours({ week: { ...week(), xx: { closed: true } } }), ['week.xx', 'UNKNOWN_ROW', '„Wochenplan“: Eine Zeile „xx“ gibt es nicht.']],
    ['a workday missing in the lunch week', 'lunch', lunch({ days: (({ fr: _fr, ...rest }) => rest)(lunch().days as Record<string, unknown>) }), ['days.fr', 'REQUIRED', '„Tage“: Die Zeile „fr“ fehlt.']],
    ['the weekend in the lunch week of a Monday-to-Friday site', 'lunch', lunch({ days: { ...(lunch().days as Record<string, unknown>), sa: { dish: { de: 'Gulasch' }, allergens: [] } } }), ['days.sa', 'UNKNOWN_ROW', '„Tage“: Eine Zeile „sa“ gibt es nicht.']],
  ] as const)('rejects %s', async (_name, brick, data, expected) => {
    const { errors } = await validate(schema, brick, data, check('create'))
    expect(errors.map((e) => [e.path, e.code, e.message])).toEqual([expected])
  })

  // Wrong behaviour caught: inside a row, `showWhen` and `after` read another row's values (or none), so a closed day
  // still needs its times, an open one may lack them, or an end before its start is stored.
  describe('after and showWhen inside a row', () => {
    const open = { field: 'closed', not: true } as const
    const slots = serializeSchema({
      ...site,
      bricks: {
        ...site.bricks,
        slots: single({ label: 'Zeiten', fields: { days: f.rows('Tage', { rows: [{ key: 'mo', label: 'Montag' }, { key: 'tu', label: 'Dienstag' }], fields: {
          closed: f.boolean('Geschlossen', { default: false }),
          from: f.time('Von', { showWhen: open }),
          to: f.time('Bis', { after: 'from', showWhen: open }),
        } }) } }),
      },
    })
    it.each([
      ['a closed day without times and an open day with them', { closed: false, from: '10:00', to: '12:00' }, []],
      ['an open day without its start', { closed: false, to: '12:00' }, [['days.tu.from', 'REQUIRED']]],
      ['an open day that ends before it starts', { closed: false, from: '10:00', to: '09:00' }, [['days.tu.to', 'TIME_ORDER']]],
    ] as const)('%s', async (_name, tu, expected) => {
      const { errors } = await validate(slots, 'slots', { days: { mo: { closed: true }, tu } }, check('create'))
      expect(pairs(errors)).toEqual(expected)
    })
  })

  // Wrong behaviour caught: the old stored shape (a list of rows with a day column) is read as valid rows.
  it('rejects a list where a rows field needs one object per row', async () => {
    const asList = Object.entries(week()).map(([day, row], i) => ({ _id: `wk${day}00000${i}`, day, ...row }))
    expect(pairs((await validate(schema, 'hours', hours({ week: asList }), check('create'))).errors)).toEqual([['week', 'TYPE']])
  })
})

describe('choice and choices (SPEC 2.2, 2.3)', () => {
  // Wrong behaviour caught: values the choice does not offer are stored, or a single value is accepted as a list.
  it.each([
    ['menu', menuEntry({ veg: 'sometimes' }), [['veg', 'CHOICE']]],
    ['menu', menuEntry({ allergens: ['Z'] }), [['allergens', 'CHOICE']]],
    ['menu', menuEntry({ allergens: 'A' }), [['allergens', 'CHOICE']]],
    ['menu', menuEntry({ allergens: ['A', 'A'] }), [['allergens', 'DUPLICATE']]],
  ] as const)('%s with a bad choice', async (brick, data, expected) => {
    expect(pairs((await validate(schema, brick, data, check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: an empty choices list is rejected, although SPEC 2.2 uses [] for "none".
  it('accepts an empty choices list (keine Allergene)', async () => {
    expect((await validate(schema, 'menu', menuEntry({ allergens: [] }), check('create'))).errors).toEqual([])
  })
})

describe('image (SPEC 2.2)', () => {
  const gallery = (alt: Record<string, string>) => ({ images: [{ _id: 'img0000001', image: { file: 'file_01', alt } }] })

  // Wrong behaviour caught: an image without a description in the main locale is published.
  it.each([
    [{ de: 'Gastraum mit Kachelofen' }, []],
    [{ en: 'Dining room' }, [['images.img0000001.image.alt', 'ALT_REQUIRED']]],
    [{ de: '   ' }, [['images.img0000001.image.alt', 'ALT_REQUIRED']]],
    // Wrong behaviour caught: a NUL or a bidi override (which turns the read-out words around) reached the site.
    [{ de: 'Bild\u0000' }, [['images.img0000001.image.alt.de', 'FORMAT']]],
    [{ de: 'Bild \u202eesiw' }, [['images.img0000001.image.alt.de', 'FORMAT']]],
  ] as const)('alt %j', async (alt, expected) => {
    expect(pairs((await validate(schema, 'gallery', gallery(alt), check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: an owner who described the photo once in the Files library is still asked for a text in every field.
  it.each([
    [{}, { de: 'Gastraum' }, []],
    [{ de: '  ' }, { de: 'Gastraum' }, []],
    [{}, { en: 'Dining room' }, [['images.img0000001.image.alt', 'ALT_REQUIRED']]],
    [{}, undefined, [['images.img0000001.image.alt', 'ALT_REQUIRED']]],
  ] as const)('own alt %j with library text %j', async (alt, library, expected) => {
    const result = await validate(schema, 'gallery', gallery(alt), { ...check('create'), fileAlt: (file) => (file === 'file_01' ? library : undefined) })
    expect(pairs(result.errors)).toEqual(expected)
  })
})

describe('markdown field (profile check)', () => {
  const withNote = serializeSchema({
    ...site,
    bricks: { ...site.bricks, note: single({ label: 'Notiz', fields: { text: f.markdown('Text', { profile: 'inline' }) } }) },
  })

  // Wrong behaviour caught: a value outside the field's profile (a second paragraph, a heading, an event-handler attribute) is stored,
  // or the issue points at the field instead of the locale that holds the bad text.
  it.each([
    ['inline text with bold and a safe link', { de: '**Hallo** [Karte](/speisekarte)' }, []],
    ['a second paragraph', { de: 'Eins\n\nZwei' }, [['text.de', 'MARKDOWN']]],
    ['a heading', { de: '## Titel' }, [['text.de', 'MARKDOWN']]],
    ['an event-handler attribute', { de: '**fett**{onclick="alert(1)"}' }, [['text.de', 'MARKDOWN']]],
    // Break-it: a NUL character is refused before the text reaches the parser.
    ['a NUL control character', { de: 'a\u0000b' }, [['text.de', 'FORMAT']]],
    ['only the English text is bad', { de: 'Hallo', en: 'Eins\n\nZwei' }, [['text.en', 'MARKDOWN']]],
  ] as const)('%s', async (_name, text, expected) => {
    expect(pairs((await validate(withNote, 'note', { text }, check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: a `::figure` without its closing `::` swallows the rest of the text (the site drops it),
  // and the save goes through without a message. Every write path calls validate(), so this guards all of them.
  it('refuses an unclosed component, with its line', async () => {
    const withArticle = serializeSchema({
      ...site,
      components: { figure: { kind: 'block', label: 'Abbildung', describe: 'Ein Bild.', props: { src: f.text('Bild') } } },
      bricks: { ...site.bricks, article: single({ label: 'Artikel', fields: { body: f.markdown('Text', { profile: 'page' }) } }) },
    })
    const { errors } = await validate(withArticle, 'article', { body: { de: 'Intro\n\n::figure{src="/a.jpg"}\nText danach' } }, check('create'))
    expect(errors.map((e) => [e.path, e.code, e.message])).toEqual([
      ['body.de', 'MARKDOWN', '„Text“, Zeile 3: Die Komponente „figure“ ist nicht geschlossen: Nach ihrem Inhalt fehlt eine Zeile mit „::“.'],
    ])
  })

  // Wrong behaviour caught: the platform stores a text whose library picture is gone (the site shows a hole) or whose
  // picture has no description at all, which agent tools and imports could write without the editor's check.
  it.each([
    ['a described picture of the library', { de: '![Hund]($file.up1)' }, []],
    ['a picture described only in the library', { de: '![]($file.up1)', en: '![]($file.up1)' }, [['body.en', 'ALT_REQUIRED']]],
    ['a picture that is gone, inside a component', { de: '::figure{src="$file.gone"}\n::' }, [['body.de', 'FILE_REF_MISSING']]],
    ['a web picture without description', { de: '![](https://bilder.example/a.jpg)' }, [['body.de', 'ALT_REQUIRED']]],
    // Wrong behaviour caught: a hand-typed picture of a PDF saved and showed as a broken image on the site.
    ['a PDF as a picture', { de: '![Karte]($file.pdf1)' }, [['body.de', 'FILE_REF_NOT_IMAGE']]],
    ['a link to a PDF', { de: '[Karte]($file.pdf1)' }, []],
  ] as const)('platform texts: %s', async (_name, body, expected) => {
    const withArticle = serializeSchema({
      ...site,
      components: { figure: { kind: 'block', label: 'Abbildung', describe: 'Ein Bild.', props: { src: f.image('Bild') } } },
      bricks: { ...site.bricks, article: single({ label: 'Artikel', fields: { body: f.markdown('Text', { profile: 'page' }) } }) },
    })
    const { errors } = await validate(withArticle, 'article', { body }, { ...check('create'), uploads: (id) => (id === 'up1' ? 'image' : id === 'pdf1' ? 'file' : undefined), fileAlt: (id) => (id === 'up1' ? { de: 'Ein Hund' } : undefined) })
    expect(pairs(errors)).toEqual(expected)
  })
})

describe('slug field (SPEC 2.2)', () => {
  const event = (slug: unknown) => ({
    title: { de: 'Jazzabend' },
    slug,
    when: { from: '2026-11-06', to: '2026-11-06' },
    description: { de: 'Ein Abend mit Jazz.' },
  })

  // Wrong behaviour caught: an address with upper case, double dashes, or umlauts is stored.
  it.each([
    ['jazzabend', []],
    ['jazz-abend-2026', []],
    ['Jazzabend', [['slug.de', 'SLUG']]],
    ['jazz--abend', [['slug.de', 'SLUG']]],
    ['jazzäbend', [['slug.de', 'SLUG']]],
  ] as const)('slug %s', async (value, expected) => {
    expect(pairs((await validate(schema, 'events', event({ de: value }), check('create'))).errors)).toEqual(expected)
  })
})

describe('slugify and uniqueSlug (SPEC 2.2)', () => {
  // Wrong behaviour caught: German umlauts and ß are dropped or turned into the wrong letters in addresses.
  it.each([
    ['Käse', 'kaese'],
    ['Öl & Essig', 'oel-essig'],
    ['Büro', 'buero'],
    ['Straße', 'strasse'],
    ['Über uns & Team', 'ueber-uns-team'],
    ['Café', 'cafe'],
    ['***', ''],
  ])('slugify(%j) is %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  // Wrong behaviour caught: two entries on one page get the same address, or the suffix skips a number.
  it.each([
    [[], 'konzert'],
    [['konzert'], 'konzert-2'],
    [['konzert', 'konzert-2'], 'konzert-3'],
    [['konzert', 'konzert-2', 'konzert-3'], 'konzert-4'],
    [['jazz'], 'konzert'],
  ])('uniqueSlug with taken %j', (taken, expected) => {
    expect(uniqueSlug('konzert', (slug) => taken.includes(slug))).toBe(expected)
  })
})

describe('namesOf (D96)', () => {
  // Wrong behaviour caught: the double of a 100-character slug set by hand gets a 102-character name, which the file
  // reader, the import and the export then refuse.
  it('cuts the base so that a name with its -2 end stays an entry name', () => {
    const brick = collection({ label: 'Seiten', max: 10, order: 'manual', listing: { title: 'title' }, fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) } })
    const long = `${'a'.repeat(97)}-bc`
    const names = namesOf('pages', brick, 'de', [{ slug: { de: long } }, { slug: { de: long } }])
    expect(names).toEqual([long, `${'a'.repeat(97)}-2`])
    expect(names.every(isEntryName)).toBe(true)
  })
})

describe('ref field (SPEC 2.2, 2.3)', () => {
  const refSchema = structuredClone(schema)
  Object.assign(refSchema.bricks.menu!.fields, {
    side: { type: 'ref', label: 'Beilage', to: 'menu', optional: true },
    sides: { type: 'ref', label: 'Beilagen', to: 'menu', multiple: true, max: 2, optional: true },
  })
  const known = new Set(['menu\nm1', 'menu\nm2', 'menu\nm3'])
  const refs = (brick: string, id: string) => known.has(`${brick}\n${id}`)

  // Wrong behaviour caught: a ref stores a non-ID, a repeated ID, too many IDs, or an ID of an entry that does not exist.
  it.each([
    [{ side: 'm1' }, []],
    [{ sides: ['m1', 'm2'] }, []],
    [{ sides: [] }, []],
    [{ side: 5 }, [['side', 'TYPE']]],
    [{ side: ['m1'] }, [['side', 'TYPE']]],
    [{ sides: 'm1' }, [['sides', 'TYPE']]],
    [{ sides: ['m1', 1] }, [['sides', 'TYPE']]],
    [{ sides: ['m1', 'm1'] }, [['sides', 'DUPLICATE']]],
    [{ sides: ['m1', 'm2', 'm3'] }, [['sides', 'TOO_MANY']]],
    [{ side: 'gone' }, [['side', 'REF_MISSING']]],
    [{ sides: ['m1', 'gone'] }, [['sides', 'REF_MISSING']]],
  ] as const)('menu entry %j', async (over, expected) => {
    const result = await validate(refSchema, 'menu', menuEntry(over), { mode: 'create', refs })
    expect(pairs(result.errors)).toEqual(expected)
  })

  it('does not look IDs up without a refs callback', async () => {
    expect((await validate(refSchema, 'menu', menuEntry({ side: 'gone' }), check('create'))).errors).toEqual([])
  })
})

describe('the draft check (D115): well formed to be stored, not complete', () => {
  const kit = serializeSchema({
    ...site,
    bricks: {
      ...site.bricks,
      kit: collection({
        label: 'Kit', max: 50, order: 'manual', listing: { title: 'name' },
        fields: {
          name: f.text('Name', { max: 20 }),
          slug: f.slug('Adresse', { from: 'name' }),
          day: f.date('Tag', { optional: true }),
          at: f.time('Uhrzeit', { optional: true }),
          until: f.time('Bis', { optional: true, after: 'at' }),
          span: f.daterange('Zeitraum', { optional: true }),
          count: f.number('Anzahl', { min: 0, max: 10, step: 1, optional: true }),
          kind: f.choice('Art', { options: ['a', 'b'], optional: true }),
          tags: f.choices('Tags', { options: ['a', 'b'], optional: true }),
          friends: f.refs('Freunde', { to: 'kit', optional: true }),
          rows: f.list('Zeilen', { itemLabel: 'Zeile', max: 2, unique: 'label', optional: true, fields: { label: f.text('Bezeichnung', { translate: false }) } }),
          few: f.list('Wenige', { itemLabel: 'Zeile', min: 2, max: 3, optional: true, fields: { label: f.text('Bezeichnung', { translate: false }) } }),
          body: f.markdown('Text', { profile: 'page', optional: true }),
        },
      }),
    },
  })
  const base = { name: { de: 'Kiste', en: 'Box' }, slug: { de: 'kiste', en: 'box' } }
  const draft = (data: Record<string, unknown>, brick = 'kit') =>
    validate(kit, brick, data, { mode: 'draft', refs: (_b, id) => id === 'there', uploads: (id) => (id === 'pdf1' ? 'file' : id === 'img1' ? 'image' : undefined), fileAlt: () => ({ de: 'Bild' }) })
  const row = (id: string, label: string) => ({ _id: id, label })

  // One row per code the validator gives. Wrong behaviour caught: (refused) a draft stores a value the site and the
  // Studio cannot read as what it claims to be (a date that is a number or a phrase, a time 25:99, two rows with one
  // `_id`), so `statusOf`, the date texts and the editor's row keys break on it; (warns) a half-filled draft is refused
  // for what it lacks or for content not yet good enough, so the person loses the input. A code that is not listed as a
  // warning is refused (the check fails closed).
  it.each([
    ['TYPE: a number that is text', 'refuses', 'kit', { ...base, count: 'drei' }, ['count', 'TYPE']],
    ['NOT_OBJECT: an entry that is no object', 'refuses', 'kit', 'Kiste', ['', 'NOT_OBJECT']],
    ['NOT_LOCALIZED: a translatable text as a plain string', 'refuses', 'kit', { ...base, name: 'Kiste' }, ['name', 'NOT_LOCALIZED']],
    ['UNKNOWN_FIELD', 'refuses', 'kit', { ...base, nope: 1 }, ['nope', 'UNKNOWN_FIELD']],
    ['UNKNOWN_LOCALE', 'refuses', 'kit', { ...base, name: { de: 'Kiste', xx: 'Kist' } }, ['name.xx', 'UNKNOWN_LOCALE']],
    ['UNKNOWN_BRICK', 'refuses', 'nope', base, ['', 'UNKNOWN_BRICK']],
    ['UNKNOWN_ROW', 'refuses', 'hours', hours({ week: { ...week(), xx: { closed: true } } }), ['week.xx', 'UNKNOWN_ROW']],
    ['DATE: a number', 'refuses', 'kit', { ...base, day: 42 }, ['day', 'DATE']],
    ['DATE: a phrase', 'refuses', 'kit', { ...base, day: 'next friday' }, ['day', 'DATE']],
    ['DATE: a range of phrases', 'refuses', 'kit', { ...base, span: { from: 'heute', to: 'morgen' } }, ['span', 'DATE']],
    ['DATE: a period with one side that is no date', 'refuses', 'kit', { ...base, span: { from: '2026-10-09', to: '' } }, ['span', 'DATE']],
    ['TIME: 25:99', 'refuses', 'kit', { ...base, at: '25:99' }, ['at', 'TIME']],
    ['ROW_ID: a row without a proper id', 'refuses', 'kit', { ...base, rows: [row('kurz', 'A')] }, ['rows.0', 'ROW_ID']],
    ['ROW_ID: two rows with one id', 'refuses', 'kit', { ...base, rows: [row('aaaaaaaaaa', 'A'), row('aaaaaaaaaa', 'B')] }, ['rows.aaaaaaaaaa', 'ROW_ID']],
    ['SLUG: an address that is no address', 'refuses', 'kit', { ...base, slug: { de: 'Kiste mit Leerzeichen', en: 'box' } }, ['slug.de', 'SLUG']],
    ['FILE_REF_NOT_IMAGE: a PDF as a picture', 'refuses', 'kit', { ...base, body: { de: '![Karte]($file.pdf1)' } }, ['body.de', 'FILE_REF_NOT_IMAGE']],
    ['DUPLICATE: one option twice', 'refuses', 'kit', { ...base, tags: ['a', 'a'] }, ['tags', 'DUPLICATE']],
    ['DUPLICATE: one entry twice', 'refuses', 'kit', { ...base, friends: ['there', 'there'] }, ['friends', 'DUPLICATE']],
    ['REQUIRED', 'warns', 'kit', { slug: base.slug }, ['name', 'REQUIRED']],
    ['TOO_LONG', 'warns', 'kit', { ...base, name: { de: 'K'.repeat(21), en: 'Box' } }, ['name.de', 'TOO_LONG']],
    ['FORMAT: a control character', 'warns', 'kit', { ...base, name: { de: 'Ki\u0000ste', en: 'Box' } }, ['name.de', 'FORMAT']],
    ['TOO_MANY', 'warns', 'kit', { ...base, rows: [row('aaaaaaaaaa', 'A'), row('bbbbbbbbbb', 'B'), row('cccccccccc', 'C')] }, ['rows', 'TOO_MANY']],
    ['TOO_FEW', 'warns', 'kit', { ...base, few: [row('aaaaaaaaaa', 'A')] }, ['few', 'TOO_FEW']],
    ['RANGE', 'warns', 'kit', { ...base, count: 11 }, ['count', 'RANGE']],
    ['STEP', 'warns', 'kit', { ...base, count: 1.5 }, ['count', 'STEP']],
    ['CHOICE', 'warns', 'kit', { ...base, kind: 'c' }, ['kind', 'CHOICE']],
    // I2.5: stored data that passed before (a choice key as a number, a multiple choice as one string) stays a warning,
    // so a restore and a save of such a draft are not refused.
    ['CHOICE: a choice stored as a number', 'warns', 'kit', { ...base, kind: 1 }, ['kind', 'CHOICE']],
    ['CHOICE: a multiple choice stored as one string', 'warns', 'kit', { ...base, tags: 'a' }, ['tags', 'CHOICE']],
    ['DATE_ORDER', 'warns', 'kit', { ...base, span: { from: '2026-10-09', to: '2026-10-08' } }, ['span', 'DATE_ORDER']],
    ['REQUIRED: a period without its end', 'warns', 'kit', { ...base, span: { from: '2026-10-09' } }, ['span', 'REQUIRED']],
    ['REQUIRED: a period without its start', 'warns', 'kit', { ...base, span: { to: '2026-10-09' } }, ['span', 'REQUIRED']],
    ['REF_MISSING', 'warns', 'kit', { ...base, friends: ['gone'] }, ['friends', 'REF_MISSING']],
    ['FILE_REF_MISSING', 'warns', 'kit', { ...base, body: { de: '![Karte]($file.lost1)' } }, ['body.de', 'FILE_REF_MISSING']],
    ['ALT_REQUIRED: a web picture without description', 'warns', 'kit', { ...base, body: { de: '![](https://bilder.example/a.jpg)' } }, ['body.de', 'ALT_REQUIRED']],
    ['MARKDOWN', 'warns', 'kit', { ...base, body: { de: '::nope' } }, ['body.de', 'MARKDOWN']],
    ['DUPLICATE: a doubled value in a unique column', 'warns', 'kit', { ...base, rows: [row('aaaaaaaaaa', 'A'), row('bbbbbbbbbb', 'A')] }, ['rows', 'DUPLICATE']],
    ['TIME_ORDER (a rule across fields)', 'warns', 'kit', { ...base, at: '14:00', until: '11:30' }, ['until', 'TIME_ORDER']],
    ['NOT_WEEK_START (a rule across fields)', 'warns', 'lunch', lunch({ weekOf: '2026-10-15' }), ['weekOf', 'NOT_WEEK_START']],
  ] as const)('%s: %s', async (_name, verdict, brick, data, issue) => {
    const { errors, warnings } = await draft(data as Record<string, unknown>, brick)
    if (verdict === 'refuses') expect(pairs(errors)).toContainEqual(issue)
    else expect([pairs(errors), pairs(warnings)]).toEqual([[], expect.arrayContaining([issue])])
  })

  // Wrong behaviour caught: a half-filled period goes online, and the site shows an end without a start (F13).
  it('refuses a period with one side missing when it goes online', async () => {
    const { errors } = await validate(kit, 'kit', { ...base, span: { from: '2026-10-09' } }, check('create'))
    expect(errors).toEqual([expect.objectContaining({ path: 'span', code: 'REQUIRED', key: 'issues.dateRangeToMissing' })])
  })
})
