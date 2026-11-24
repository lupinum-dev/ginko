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
  // The option stores no data, so adding it to a choices field that production already has is free.
  { name: 'askAgainWhen added to a choices field', prod: (s) => { delete field(s, 'menu.allergens').askAgainWhen }, mutate: (s) => { field(s, 'menu.allergens').askAgainWhen = 'name' } },
  { name: 'askAgainWhen removed from a choices field', mutate: (s) => { delete field(s, 'menu.allergens').askAgainWhen } },
  { name: 'a list min lowered', prod: (s) => { field(s, 'hours.exceptions').min = 2 }, mutate: (s) => { field(s, 'hours.exceptions').min = 1 } },
  { name: 'a number min lowered', mutate: (s) => { field(s, 'hours.holidayNoticeDays').min = -5 } },
  { name: 'a field max raised', mutate: (s) => { field(s, 'seo.title').max = 90 } },
  { name: 'a list max raised', mutate: (s) => { field(s, 'hours.exceptions').max = 25 } },
  { name: 'unique removed from a list', prod: (s) => { field(s, 'hours.exceptions').unique = 'reason' }, mutate: (s) => { delete field(s, 'hours.exceptions').unique } },
  { name: 'a collection max raised', mutate: (s) => { node(s, 'bricks.menu').max = 200 } },
  // An added row is like a new required field: allowed when the columns' defaults fill it.
  { name: 'a row added to a rows field, filled from the column defaults', prod: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }] }, mutate: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }, { key: 'tu', label: 'Dienstag' }] } },
  { name: 'a workday added to the site week: the lunch week gains a row filled from the column defaults', mutate: (s) => { s.week = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr', 'sa'] } } },
  // A removed row is stated in retired, the same place a removed field is stated; the release then drops it.
  { name: 'a workday removed from the site week, with its retired line', mutate: (s) => { s.week = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th'] }; s.retired['lunch.days.fr'] = { drop: true }; s.retired['lunchPlans.days.fr'] = { drop: true } } },
  { name: 'a row removed from an own row list, with its retired line', prod: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }, { key: 'tu', label: 'Dienstag' }] }, mutate: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }]; s.retired['lunch.days.tu'] = { drop: true } } },
  // The row came back, so its retired line may go: the row is an added row again, filled from the column defaults.
  { name: 'a retired row that comes back, its retired line removed', prod: (s) => { s.week = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th'] }; s.retired['lunch.days.fr'] = { drop: true }; s.retired['lunchPlans.days.fr'] = { drop: true } }, mutate: (s) => { s.week = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }; delete s.retired['lunch.days.fr']; delete s.retired['lunchPlans.days.fr'] } },
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
  // 0.12 and older stored `drafts` (true or false); the next release leaves it out (SPEC 15, every collection has drafts).
  {
    name: 'drafts, stored by an older release, left out',
    prod: (s) => { node(s, 'bricks.menu').drafts = false; node(s, 'bricks.events').drafts = true },
    mutate: (s) => { delete node(s, 'bricks.menu').drafts; delete node(s, 'bricks.events').drafts },
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
  { name: 'a status line added', mutate: (s) => { node(s, 'bricks.events').status = { next: 'when' } } },
  { name: 'a status line removed', prod: (s) => { node(s, 'bricks.events').status = { next: 'when' } }, mutate: (s) => { delete node(s, 'bricks.events').status } },
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
  // A removed row is like a removed field: stored rows would lose their values unless retired says so.
  { name: 'a workday removed from the site week without a retired line (lunchPlans has its line)', mutate: (s) => { s.week = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th'] }; s.retired['lunchPlans.days.fr'] = { drop: true } }, kind: 'rowRemoved' },
  { name: 'unique added to a list', mutate: (s) => { field(s, 'hours.exceptions').unique = 'reason' }, kind: 'uniqueChanged' },
  { name: 'unique changed on a list', prod: (s) => { field(s, 'hours.exceptions').unique = 'reason' }, mutate: (s) => { field(s, 'hours.exceptions').unique = 'when' }, kind: 'uniqueChanged' },
  { name: 'a row removed from a rows field', prod: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }, { key: 'tu', label: 'Dienstag' }] }, mutate: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }] }, kind: 'rowRemoved' },
  // An added row is like a new required field: refused when a required column has no default to fill it.
  {
    name: 'a row added to a rows field whose required column has no default',
    prod: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }]; delete node(s, 'bricks.lunch.fields.days.of.dish').default },
    mutate: (s) => { field(s, 'lunch.days').rows = [{ key: 'mo', label: 'Montag' }, { key: 'tu', label: 'Dienstag' }]; delete node(s, 'bricks.lunch.fields.days.of.dish').default },
    kind: 'rowWithoutDefault',
  },
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

describe('diffSchema: a removed row', () => {
  // Wrong: the refusal names a fix the developer cannot follow (keep a workday the restaurant no longer opens on).
  it('is refused with one sentence that shows the retired line to write', () => {
    const next = base()
    next.week = { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th'] }
    next.retired['lunchPlans.days.fr'] = { drop: true }
    const [change] = diffSchema(base(), next).rejected
    expect(coreMessage('en', change!.fixMsg!.key, change!.fixMsg!.params)).toBe("Keep the row, or write `retired: { 'lunch.days.fr': { drop: true } }`: the release then removes it from every stored entry.")
    expect(change!.snippet).toBe("retired: { 'lunch.days.fr': { drop: true } },")
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
    const week = stored.bricks.hours!.fields.week as Extract<Schema['bricks'][string]['fields'][string], { type: 'rows' }>
    expect(ordered(week.of).map(([k]) => k)).toEqual(['closed', 'from1', 'to1', 'from2', 'to2'])
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

  // A unique source only holds values the old, non-unique list also accepts.
  it('SPEC 2.5: a unique source may mirror an old list without unique', () => {
    const s = base()
    const times = (unique?: string) => ({ type: 'list', label: 'Zeiten', itemLabel: 'Zeit', max: 12, optional: true, ...(unique ? { unique } : {}), of: { at: { type: 'time', label: 'Zeit' } } })
    fieldsOf(s, 'hours').timesOld = times()
    fieldsOf(s, 'hours').times = times('at')
    retire(s, 'hours.timesOld', { from: 'times' })
    expect(checkSchema(s)).toEqual([])
    // The other way round, the source takes values the old list refuses.
    field(s, 'hours.timesOld').unique = 'at'
    delete field(s, 'hours.times').unique
    expect(checkSchema(s)).toEqual(['retired: “hours.timesOld” cannot mirror “times”: different uniqueness.'])
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
        // The hours status line reads exceptions; without it this row is only about the mirror.
        delete node(s, 'bricks.hours').status
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
      problems: ['hours.week.inner: lists and rows fields cannot be nested.'],
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
      name: 'a week in the old shape (a weekday name and a count)',
      mutate: (s: Schema) => { (s as { week: unknown }).week = { firstDay: 'monday', workdays: 5 } },
      problems: ["week must be { firstDay, workdays }: firstDay one of mo, tu, we, th, fr, sa, su, workdays a list of 1 to 7 different days of these, for example `week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }`."],
    },
    {
      name: 'a week in numbers',
      mutate: (s: Schema) => { (s as { week: unknown }).week = { firstDay: 1, weekend: [6, 7] } },
      problems: ["week must be { firstDay, workdays }: firstDay one of mo, tu, we, th, fr, sa, su, workdays a list of 1 to 7 different days of these, for example `week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }`."],
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
