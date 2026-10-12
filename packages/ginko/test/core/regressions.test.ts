import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import {
  buildBundle, checkSchema, diffSchema, isSafeHref, migrationFingerprint, printOf, resolveEntry,
  serializeSchema, sortEntries, validate, type BundleBrick, type BundleItem, type CollectionBrick,
  type Field, type Fields, type Issue, type Locale, type Schema, type StoredEntry,
} from '../../src/core/index.ts'

// One regression test per core finding of the Astra review of SPEC v4.
// Each test is named with the finding's file:line. Each must fail on the pre-fix core (78cdd01).

const TODAY = '2026-10-08'
const base = (): Schema => structuredClone(serializeSchema(restaurant))
const schema = serializeSchema(restaurant)
const noFiles = () => undefined

function node(s: Schema, path: string): Record<string, unknown> {
  let cur: unknown = s
  for (const key of path.split('.')) cur = (cur as Record<string, unknown>)[key]
  return cur as Record<string, unknown>
}
const fieldsOf = (s: Schema, brick: string) => node(s, `bricks.${brick}.fields`)
const retire = (s: Schema, path: string, rule: Schema['retired'][string]) => {
  const [brick, name] = path.split('.')
  node(s, `bricks.${brick}.fields.${name}`).retired = true
  s.retired[path] = rule
}

function collectionOf(s: Schema, key: string): CollectionBrick {
  const brick = s.bricks[key]
  if (brick?.kind !== 'collection') throw new Error(`${key} is not a collection`)
  return brick
}

function itemsOf(bundleBrick: BundleBrick | undefined): BundleItem[] {
  if (bundleBrick?.kind !== 'collection') throw new Error('not a collection')
  return bundleBrick.items
}

const build = (s: Schema, entries: Record<string, StoredEntry[]>, requestedLocale: string) =>
  buildBundle({
    schema: s, requestedLocale, entries, files: noFiles,
    schemaRev: 1, contentRev: 1, generatedAt: '2026-10-08T00:00:00.000Z', today: TODAY,
  })

const resolve = (s: Schema, brick: string, entry: StoredEntry, locale: Locale) =>
  resolveEntry(s, brick, entry, { locale, files: noFiles })

const pairs = (issues: Issue[]) => issues.map((i) => [i.path, i.code])

// A menu entry whose main-language name is fresh in English, so only the extra data under test decides.
const menu = (extra: StoredEntry['data'] = {}): StoredEntry => ({
  id: 'k1',
  data: { category: 'mains', name: { de: 'Gulasch', en: 'Goulash' }, price: { amount: 1290 }, allergens: [], veg: 'none', ...extra },
  prints: { name: { en: printOf('Gulasch') } },
})

describe('diff.ts:131 removing text max lowers the effective limit', () => {
  const withMax = (max: number | undefined) => {
    const s = base()
    const field = node(s, 'bricks.seo.fields.description')
    if (max === undefined) delete field.max
    else field.max = max
    return s
  }

  it('rejects removing max 500, because validation then applies the default 200', () => {
    expect(diffSchema(withMax(500), withMax(undefined)).rejected.map((r) => [r.path, r.kind])).toEqual([['seo.description', 'maxLowered']])
  })
})

describe('diff.ts:119 retiring keeps the production definition of the field', () => {
  it('rejects a retirement that raises the limit of the retired field, which old readers rely on', () => {
    const prod = base()
    fieldsOf(prod, 'seo').legacy = { type: 'text', label: 'Alt', max: 10, optional: true }
    const next = base()
    fieldsOf(next, 'seo').legacy = { type: 'text', label: 'Alt', max: 500, optional: true, retired: true }
    fieldsOf(next, 'seo').current = { type: 'text', label: 'Aktuell', max: 500, optional: true }
    next.retired['seo.legacy'] = { from: 'current' }
    expect(diffSchema(prod, next).rejected.map((r) => [r.path, r.kind])).toEqual([['seo.legacy', 'retiredFieldChanged']])
  })
})

