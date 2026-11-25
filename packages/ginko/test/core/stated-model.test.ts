// The stored model states what Ginko once concluded from shape, order or name (design V2, section 3.2). Each test names
// the wrong behaviour it catches: the behaviour coming back from the shape instead of its key.
import { describe, expect, it } from 'vitest'
import { statusRules } from '@lupinum/ginko/patterns'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import { checkSchema, checkSite, diffSchema, entryTitle, f, navTree, resolveEntry, resolveToken, serializeSchema, single, validate, withoutUnknownRows, type Brick, type Bundle, type CollectionBrick, type Schema } from '../../src/core/index.ts'

const stored = (): Schema => structuredClone(serializeSchema(restaurant))

describe('format: the form of the stored model', () => {
  // Wrong: a platform takes a schema of another form and reads its keys as if they meant what they mean in its own,
  // or answers with a wall of problems that are not the real one.
  it.each([
    [undefined, 'The schema has no format number, so it was written by a Ginko older than this one. Update @lupinum/ginko in the site to the version of the platform (format 2) and release again.'],
    [1, 'The schema has format 1, and this Ginko reads format 2 only. Use the same version of Ginko in the site and on the platform.'],
    [3, 'The schema has format 3, and this Ginko reads format 2 only. Use the same version of Ginko in the site and on the platform.'],
  ])('refuses format %j with one sentence', (format, sentence) => {
    const schema = stored() as unknown as Record<string, unknown>
    if (format === undefined) delete schema.format
    else schema.format = format
    expect(checkSchema(schema, statusRules)).toEqual([sentence])
  })

  // Wrong: a release moves a stored model of the old form to the new one without the platform's upgrade, so its
  // stored content is read with the rules of a form it was never written in.
  it('is never changed by a release', () => {
    const old = stored() as unknown as Record<string, unknown>
    delete old.format
    expect(diffSchema(old as unknown as Schema, stored()).rejected.map((r) => r.path)).toEqual(['format'])
  })
})

describe('listing: how an entry appears in lists', () => {
  const menu = (listing: CollectionBrick['listing']): CollectionBrick => ({ ...(stored().bricks.menu as CollectionBrick), listing })
  const dish = { category: 'mains', name: { de: 'Gulasch' }, description: { de: 'Vom Rind, mit Knödel' } }

  // Wrong (guess 4): an entry is named by its first filled text field, so moving a field up renames every entry in
  // the Studio, in history lines and in search hits.
  it('names an entry by the field of listing.title, not by the first text field', () => {
    expect(entryTitle(menu({ title: 'name' }), dish, 'de')).toBe('Gulasch')
    expect(entryTitle(menu({ title: 'description' }), dish, 'de')).toBe('Vom Rind, mit Knödel')
  })

  // Wrong (guess 4): the navigation tree names a page by a field called `title`, else by its last path segment.
  it('names a page in the navigation tree by the field of listing.title', () => {
    const bundle = {
      format: 3, site: 'x', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '2026-10-11T00:00:00.000Z',
      bricks: { pages: { kind: 'collection', items: [{ id: 'about', data: { title: 'Seite 1', name: 'Über uns' }, fallback: [], urls: { de: '/ueber-uns' } }] } },
    } as unknown as Bundle
    const pages = (title: string) => ({ bricks: { pages: { kind: 'collection', label: 'Seiten', listing: { title }, fields: { title: { type: 'text', label: 'Kicker' }, name: { type: 'text', label: 'Name' } } } as unknown as Brick } })
    expect(navTree(bundle, ['pages'], 'de', pages('name')).map((n) => n.title)).toEqual(['Über uns'])
    expect(navTree(bundle, ['pages'], 'de', pages('title')).map((n) => n.title)).toEqual(['Seite 1'])
  })

  // Wrong: a collection without `listing` is accepted and its entries are named by a guess again.
  it('is required on a collection, and each key names a field of the fitting type', () => {
    const schema = stored()
    delete (schema.bricks.menu as Partial<CollectionBrick>).listing
    expect(checkSchema(schema, statusRules)).toEqual(['menu: listing is missing. Write `listing: { title: \'<field>\' }` with the field that names an entry (a text, longtext or date field).'])
    const grouped = stored()
    ;(grouped.bricks.menu as CollectionBrick).listing = { title: 'price', group: 'name' }
    expect(checkSchema(grouped, statusRules)).toEqual([
      'menu.listing.title: “price” is a money field. Name a text, longtext or date field.',
      'menu.listing.group: “name” is a text field. Name a choice field.',
    ])
  })
})

