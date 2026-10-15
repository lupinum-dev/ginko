import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import {
  checkSchema, coreMessage, diffSchema, migrationFingerprint, ordered, serializeSchema,
  type MigrationDescriptor, type ChoiceOption, type Schema, type SiteInput,
} from '../../src/core/index.ts'

// The production baseline is the restaurant config as the platform stores it (SPEC 13).
const base = (): Schema => structuredClone(serializeSchema(restaurant))

// Mutable JSON node at a dotted path, e.g. node(s, 'bricks.seo.fields.title').
function node(s: Schema, path: string): Record<string, unknown> {
  let cur: unknown = s
  for (const key of path.split('.')) cur = (cur as Record<string, unknown>)[key]
  return cur as Record<string, unknown>
}
const fieldsOf = (s: Schema, brick: string) => node(s, `bricks.${brick}.fields`)
const field = (s: Schema, path: string) => {
  const [brick, name] = path.split('.')
  return node(s, `bricks.${brick}.fields.${name}`)
}
const retire = (s: Schema, path: string, rule: Schema['retired'][string]) => {
  field(s, path).retired = true
  s.retired[path] = rule
}

function migration(id: string, brick: string, fills: string, compute: (entry: Record<string, unknown>) => unknown): MigrationDescriptor {
  return { id, brick, fills, fingerprint: migrationFingerprint(brick, fills, compute) }
}

// A production schema that already runs a migration and the field it filled.
const withTagMigration = (s: Schema) => {
  fieldsOf(s, 'menu').tag = { type: 'text', label: 'Kennzeichnung', max: 40 }
  s.migrations.push(migration('2026-11-menu-tag-from-name', 'menu', 'tag', (e) => e.name))
}

interface Row {
  name: string
  /** Edits the production schema before the change (default: none). */
  prod?: (s: Schema) => void
  /** Edits the next schema, derived from production. */
  mutate: (s: Schema) => void
}
interface RejectedRow extends Row { kind: string }

// SPEC 2.4, "Erlaubt": every row must produce no rejection.
const allowed: Row[] = [
  { name: 'an unchanged schema', mutate: () => {} },
  {
    name: 'a new single brick with only optional fields',
    mutate: (s) => { s.bricks.extra = { kind: 'single', label: 'Extra', fields: { note: { type: 'text', label: 'Notiz', max: 50, optional: true } } } },
  },
  {
    name: 'a new single brick with a required field that has a default',
    mutate: (s) => { s.bricks.extra = { kind: 'single', label: 'Extra', fields: { count: { type: 'number', label: 'Anzahl', min: 0, max: 10, step: 1, default: 1 } } } },
  },
  {
    name: 'a new optional field on a collection',
    mutate: (s) => { fieldsOf(s, 'menu').note = { type: 'text', label: 'Notiz', max: 100, optional: true } },
  },
  {
    name: 'a new required field with a default',
    mutate: (s) => { fieldsOf(s, 'menu').badge = { type: 'text', label: 'Plakette', max: 40, default: { de: 'neu' } } },
  },
  {
    name: 'a new required field filled by a new migration',
    mutate: (s) => {
      fieldsOf(s, 'menu').tag = { type: 'text', label: 'Kennzeichnung', max: 40 }
      s.migrations.push(migration('2026-11-menu-tag-from-name', 'menu', 'tag', (e) => e.name))
    },
  },
  {
    name: 'a migration that is dropped from the config',
    prod: withTagMigration,
    mutate: (s) => { s.migrations = [] },
  },
  {
    name: 'a new choice option',
    mutate: (s) => { (field(s, 'menu.category').options as ChoiceOption[]).push({ value: 'sides', label: 'Beilagen' }) },
  },
  {
    name: 'a choice option label renamed',
    mutate: (s) => { (field(s, 'menu.category').options as ChoiceOption[]).find((o) => o.value === 'starters')!.label = 'Vorspeise' },
  },
  { name: 'a list min lowered', mutate: (s) => { field(s, 'lunch.days').min = 4 } },
  { name: 'a number min lowered', mutate: (s) => { field(s, 'hours.holidayNoticeDays').min = -5 } },
  { name: 'a field max raised', mutate: (s) => { field(s, 'seo.title').max = 90 } },
  { name: 'a list max raised', mutate: (s) => { field(s, 'hours.exceptions').max = 25 } },
  { name: 'a collection max raised', mutate: (s) => { node(s, 'bricks.menu').max = 200 } },
  { name: 'unique removed from a list', mutate: (s) => { delete field(s, 'lunch.days').unique } },
  { name: 'a new locale appended at the end', mutate: (s) => { s.locales = ['de', 'en', 'fr'] } },
  {
    name: 'a route added to a collection that had none',
    mutate: (s) => { node(s, 'bricks.notices').route = { de: '/hinweise/[slug]', en: '/en/hinweise/[slug]' } },
  },
  {
    name: 'visible and order changed',
    mutate: (s) => {
      node(s, 'bricks.events').visible = { mode: 'always' }
      node(s, 'bricks.events').order = { field: 'when', dir: 'desc' }
    },
  },
  {
    name: 'drafts turned on for a collection',
    mutate: (s) => { node(s, 'bricks.menu').drafts = true },
  },
  {
    name: 'labels, hints, describe and itemLabel changed',
    mutate: (s) => {
      node(s, 'bricks.menu').label = 'Gerichte'
      node(s, 'bricks.menu').describe = 'Alle Gerichte der Karte'
      field(s, 'seo.title').label = 'Seitentitel'
      field(s, 'hours.closedNote').hint = 'Erscheint auf der Startseite'
      node(s, 'bricks.hours.fields.week').itemLabel = 'Wochentag'
    },
  },
  {
    name: 'field group and brick layout added, changed or removed',
    mutate: (s) => {
      field(s, 'seo.title').group = 'SEO'
      node(s, 'bricks.menu').layout = 'tabs'
    },
  },
  { name: 'needsApproval set on a task', mutate: (s) => { (node(s, 'bricks.hours').tasks as { needsApproval?: boolean }[])[0]!.needsApproval = true } },
  { name: 'agent review switched on', mutate: (s) => { s.agents = { review: true } } },
  { name: 'tasks changed', mutate: (s) => { node(s, 'bricks.hours').tasks = [] } },
  { name: 'static pages changed', mutate: (s) => { s.pages.neu = { de: '/neu' } } },
  {
    name: 'site name and url changed',
    mutate: (s) => { s.name = 'Neuer Name'; s.url = 'https://example.org' },
  },
  {
    name: 'a new retired entry',
    mutate: (s) => { retire(s, 'seo.description', { value: { de: 'Alt' } }) },
  },
]