describe('diff.ts:95 the diff is deny-by-default for unknown properties', () => {
  it.each([
    ['brick', (next: Schema) => { node(next, 'bricks.menu').priority = 1 }, ['menu', 'unknownChange']],
    ['field', (next: Schema) => { node(next, 'bricks.menu.fields.name').placeholder = 'Gericht' }, ['menu.name', 'unknownChange']],
  ] as const)('rejects a changed %s property that is not in the allowlist', (_name, mutate, expected) => {
    const next = base()
    mutate(next)
    expect(diffSchema(base(), next).rejected.map((r) => [r.path, r.kind])).toEqual([expected])
  })
})

describe('validate.ts:33 patch validation matches changed leaf paths and their containers', () => {
  const weekdays = ['mo', 'tu', 'we', 'th', 'fr'] as const
  // Five lunch rows; the Monday row carries `monday` as its dish.
  const lunch = (monday: unknown) => ({
    weekOf: '2026-10-05',
    days: weekdays.map((day) => ({ _id: `ld${day}000000`, day, dish: day === 'mo' ? monday : { de: 'Gulasch' }, allergens: [] })),
  })

  it.each([
    ['the changed dish leaf', 'days.ldmo000000.dish', true],
    ['the changed row that contains it', 'days.ldmo000000', true],
    ['the whole days list', 'days', true],
    ['a changed leaf of another row', 'days.ldtu000000.dish', false],
  ] as const)('a bad value is an error when %s changed, else a warning', async (_name, changed, isError) => {
    const result = (await validate(schema, 'lunch', lunch({ de: 123 }), { mode: 'patch', changed: new Set([changed]) }))
    const issue = [['days.ldmo000000.dish.de', 'TYPE']]
    expect(pairs(result.errors)).toEqual(isError ? issue : [])
    expect(pairs(result.warnings)).toEqual(isError ? [] : issue)
  })
})

describe('resolve.ts:43 hiding is decided per leaf, not by the container', () => {
  // Hide collection with two list fields: `extras` is required and its note is optional,
  // `tags` is optional and its word is required.
  const hiding = (): Schema => {
    const s = base()
    collectionOf(s, 'menu').missing = 'hide'
    const fields = fieldsOf(s, 'menu')
    fields.extras = { type: 'list', label: 'Extras', itemLabel: 'Extra', max: 5, of: { note: { type: 'text', label: 'Notiz', max: 60, optional: true } } }
    fields.tags = { type: 'list', label: 'Schlagwörter', itemLabel: 'Schlagwort', max: 5, optional: true, of: { word: { type: 'text', label: 'Wort', max: 60 } } }
    return s
  }

  const rows: [string, StoredEntry['data'], boolean][] = [
    ['an untranslated optional note in a required list keeps the entry', { extras: [{ _id: 'ex1xxxxxxx', note: { de: 'scharf' } }] }, true],
    ['an untranslated required word in an optional list hides the entry', { tags: [{ _id: 'tg1xxxxxxx', word: { de: 'vegan' } }] }, false],
  ]
  it.each(rows)('%s', (_name, extra, visible) => {
    const items = itemsOf(build(hiding(), { menu: [menu(extra)] }, 'en').bricks.menu)
    expect(items.map((i) => i.id)).toEqual(visible ? ['k1'] : [])
  })
})

describe('resolve.ts:43 an unknown locale does not hide a valid entry', () => {
  it('keeps an entry of a hide collection when the requested locale is unknown', () => {
    const s = base()
    collectionOf(s, 'menu').missing = 'hide'
    const entry: StoredEntry = { id: 'k1', data: { category: 'mains', name: { de: 'Gulasch' }, price: { amount: 1290 }, allergens: [], veg: 'none' } }
    expect(itemsOf(build(s, { menu: [entry] }, 'fr').bricks.menu).map((i) => i.id)).toEqual(['k1'])
  })
})