describe('tree: a collection states its navigation tree', () => {
  const bundle = {
    format: 3, site: 'x', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '2026-10-11T00:00:00.000Z',
    bricks: { docs: { kind: 'collection', items: [
      { id: 'a', data: { title: 'Start' }, fallback: [], urls: { de: '/start' } },
      { id: 'b', data: { title: 'Schlüssel', oben: 'a', parent: 'a' }, fallback: [], urls: { de: '/schluessel' } },
    ] } },
  } as unknown as Bundle
  const docs = (tree?: CollectionBrick['tree']) => ({ bricks: { docs: {
    kind: 'collection', label: 'Doku', order: 'manual', listing: { title: 'title' }, ...(tree ? { tree } : {}),
    fields: { title: { type: 'text', label: 'Titel' }, oben: { type: 'ref', label: 'Oben', to: 'docs' }, parent: { type: 'ref', label: 'Oben', to: 'docs' } },
  } as unknown as Brick } })
  const shape = (schema: ReturnType<typeof docs>) => navTree(bundle, ['docs'], 'de', schema).map((n) => [n.title, n.children.map((c) => c.title)])

  // Wrong (guess 6): a field called `parent` nests the pages of any collection, and a field with another name never does.
  it('nests pages by the field tree.parent names, and not at all without tree', () => {
    expect(shape(docs({ parent: 'oben' }))).toEqual([['Start', ['Schlüssel']]])
    expect(shape(docs())).toEqual([['Start', []], ['Schlüssel', []]])
  })

  // Wrong: a tree whose parent field points to another brick, holds several entries, or whose order is not the owner's
  // is accepted, and the Studio moves pages in an order the site does not show.
  it('needs a ref to the collection itself and the owner\'s order', () => {
    const schema = stored()
    const events = schema.bricks.events as CollectionBrick
    events.fields.up = { type: 'ref', label: 'Oben', to: 'menu' }
    events.tree = { parent: 'up', section: 'title' }
    events.order = { field: 'title' }
    expect(checkSchema(schema, statusRules)).toEqual([
      'events.tree.parent: “up” is not a ref field to events itself (one entry).',
      'events.tree: a navigation tree is sorted by hand. Write `order: \'manual\'`.',
    ])
  })
})

describe('one address field per collection', () => {
  // Wrong (guess 8): a collection with two slug fields is accepted, and the first one in field order silently becomes
  // the address of every entry.
  it('refuses a second live slug field; a retired one may stay', () => {
    const schema = stored()
    const events = schema.bricks.events as CollectionBrick
    events.fields.short = { type: 'slug', label: 'Kurzadresse', from: 'title' }
    expect(checkSchema(schema, statusRules)).toEqual(['events: a collection has one address (slug) field, not 2 (slug, short). Keep one and retire the others.'])
    ;(events.fields.short as { retired?: true }).retired = true
    schema.retired['events.short'] = { from: 'slug' }
    expect(checkSchema(schema, statusRules)).toEqual([])
  })
})

describe('task ids', () => {
  const withTasks = (tasks: unknown[]) => {
    const schema = stored()
    ;(schema.bricks.events as unknown as { tasks: unknown[] }).tasks = tasks
    return checkSchema(schema, statusRules)
  }
  const edit = (id: string, fields = ['title']) => ({ id, label: 'Bearbeiten', kind: 'edit', pick: true, fields })

  // Wrong (guess 11): the Studio cannot rely on the id `edit` (what a row opens) when any task may carry it, two tasks
  // may share an id (a grant then names both), or a task names a field the brick does not have.
  it.each([
    ['a pattern', [edit('Preis-ändern')], 'events.tasks: “Preis-ändern” is not a task id. Write a letter, then letters and digits, such as “price”.'],
    ['unique in the brick', [edit('fix'), edit('fix')], 'events.tasks: the id “fix” is used by two tasks. Give one of them another id.'],
    ['the standard ids for their kind', [{ id: 'edit', label: 'Neu', kind: 'create' }], 'events.edit: “edit” is the id of the standard edit task. Give this add task another id.'],
    ['fields that exist', [edit('fix', ['title', 'subtitle'])], 'events.fix.fields: “subtitle” is not a field of this brick.'],
  ])('are checked: %s', (_rule, tasks, problem) => {
    expect(withTasks(tasks)).toEqual([problem])
  })
})