// SPEC 2.4, "Abgelehnt": every row must produce exactly the expected rejection kind.
const rejected: RejectedRow[] = [
  {
    name: 'a new single brick with a required field without default',
    mutate: (s) => { s.bricks.extra = { kind: 'single', label: 'Extra', fields: { note: { type: 'text', label: 'Notiz', max: 50 } } } },
    kind: 'singleWithoutDefault',
  },
  {
    name: 'a new required field in a collection without default or migration',
    mutate: (s) => { fieldsOf(s, 'menu').tag = { type: 'text', label: 'Kennzeichnung', max: 40 } },
    kind: 'requiredWithoutDefault',
  },
  { name: 'a field removed without retired', mutate: (s) => { delete fieldsOf(s, 'menu').name }, kind: 'fieldRemoved' },
  { name: 'a brick removed without retired', mutate: (s) => { delete s.bricks.legal }, kind: 'brickRemoved' },
  { name: 'a field type changed', mutate: (s) => { field(s, 'seo.title').type = 'longtext' }, kind: 'typeChanged' },
  { name: 'an optional field made required', mutate: (s) => { delete field(s, 'seo.image').optional }, kind: 'madeRequired' },
  {
    name: 'a choice option removed',
    mutate: (s) => { field(s, 'menu.category').options = (field(s, 'menu.category').options as ChoiceOption[]).filter((o) => o.value !== 'drinks') },
    kind: 'optionRemoved',
  },
  { name: 'a field max lowered', mutate: (s) => { field(s, 'seo.title').max = 60 }, kind: 'maxLowered' },
  { name: 'a list min raised', mutate: (s) => { field(s, 'hours.exceptions').min = 1 }, kind: 'minRaised' },
  { name: 'a number min raised', mutate: (s) => { field(s, 'hours.holidayNoticeDays').min = 1 }, kind: 'minRaised' },
  { name: 'a number step changed', mutate: (s) => { field(s, 'hours.holidayNoticeDays').step = 0.5 }, kind: 'stepChanged' },
  { name: 'translatability changed', mutate: (s) => { field(s, 'seo.title').translate = false }, kind: 'translationChanged' },
  { name: 'money currency changed', mutate: (s) => { field(s, 'menu.price').currency = 'CHF' }, kind: 'currencyChanged' },
  { name: 'a locale removed', mutate: (s) => { s.locales = ['de'] }, kind: 'localeRemoved' },
  {
    name: 'a route changed',
    mutate: (s) => { node(s, 'bricks.events.route').de = '/termine/[slug]' },
    kind: 'routeChanged',
  },
  {
    name: 'a retired entry removed',
    prod: (s) => { retire(s, 'seo.description', { value: { de: 'Alt' } }) },
    mutate: (s) => { delete s.retired['seo.description'] },
    kind: 'unretired',
  },
  {
    name: 'a retired entry changed',
    prod: (s) => { retire(s, 'seo.description', { value: { de: 'Alt' } }) },
    mutate: (s) => { s.retired['seo.description'] = { value: { de: 'Neu' } } },
    kind: 'retiredChanged',
  },
  {
    name: 'a retired field made live again while its rule stays',
    prod: (s) => { retire(s, 'seo.description', { value: { de: 'Alt' } }) },
    mutate: (s) => { delete field(s, 'seo.description').retired },
    kind: 'unretired',
  },
  { name: 'a default changed', mutate: (s) => { field(s, 'seo.title').default = { de: 'Anders' } }, kind: 'defaultChanged' },
  { name: 'the site currency changed', mutate: (s) => { s.currency = 'CHF' }, kind: 'currency' },
  {
    name: 'a known migration with a changed fingerprint',
    prod: withTagMigration,
    mutate: (s) => { s.migrations[0] = migration('2026-11-menu-tag-from-name', 'menu', 'tag', (e) => e.description) },
    kind: 'migrationChanged',
  },
  {
    name: 'a known migration that fills another field',
    prod: withTagMigration,
    mutate: (s) => { s.migrations[0] = { ...s.migrations[0]!, fills: 'name' } },
    kind: 'migrationChanged',
  },
  {
    name: 'a new migration that fills an existing field',
    mutate: (s) => { s.migrations.push(migration('2026-12-seo-title-copy', 'seo', 'title', (e) => e.description)) },
    kind: 'migrationFillsExisting',
  },
  { name: 'unique added to a list', mutate: (s) => { field(s, 'hours.exceptions').unique = 'reason' }, kind: 'uniqueChanged' },
  { name: 'unique changed on a list', mutate: (s) => { field(s, 'lunch.days').unique = 'dish' }, kind: 'uniqueChanged' },
  {
    name: 'a locale reordered (main language unchanged)',
    prod: (s) => { s.locales = ['de', 'en', 'fr'] },
    mutate: (s) => { s.locales = ['de', 'fr', 'en'] },
    kind: 'localeOrder',
  },
]