describe('resolve.ts:224 the stored slug and the URL use the same slug', () => {
  it('a stale English slug resolves to the slug that the English URL uses', () => {
    const s = base()
    const event: StoredEntry = {
      id: 'e1',
      data: { title: { de: 'Weinabend' }, slug: { de: 'weinabend', en: 'wine-evening' }, when: { from: '2026-10-10', to: '2026-10-10' }, description: { de: 'Wein' } },
      prints: { slug: { en: printOf('weinabend-alt') } },
    }
    const item = itemsOf(build(s, { events: [event] }, 'en').bricks.events)[0]
    expect(item?.data.slug).toBe('wine-evening')
    expect(item?.urls?.en).toBe('/en/events/wine-evening')
  })
})

describe('href.ts:19 same-site hrefs cannot leave the origin through control characters', () => {
  it.each([
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
  ])('rejects %j', (href) => {
    expect(isSafeHref(href)).toBe(false)
  })
})

describe('validate.ts:159 image values enforce their keys and their alt locales', () => {
  const gallery = (image: unknown) => ({ images: [{ _id: 'img0000001', image }] })

  it.each([
    ['an alt text in a locale that is not configured', { file: 'file_01', alt: { de: 'Bild', xx: 'foreign' } }, [['images.img0000001.image.alt.xx', 'UNKNOWN_LOCALE']]],
    ['an unknown key next to file and alt', { file: 'file_01', alt: { de: 'Bild' }, surprise: true }, [['images.img0000001.image', 'TYPE']]],
  ] as const)('rejects %s', async (_name, image, expected) => {
    expect(pairs((await validate(schema, 'gallery', gallery(image), { mode: 'create' })).errors)).toEqual(expected)
  })
})

describe('schema.ts:48 checkSchema rejects invalid executable contracts', () => {
  const migration = (id: string) => ({ id, brick: 'seo', fills: 'title', fingerprint: migrationFingerprint('seo', 'title', () => 'x') })

  it.each([
    ['a text default that is not localized', (s: Schema) => { node(s, 'bricks.seo.fields.title').default = 123 },
      ['seo.title.default: “Titel” must be stored per language.']],
    ['two migrations with the same ID', (s: Schema) => { s.migrations.push(migration('2026-11-seo-copy'), migration('2026-11-seo-copy')) },
      ['Migrations: duplicate ID.']],
    ['a malformed migration ID', (s: Schema) => { s.migrations.push(migration('seo-copy')) },
      ['Migration “seo-copy”: ID must look like “2026-11-name”.']],
    ['a retirement rule on a field that is not marked retired', (s: Schema) => { s.retired['seo.title'] = { from: 'title' } },
      ['retired: field “seo.title” has no retired marker.']],
  ] as const)('%s', (_name, mutate, problems) => {
    const s = base()
    mutate(s)
    expect(checkSchema(s)).toEqual(problems)
  })
})

describe('schema.ts:138 a mirror with the same effective money limit is compatible', () => {
  it('accepts a money mirror whose omitted max equals the old explicit max', () => {
    const s = base()
    fieldsOf(s, 'menu').priceOld = { type: 'money', label: 'Alter Preis', max: 100000000, optional: true, retired: true }
    s.retired['menu.priceOld'] = { from: 'price' }
    expect(checkSchema(s)).toEqual([])
  })
})

describe('resolve.ts:58 a retired constant keeps its fallback path', () => {
  it('reports the constant as a fallback when the locale has no value for it', () => {
    const s = base()
    retire(s, 'seo.description', { value: { de: 'Fallback' } })
    const r = resolve(s, 'seo', { id: 'seo', data: { title: { de: 'T' } } }, 'en')
    expect(r.data.description).toBe('Fallback')
    expect(r.fallback).toEqual(['title', 'description'])
  })
})