describe('untranslated: what an entry does in a language it has no text in', () => {
  const event = { id: 'events/fest', data: { title: { de: 'Fest' }, slug: { de: 'fest' }, when: { from: '2026-12-01', to: '2026-12-01' } } }
  const resolveIn = (untranslated: 'hide' | 'fallback') => {
    const schema = stored()
    ;(schema.bricks.events as CollectionBrick).untranslated = untranslated
    return resolveEntry(schema, 'events', event, { locale: 'en', files: () => undefined })
  }

  // Wrong (guess 14): a collection with a route hides an untranslated entry and one without falls back, whatever it says.
  it('follows the key, not whether the collection has a route', () => {
    expect(resolveIn('fallback').hidden).toBe(false)
    expect(resolveIn('hide').hidden).toBe(true)
  })

  // Wrong: a site with two languages leaves the choice out and gets the route-based default again.
  it('is required when the site has more than one language', () => {
    const schema = stored()
    delete (schema.bricks.menu as CollectionBrick).untranslated
    expect(checkSchema(schema, statusRules)).toEqual(['menu: untranslated is missing. The site has more than one language, so say what an entry does in a language it has no text in: \'hide\' leaves it out there, \'fallback\' shows the main language.'])
    // With one language no entry is ever untranslated, so the key may stay out.
    expect(checkSchema({ ...schema, locales: ['de'] }, statusRules).filter((p) => p.includes('untranslated'))).toEqual([])
  })
})