function applyRow(row: Row): { prod: Schema; next: Schema } {
  const prod = base()
  row.prod?.(prod)
  const next = structuredClone(prod)
  row.mutate(next)
  return { prod, next }
}

describe('diffSchema: allowed changes (SPEC 2.4)', () => {
  it.each(allowed)('allows: $name', (row) => {
    const { prod, next } = applyRow(row)
    expect(diffSchema(prod, next).rejected).toEqual([])
  })
})

describe('diffSchema: rejected changes (SPEC 2.4)', () => {
  it.each(rejected)('rejects with kind $kind: $name', (row) => {
    const { prod, next } = applyRow(row)
    const { rejected: found } = diffSchema(prod, next)
    expect(found.map((r) => r.kind)).toEqual([row.kind])
    // Wrong behaviour caught: a rejection that does not tell the developer the allowed way out.
    for (const r of found) expect(r.fix?.trim()).toBeTruthy()
  })

  // SPEC 2.4: a changed main language is rejected. The code also reports localeOrder,
  // because every old locale moved. Both are rejections; this test checks the main-language one.
  it('rejects a changed main language', () => {
    const next = base()
    next.locales = ['en', 'de']
    expect(diffSchema(base(), next).rejected.map((r) => r.kind)).toContain('mainLocale')
  })

  // Wrong behaviour caught: a rejection that is German text only, so a reader of another language gets no translation,
  // or advice that names the agency instead of "your developer".
  it('carries a catalog key with parameters, and the advice is the same for every site', () => {
    const next = base()
    next.locales = ['en', 'de']
    const change = diffSchema(base(), next).rejected.find((r) => r.kind === 'mainLocale')!
    expect(change).toMatchObject({ key: 'diff.mainLocaleChanged', message: 'Die Hauptsprache kann nicht geändert werden.', fixMsg: { key: 'diff.fix.planMigration' } })
    expect(coreMessage('en', change.key, change.params)).toBe('The main language cannot be changed.')
    expect(coreMessage('en', change.fixMsg!.key)).toBe('Plan a migration with your developer.')
    expect(change.fix).toBe('Mit eurer Entwicklerin oder eurem Entwickler eine Migration planen.')

    const gone = base()
    gone.locales = ['de']
    const removed = diffSchema(base(), gone).rejected.find((r) => r.kind === 'localeRemoved')!
    expect(coreMessage('en', removed.key, removed.params)).toBe('Language “en” cannot be removed.')
  })
})