describe('resolve.ts:155 numeric sorting compares numbers, not text', () => {
  const ranked = (): CollectionBrick => {
    const s = base()
    fieldsOf(s, 'menu').rank = { type: 'number', label: 'Rang', min: -10, max: 10, step: 0.5 }
    const brick = collectionOf(s, 'menu')
    brick.order = { field: 'rank', dir: 'asc' }
    return brick
  }
  const entries: StoredEntry[] = [
    { id: 'a', data: { rank: 2 } }, { id: 'b', data: { rank: -10 } }, { id: 'c', data: { rank: 1.5 } },
    { id: 'd', data: { rank: 10 } }, { id: 'e', data: { rank: -2 } },
  ]

  it.each([
    ['asc', ['b', 'e', 'c', 'a', 'd']],
    ['desc', ['d', 'a', 'c', 'e', 'b']],
  ] as const)('sorts %s by value', (dir, expected) => {
    const brick = ranked()
    brick.order = { field: 'rank', dir }
    expect(sortEntries(brick, entries).map((e) => e.id)).toEqual(expected)
  })
})

// Astra re-review of the phase 4 fixes: five gaps left after the first fix round.
describe('Astra phase 4 re-review', () => {
  const text = { type: 'text', label: 'Text' } as const
  const list = (of: Fields) => ({ type: 'list', label: 'Rows', itemLabel: 'Row', max: 5, of }) as const
  const make = (fields: Fields): Schema => serializeSchema({
    site: 'test', name: 'Test', url: 'https://example.com', timezone: 'UTC', locales: ['de'], currency: 'EUR', pages: {},
    bricks: { menu: { kind: 'collection', label: 'Menu', max: 10, order: 'manual', fields } },
  })

  it('diff.ts:99 a column inside a retired list cannot be retired on its own', () => {
    const before = make({ rows: list({ name: text }) })
    before.bricks.menu!.fields.rows!.retired = true
    before.retired['menu.rows'] = { value: [] }
    const after = structuredClone(before)
    ;(after.bricks.menu!.fields.rows as { of: Fields }).of.name!.retired = true
    expect(checkSchema(after)).toContain('menu.rows.name: columns of a list cannot be retired one by one.')
    expect(diffSchema(before, after).rejected.map((r) => r.kind)).toContain('retiredFieldChanged')
  })

  it.each([
    { name: 'unknown root property', mutate: (s: Schema) => { (s as unknown as Record<string, unknown>).future = true } },
    { name: 'unknown field property appearing as null', mutate: (s: Schema) => { (s.bricks.menu!.fields.name as unknown as Record<string, unknown>).future = null } },
  ])('diff.ts:92 rejects an $name in checkSchema and diffSchema', ({ mutate }) => {
    const a = make({ name: text })
    const b = structuredClone(a)
    mutate(b)
    expect(checkSchema(b).some((p) => p.includes('unknown property “future”'))).toBe(true)
    expect(diffSchema(a, b).rejected.map((r) => r.kind)).toContain('unknownChange')
  })

  it('schema.ts:65 validates defaults of list columns', () => {
    expect(checkSchema(make({ rows: list({ name: { ...text, default: 123 } as unknown as Field }) })).length).toBeGreaterThan(0)
  })

  it('schema.ts:140 an explicit EUR mirrors the implicit site currency EUR', () => {
    const s = make({ old: { type: 'money', label: 'Old', currency: 'EUR', retired: true }, current: { type: 'money', label: 'Current' } })
    s.retired['menu.old'] = { from: 'current' }
    expect(checkSchema(s)).toEqual([])
  })
})

describe('Astra phase 5 re-review: release.ts:253 / :220', () => {
  it.each([
    { name: 'file', field: { type: 'file', label: 'Anhang', accept: ['pdf'], maxSize: 1024, optional: true, retired: true } },
    { name: 'image in a list', field: { type: 'list', label: 'Bilder', itemLabel: 'Bild', max: 5, optional: true, retired: true, of: { image: { type: 'image', label: 'Bild' } } } },
  ])('a retired $name cannot carry a constant value (it would hold an unchecked upload)', ({ field }) => {
    const s = serializeSchema(restaurant)
    s.bricks.menu!.fields.attachment = field as unknown as Field
    s.retired['menu.attachment'] = { value: null }
    expect(checkSchema(s).some((p) => p.includes('cannot have a fixed value'))).toBe(true)
  })
})