describe('week: the site states its week', () => {
  // Wrong: the first day of the week comes from the language again, so a site in American English plans its lunch
  // week from Sunday although it states Monday.
  it('follows `week`, not the language', () => {
    const schema = serializeSchema({ ...restaurant, languages: { de: 'en-US', en: 'en-US' } })
    expect(checkSchema(schema, statusRules)).toEqual([])
    // Wednesday 14 October 2026.
    expect(resolveToken('@workWeek', schema.timeZone, schema.week, new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-12')
    expect(resolveToken('@workWeek', schema.timeZone, { firstDay: 'su', workdays: ['su', 'mo', 'tu', 'we', 'th', 'fr'] }, new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-11')
  })

  // Wrong: a site without a weekly brick states no week, and the Studio's Today page or the hourly reminder run
  // breaks on it (they read the week of every site).
  it('is required on every site', () => {
    const { week: _week, ...noWeek } = stored()
    const plain: Schema = { ...noWeek, bricks: { hours: { ...noWeek.bricks.hours!, status: undefined } } } as unknown as Schema
    expect(checkSchema(plain, statusRules)).toEqual(["week is missing. Write the site's week, for example `week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }`: the calendar and planned weeks start on firstDay, and rows of workdays are the workdays."])
  })
})

describe('f.rows: a fixed table is its own field type', () => {
  it('a list with min = max and a `unique` column stays a list, not fixed rows', async () => {
    const schema = serializeSchema({
      ...restaurant,
      bricks: { slots: single({ label: 'Termine', fields: { days: f.list('Termine', { itemLabel: 'Termin', min: 2, max: 2, fields: { day: f.choice('Tag', { options: ['mo', 'tu'] }) } }) } }) },
    })
    expect(schema.bricks.slots!.fields.days!.type).toBe('list')
    const asList = { days: [{ _id: 'slot000001', day: 'mo' }, { _id: 'slot000002', day: 'tu' }] }
    expect((await validate(schema, 'slots', asList, { mode: 'create' })).errors).toEqual([])
    const asRows = { days: { mo: { day: 'mo' }, tu: { day: 'tu' } } }
    expect((await validate(schema, 'slots', asRows, { mode: 'create' })).errors.map((e) => [e.path, e.code])).toEqual([['days', 'TYPE']])
    const withUnique = structuredClone(schema)
    ;(withUnique.bricks.slots!.fields.days as unknown as Record<string, unknown>).unique = 'day'
    expect(checkSchema(withUnique, statusRules)).toEqual([])
    expect((await validate(withUnique, 'slots', asRows, { mode: 'create' })).errors.map((e) => [e.path, e.code])).toEqual([['days', 'TYPE']])
  })

  // Wrong behaviour caught: a list of session times takes the same time twice (`unique` on a normal list, as a real site
  // uses it), or a rows field takes `unique` although its rows are unique by their key.
  it('a list with `unique` refuses a doubled value; a rows field with `unique` is refused', async () => {
    const schema = serializeSchema({
      ...restaurant,
      bricks: { practice: single({ label: 'Praxis', fields: { times: f.list('Zeiten', { itemLabel: 'Zeit', min: 1, max: 12, unique: 'time', fields: { time: f.time('Zeit') } }) } }) },
    })
    expect(checkSchema(schema, statusRules)).toEqual([])
    const times = (...values: string[]) => ({ times: values.map((time, i) => ({ _id: `time00000${i}`, time })) })
    expect((await validate(schema, 'practice', times('09:00', '10:00'), { mode: 'create' })).errors).toEqual([])
    expect((await validate(schema, 'practice', times('09:00', '09:00'), { mode: 'create' })).errors.map((e) => [e.path, e.code])).toEqual([['times', 'DUPLICATE']])
    const rows = stored()
    ;(rows.bricks.lunch!.fields.days as unknown as Record<string, unknown>).unique = 'dish'
    expect(checkSchema(rows, statusRules)).toContain('lunch.days: unknown property “unique”.')
  })
})

describe('f.rows: rows of workdays and retired rows', () => {
  // Wrong: a field-level default on workday rows names rows the week later drops or lacks, so a new workday starts empty.
  it('refuses a field default on rows of workdays; rows of weekdays keep it', () => {
    const schema = stored()
    const days = schema.bricks.lunch!.fields.days as Extract<Schema['bricks'][string]['fields'][string], { type: 'rows' }>
    days.default = {}
    expect(checkSchema(schema, statusRules)).toEqual(["lunch.days: rows of workdays follow the site's week, so they take no default. Give the columns defaults instead (each new row starts with them)."])
    // Rows of weekdays take a default, so it is checked like any value (here it lacks every row).
    days.rows = 'weekdays'
    expect(checkSchema(schema, statusRules)).toContain('lunch.days.default.su: “Tage”: the row “su” is missing.')
    expect(checkSchema(schema, statusRules).filter((p) => p.includes('take no default'))).toEqual([])
  })

  // Wrong: a retired line that names no row, or a row the field still has, is taken and the release drops live data.
  it.each([
    ['lunch.days.fr', { drop: true }, 'retired: “lunch.days.fr” is still a row of the field. Retire a row only when the field no longer has it.'],
    ['lunch.days.sa', { value: 1 }, 'retired: the row “lunch.days.sa” takes { drop: true }.'],
    ['hours.closedNote.x', { drop: true }, "retired: “hours.closedNote.x” names no row of a rows field. Write `brick.field.row`, such as 'team.shifts.mo'."],
  ] as const)('refuses retired “%s” %j', (path, rule, sentence) => {
    const schema = stored()
    schema.retired[path] = rule as Schema['retired'][string]
    expect(checkSchema(schema, statusRules)).toEqual([sentence])
  })
})

describe('f.rows: what the website reads', () => {
  const day = (dish: string) => ({ dish: { de: dish }, allergens: [] })
  // As Convex stores it: keys sorted, and a Saturday the field no longer has (retired, or from an old backup).
  const days = { fr: day('Fisch'), mo: day('Suppe'), sa: day('Alt'), th: day('Knödel'), tu: day('Gulasch'), we: day('Strudel') }

  // Wrong: the lunch week reads "Freitag, Montag, Samstag, …" (the stored order), or shows a day the restaurant dropped.
  it('gives the rows the field has, in its order, and leaves a stored row it no longer has out', () => {
    const { data } = resolveEntry(stored(), 'lunch', { id: 'lunch', data: { weekOf: '2026-10-05', days } }, { locale: 'de', files: () => undefined })
    expect(Object.keys(data.days as object)).toEqual(['mo', 'tu', 'we', 'th', 'fr'])
  })

  // Wrong: a backup made before a row was retired brings the row back into the stored entry.
  it('a restore drops a row the field no longer has, with its warning', async () => {
    const schema = stored()
    const { errors, warnings } = await validate(schema, 'lunch', { weekOf: '2026-10-05', days }, { mode: 'shape' })
    expect([errors, warnings.map((w) => [w.path, w.code])]).toEqual([[], [['days.sa', 'UNKNOWN_ROW']]])
    expect(Object.keys(withoutUnknownRows(schema.bricks.lunch!.fields, { days }, schema.week).days as object).sort()).toEqual(['fr', 'mo', 'th', 'tu', 'we'])
  })
})

describe('body: the field the text of a file fills', () => {
  // Wrong: the text below the front matter goes into the brick's one markdown field although the brick never said so.
  it('is stated on a file brick, and refused when it names no markdown field', () => {
    const schema = stored()
    const about: Brick = { kind: 'single', label: 'Seite', source: 'files', fields: { title: { type: 'text', label: 'Titel' }, story: { type: 'markdown', label: 'Text' } } }
    schema.bricks.about = about
    expect(checkSchema(schema, statusRules)).toEqual(["about.story: in a file brick, a markdown field is the text of the file. Write `body: 'story'` (one markdown field per file brick)."])
    schema.bricks.about = { ...about, body: 'story' }
    expect(checkSchema(schema, statusRules)).toEqual([])
    schema.bricks.about = { ...about, body: 'title' }
    expect(checkSchema(schema, statusRules)).toContain('about.body: “title” is not a markdown field of this brick.')
  })
})

describe('time zone and languages have no default (5.4)', () => {
  // Wrong: a site without a time zone or languages is read as Vienna and German, or the check crashes on it.
  it.each([
    ['locales', "locales is missing. Write the site's languages, the main language first, for example `locales: ['de', 'en']`."],
    ['timeZone', "timeZone is missing. Write the site's time zone, for example `timeZone: 'Europe/Vienna'`: Ginko counts today, the week and planned dates in it."],
  ] as const)('a site without %s is refused with one sentence', (key, sentence) => {
    const site = { ...restaurant } as Record<string, unknown>
    delete site[key]
    expect(checkSite(site as unknown as typeof restaurant, statusRules)).toEqual([sentence])
  })

  it('a stored schema without a time zone is refused', () => {
    const schema = stored() as Partial<Schema>
    delete schema.timeZone
    expect(checkSchema(schema, statusRules)).toContain("timeZone is missing. Write the site's time zone, for example `timeZone: 'Europe/Vienna'`: Ginko counts today, the week and planned dates in it.")
  })
})

describe('preview: the page the Studio opens for an entry', () => {
  // Wrong: a brick's preview names a page the site does not have, or a brick with pages of its own names another page,
  // and the preview opens the start page or the wrong page without a word.
  it('names a key of pages, and only on a brick without route', () => {
    const schema = stored()
    schema.bricks.menu = { ...schema.bricks.menu!, preview: 'karte' }
    expect(checkSchema(schema, statusRules)).toEqual([`menu.preview: “karte” is not a key of pages. Write one of ${Object.keys(schema.pages).join(', ')}.`])
    schema.bricks.menu = { ...schema.bricks.menu!, preview: 'menu' }
    schema.bricks.events = { ...schema.bricks.events!, preview: 'menu' }
    expect(checkSchema(schema, statusRules)).toEqual(['events.preview: the entries of “events” have pages of their own (route), so the preview opens them. Leave preview out.'])
  })
})

describe('publishedOn: the day an entry was published', () => {
  // Wrong: publishedOn names a field that is no date (or a date range), so the notes and later the Studio read a
  // value that is no day.
  it('names a live date field of the collection', () => {
    const schema = stored()
    const events = schema.bricks.events as CollectionBrick
    schema.bricks.events = { ...events, publishedOn: 'when' }
    expect(checkSchema(schema, statusRules)).toEqual(["events.publishedOn: “when” is no date field of the brick. Name the date field that holds the day an entry was published, such as 'date'."])
    schema.bricks.events = { ...events, fields: { ...events.fields, published: { type: 'date', label: 'Veröffentlicht' } }, publishedOn: 'published' }
    expect(checkSchema(schema, statusRules)).toEqual([])
  })
})