describe('migrations (SPEC 2.4, 2.6)', () => {
  it('changes the fingerprint when a string literal inside from changes', () => {
    const before = migrationFingerprint('menu', 'tag', (e: Record<string, unknown>) => e.name ?? 'Alt')
    const after = migrationFingerprint('menu', 'tag', (e: Record<string, unknown>) => e.name ?? 'Neu')
    expect(after).not.toBe(before)
  })

  it('keeps the fingerprint when from is unchanged', () => {
    const from = (e: Record<string, unknown>) => e.name ?? 'Alt'
    expect(migrationFingerprint('menu', 'tag', from)).toBe(migrationFingerprint('menu', 'tag', from))
  })
})

describe('serializeSchema', () => {
  // Convex stores objects with sorted keys; without pos every form would list fields alphabetically.
  it('keeps the config order of bricks, fields and list columns through a key-sorting store', () => {
    const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)])) : v
    const stored = sortKeys(serializeSchema(restaurant)) as Schema
    expect(ordered(stored.bricks).map(([k]) => k)).toEqual(Object.keys(restaurant.bricks))
    expect(ordered(stored.bricks.menu!.fields).map(([k]) => k)).toEqual(Object.keys(restaurant.bricks.menu.fields))
    const week = stored.bricks.hours!.fields.week as Extract<Schema['bricks'][string]['fields'][string], { type: 'list' }>
    expect(ordered(week.of).map(([k]) => k)).toEqual(['day', 'closed', 'from1', 'to1', 'from2', 'to2'])
  })

  it('treats a changed position as presentation, not as a schema change', () => {
    const next = base()
    field(next, 'menu.name').pos = 0
    field(next, 'menu.category').pos = 1
    node(next, 'bricks.seo').pos = 0
    expect(diffSchema(base(), next).rejected).toEqual([])
  })

  it('produces plain JSON that survives a round trip, with migrations as descriptors', () => {
    const site: SiteInput = {
      ...restaurant,
      migrations: { '2026-11-menu-tag-from-name': { brick: 'menu', fills: 'tag', compute: (e) => e.name } },
    }
    const out = serializeSchema(site)
    expect(out.migrations).toEqual([
      { id: '2026-11-menu-tag-from-name', brick: 'menu', fills: 'tag', fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ])
    expect(JSON.parse(JSON.stringify(out))).toStrictEqual(out)
  })

  it('marks retired fields and whole bricks with retired: true', () => {
    const site: SiteInput = { ...restaurant, retired: { 'seo.description': { value: { de: 'Alt' } }, gallery: { drop: true } } }
    const out = serializeSchema(site)
    expect(out.bricks.seo?.fields.description?.retired).toBe(true)
    expect(out.bricks.seo?.fields.title?.retired).toBeUndefined()
    expect(out.bricks.gallery).toHaveProperty('retired', true)
    expect(out.retired).toStrictEqual({ 'seo.description': { value: { de: 'Alt' } }, gallery: { drop: true } })
  })

  it('sorts migrations by id', () => {
    const site: SiteInput = {
      ...restaurant,
      migrations: {
        '2026-12-b-second': { brick: 'menu', fills: 'tag', compute: (e) => e.name },
        '2026-11-a-first': { brick: 'menu', fills: 'note', compute: (e) => e.name },
      },
    }
    expect(serializeSchema(site).migrations.map((m) => m.id)).toEqual(['2026-11-a-first', '2026-12-b-second'])
  })
})

