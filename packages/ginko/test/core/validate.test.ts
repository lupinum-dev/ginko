import { describe, expect, it } from 'vitest'
import site from '../../../../sites/restaurant/ginko.config.ts'
import { f, serializeSchema, single, slugify, uniqueSlug, validate, type Issue, type ValidateOptions } from '../../src/core/index.ts'

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
const week = () => weekdays.map((day) => ({
  _id: `wk${day}000000`,
  day,
  closed: day === 'mo',
  ...(day === 'mo' ? {} : { from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00' }),
}))
const hours = (over: Record<string, unknown> = {}) => ({ week: week(), exceptions: [], holidayNoticeDays: 14, ...over })

const lunch = (over: Record<string, unknown> = {}) => ({
  weekOf: '2026-10-05',
  days: weekdays.slice(0, 5).map((day) => ({ _id: `ld${day}000000`, day, dish: { de: 'Gulasch' }, allergens: [] })),
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

  // Wrong behaviour caught: an unknown key inside a list row is accepted and stored.
  it('rejects an unknown key inside a list row', async () => {
    const rows = week().map((row, i) => (i === 0 ? { ...row, color: 'red' } : row))
    expect(pairs((await validate(schema, 'hours', hours({ week: rows }), check('create'))).errors)).toEqual([['week.wkmo000000.color', 'UNKNOWN_FIELD']])
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
    ['24:00', [['week.wktu000000.from1', 'TIME']]],
    ['9:00', [['week.wktu000000.from1', 'TIME']]],
    ['12:60', [['week.wktu000000.from1', 'TIME']]],
  ] as const)('opening time %s', async (value, expected) => {
    const rows = week().map((row) => (row.day === 'tu' ? { ...row, from1: value } : row))
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
  // Wrong behaviour caught: a row id that is not 10 safe characters is stored.
  it.each([
    ['too short', 'wkmo0000'],
    ['contains a space', 'wk mo00000'],
    ['too long', 'wkmo0000000'],
  ])('row id is %s', async (_name, id) => {
    const rows = week().map((row, i) => (i === 0 ? { ...row, _id: id } : row))
    expect(pairs((await validate(schema, 'hours', hours({ week: rows }), check('create'))).errors)).toEqual([['week.0', 'ROW_ID']])
  })

  // Wrong behaviour caught: two rows of one list share an id, so edits hit the wrong row.
  it('rejects a duplicate row id', async () => {
    const rows = week().map((row, i) => (i === 1 ? { ...row, _id: 'wkmo000000' } : row))
    expect(pairs((await validate(schema, 'hours', hours({ week: rows }), check('create'))).errors)).toEqual([['week.wkmo000000', 'ROW_ID']])
  })

  // Wrong behaviour caught: the weekly plan can have six rows, or the exception list can exceed its max of 20.
  it.each([
    ['week with 6 rows', hours({ week: week().slice(0, 6) }), [['week', 'TOO_FEW']]],
    ['exceptions with 21 rows', hours({
      exceptions: Array.from({ length: 21 }, (_, i) => ({
        _id: `ex${String(i).padStart(8, '0')}`,
        when: { from: '2026-01-01', to: '2026-01-02' },
        reason: { de: 'Urlaub' },
        closed: true,
      })),
    }), [['exceptions', 'TOO_MANY']]],
  ] as const)('%s', async (_name, data, expected) => {
    expect(pairs((await validate(schema, 'hours', data, check('create'))).errors)).toEqual(expected)
  })

  // Wrong behaviour caught: the weekly plan lists Monday twice and nothing says so.
  it('rejects a unique column that repeats (hours.week Monday twice)', async () => {
    const rows = week().map((row) => (row.day === 'su' ? { ...row, _id: 'wkmo111111', day: 'mo' as const } : row))
    expect(pairs((await validate(schema, 'hours', hours({ week: rows }), check('create'))).errors)).toEqual([['week', 'DUPLICATE']])
  })

  // Wrong behaviour caught: lunch is saved with only four of its five days.
  it('rejects lunch with four days, min 5', async () => {
    const data = lunch({ days: lunch().days.slice(0, 4) })
    expect(pairs((await validate(schema, 'lunch', data, check('create'))).errors)).toEqual([['days', 'TOO_FEW']])
  })
})

describe('choice and choices (SPEC 2.2, 2.3)', () => {
  // Wrong behaviour caught: values the choice does not offer are stored, or a single value is accepted as a list.
  it.each([
    ['hours', hours({ week: week().map((row, i) => (i === 0 ? { ...row, day: 'xx' } : row)) }), [['week.wkmo000000.day', 'CHOICE']]],
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
  ] as const)('platform texts: %s', async (_name, body, expected) => {
    const withArticle = serializeSchema({
      ...site,
      components: { figure: { kind: 'block', label: 'Abbildung', describe: 'Ein Bild.', props: { src: f.image('Bild') } } },
      bricks: { ...site.bricks, article: single({ label: 'Artikel', fields: { body: f.markdown('Text', { profile: 'page' }) } }) },
    })
    const { errors } = await validate(withArticle, 'article', { body }, { ...check('create'), uploads: (id) => id === 'up1', fileAlt: (id) => (id === 'up1' ? { de: 'Ein Hund' } : undefined) })
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
    ['***', 'eintrag'],
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