describe('checkSchema: retired fields (SPEC 2.5)', () => {
  it('accepts the untouched restaurant config', () => {
    expect(checkSchema(base())).toEqual([])
  })

  it('accepts a mirror whose source is an identical copy', () => {
    const s = base()
    fieldsOf(s, 'seo').titleCopy = { ...field(s, 'seo.title') }
    retire(s, 'seo.title', { from: 'titleCopy' })
    expect(checkSchema(s)).toEqual([])
  })

  it.each([
    {
      name: 'a mirror source that is optional while the old field is required',
      mutate: (s: Schema) => {
        fieldsOf(s, 'seo').subtitle = { type: 'text', label: 'Untertitel', max: 70, optional: true }
        retire(s, 'seo.title', { from: 'subtitle' })
      },
      problems: ['retired: “seo.title” cannot mirror “subtitle”: the source is optional, the old field is required.'],
    },
    {
      name: 'a mirror source that allows longer text',
      mutate: (s: Schema) => { retire(s, 'seo.title', { from: 'description' }) },
      problems: ['retired: “seo.title” cannot mirror “description”: the source allows values outside the old limits.'],
    },
    {
      name: 'a mirror source with a choice option the old field does not know',
      mutate: (s: Schema) => {
        fieldsOf(s, 'menu').vegSource = { type: 'choice', label: 'Vegetarisch Quelle', options: [{ value: 'none', label: 'keins' }, { value: 'vegetarian', label: 'vegetarisch' }, { value: 'vegan', label: 'vegan' }, { value: 'raw', label: 'roh' }] }
        retire(s, 'menu.veg', { from: 'vegSource' })
        // A new required field must be asked by the dish-adding task (create task `fields`).
        for (const task of s.bricks.menu!.tasks ?? []) if (task.kind === 'create' && task.fields) task.fields = [...task.fields.filter(f => f !== 'veg'), 'vegSource']
      },
      problems: ['retired: “menu.veg” cannot mirror “vegSource”: the source has options the old field does not know.'],
    },
    {
      // Wrong behaviour caught: a wider Markdown profile feeds tables or components into a field that cannot show them.
      name: 'a mirror source that allows more Markdown than the old field (profile)',
      mutate: (s: Schema) => {
        fieldsOf(s, 'seo').textOld = { type: 'markdown', label: 'Text alt', profile: 'basic', optional: true }
        fieldsOf(s, 'seo').textNew = { type: 'markdown', label: 'Text neu', profile: 'page', optional: true }
        retire(s, 'seo.textOld', { from: 'textNew' })
      },
      problems: ['retired: “seo.textOld” cannot mirror “textNew”: the source allows more markdown (profile).'],
    },
    {
      name: 'a mirror list with other columns',
      mutate: (s: Schema) => {
        fieldsOf(s, 'hours').weekAlt = { type: 'list', label: 'Alt', itemLabel: 'Tag', max: 7, of: { day: { type: 'choice', label: 'Tag', options: [{ value: 'mo', label: 'Montag' }] } } }
        retire(s, 'hours.exceptions', { from: 'weekAlt' })
      },
      problems: ['retired: “hours.exceptions” cannot mirror “weekAlt”: different columns.'],
    },
    {
      name: 'a value rule that fails validation',
      mutate: (s: Schema) => { retire(s, 'seo.description', { value: { de: 'x'.repeat(161) } }) },
      problems: ['retired.seo.description.de: “Beschreibung” is too long (at most 160 characters).'],
    },
    {
      name: 'a required retired field with drop',
      mutate: (s: Schema) => { retire(s, 'seo.title', { drop: true }) },
      problems: ['retired: required field “seo.title” needs from or value, not drop.'],
    },
    {
      name: 'an empty rule (the form before drop)',
      mutate: (s: Schema) => { retire(s, 'seo.description', {} as never) },
      problems: ['retired: “seo.description” needs exactly one of { from }, { value } or { drop: true }.'],
    },
    {
      name: 'a retired brick with a value rule',
      mutate: (s: Schema) => { s.bricks.gallery!.retired = true; s.retired.gallery = { value: 1 } },
      problems: ['retired: brick “gallery” takes { drop: true }.'],
    },
    {
      name: 'a sort direction other than asc or desc',
      mutate: (s: Schema) => { Object.assign(s.bricks.events!, { order: { field: 'when', dir: 'up' } }) },
      problems: ['events: order.dir must be “asc” or “desc”.'],
    },
  ])('reports: $name', ({ mutate, problems }) => {
    const s = base()
    mutate(s)
    expect(checkSchema(s)).toEqual(problems)
  })

  // A unique source only holds values the old, non-unique list also accepts.
  it('SPEC 2.5: a unique source may mirror an old list without unique', () => {
    const s = base()
    fieldsOf(s, 'lunch').daysOld = { ...field(s, 'lunch.days') }
    delete (fieldsOf(s, 'lunch').daysOld as Record<string, unknown>).unique
    retire(s, 'lunch.daysOld', { from: 'days' })
    expect(checkSchema(s)).toEqual([])
  })
})

describe('checkSchema: limits and structure (SPEC 2.1)', () => {
  it.each([
    {
      name: 'a 31st brick',
      mutate: (s: Schema) => {
        for (let i = 0; i < 23; i++) s.bricks[`extra${i}`] = { kind: 'single', label: 'Extra', fields: {} }
      },
      problems: ['Too many bricks (at most 30).'],
    },
    {
      name: 'a brick key with a capital letter',
      mutate: (s: Schema) => { s.bricks.Hours = s.bricks.hours!; delete s.bricks.hours },
      problems: ['Invalid brick name “Hours”.'],
    },
    {
      name: 'a field name with a capital letter',
      mutate: (s: Schema) => { fieldsOf(s, 'hours').Note = { type: 'text', label: 'Notiz', max: 50 } },
      problems: ['hours: invalid field name “Note”.'],
    },
    {
      name: 'a field named _id',
      mutate: (s: Schema) => { fieldsOf(s, 'hours')._id = { type: 'text', label: 'Kennung', max: 50 } },
      problems: ['hours: invalid field name “_id”.'],
    },
    {
      name: 'a list inside a list',
      mutate: (s: Schema) => { node(s, 'bricks.hours.fields.week.of').inner = { type: 'list', label: 'Innen', itemLabel: 'Zeile', max: 2, of: {}, optional: true } },
      problems: ['hours.week.inner: lists cannot be nested.'],
    },
    {
      name: 'a slug field in a single brick',
      mutate: (s: Schema) => { fieldsOf(s, 'hours').slug = { type: 'slug', label: 'Adresse', from: 'closedNote' } },
      problems: ['hours: single bricks have no address (slug).'],
    },
    {
      name: 'a route without [slug]',
      mutate: (s: Schema) => { node(s, 'bricks.events.route').de = '/veranstaltungen' },
      problems: ['events: route for “de” is missing or has no [slug].'],
    },
    {
      name: 'a route missing for one locale',
      mutate: (s: Schema) => { delete node(s, 'bricks.events.route').en },
      problems: ['events: route for “en” is missing or has no [slug].'],
    },
    {
      name: 'a brick with more than 60 fields',
      mutate: (s: Schema) => {
        for (let i = 0; i < 60; i++) fieldsOf(s, 'gallery')[`f${i}`] = { type: 'boolean', label: 'Feld' }
      },
      problems: ['gallery: too many fields.'],
    },
    {
      name: 'a schema without week',
      mutate: (s: Schema) => { delete (s as Partial<Schema>).week },
      problems: ['week must be { firstDay: 1 to 7, weekend: [days 1 to 7] } (1 = Monday, 7 = Sunday).'],
    },
    {
      name: 'a schema over 256 KiB of ASCII',
      mutate: (s: Schema) => { node(s, 'bricks.hours').label = 'x'.repeat(270_000) },
      problems: ['The schema is too large (at most 256 KiB).'],
    },
  ])('reports: $name', ({ mutate, problems }) => {
    const s = base()
    mutate(s)
    expect(checkSchema(s)).toEqual(problems)
  })

  // SPEC 2.1: Schema-JSON ≤ 256 KiB (bytes); code does compare JSON.stringify(...).length, i.e. UTF-16 characters, so multi-byte text is under-counted.
  it('SPEC 2.1: the 256 KiB limit counts bytes, so 140 000 umlauts (280 000 bytes) fail', () => {
    const s = base()
    node(s, 'bricks.hours').label = 'ä'.repeat(140_000)
    expect(checkSchema(s)).toEqual(['The schema is too large (at most 256 KiB).'])
  })
})
