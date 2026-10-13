import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import {
  applyDefaults, bundleFits, isBundle, knownBricks, type Bundle,
  buildBundle, isVisible, printOf, resolveEntry, serializeSchema, sortEntries, todayIn,
  type Brick, type BundleBrick, type BundleItem, type CollectionBrick, type Locale, type Schema, type StoredEntry,
} from '../../src/core/index.ts'

// Today in the restaurant's time zone (Europe/Vienna) for every bundle case below.
const TODAY = '2026-10-08'
const base = (): Schema => structuredClone(serializeSchema(restaurant))
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

function brickOf(s: Schema, key: string): Brick {
  const brick = s.bricks[key]
  if (!brick) throw new Error(`${key} is missing`)
  return brick
}

function itemsOf(bundleBrick: BundleBrick | undefined): BundleItem[] {
  if (bundleBrick?.kind !== 'collection') throw new Error('not a collection')
  return bundleBrick.items
}

describe('image focus point', () => {
  const resolved = (focus?: { x: number; y: number }) =>
    resolveEntry(base(), 'events', {
      id: 'e1', data: { title: { de: 'Fest' }, when: { from: '2026-11-01', to: '2026-11-02' }, description: { de: 'x' }, image: { file: 'f1', alt: { de: 'Foto' } } },
    }, { locale: 'de', files: () => ({ url: 'https://x/f1.jpg', name: 'f1.jpg', size: 1, width: 10, height: 20, ...(focus ? { focus } : {}) }) }).data.image

  it('a resolved image carries the focus point only when the upload has one', () => {
    expect(resolved({ x: 0.3, y: 0.7 })).toEqual({ url: 'https://x/f1.jpg', alt: 'Foto', width: 10, height: 20, focus: { x: 0.3, y: 0.7 } })
    expect(resolved()).toEqual({ url: 'https://x/f1.jpg', alt: 'Foto', width: 10, height: 20 })
  })

  it('a resolved image carries the variants only when the upload has some', () => {
    const variants = [{ width: 480, url: 'https://x/f1-480.webp' }]
    const withVariants = resolveEntry(base(), 'events', {
      id: 'e1', data: { title: { de: 'Fest' }, when: { from: '2026-11-01', to: '2026-11-02' }, description: { de: 'x' }, image: { file: 'f1', alt: { de: 'Foto' } } },
    }, { locale: 'de', files: () => ({ url: 'https://x/f1.jpg', name: 'f1.jpg', size: 1, width: 1600, height: 900, variants }) }).data.image
    expect(withVariants).toEqual({ url: 'https://x/f1.jpg', alt: 'Foto', width: 1600, height: 900, variants })
    expect(resolved()).not.toHaveProperty('variants')
  })
})

const build = (s: Schema, entries: Record<string, StoredEntry[]>, requestedLocale: string) =>
  buildBundle({
    schema: s, requestedLocale, entries, files: noFiles,
    schemaRev: 1, contentRev: 1, generatedAt: '2026-10-08T00:00:00.000Z', today: TODAY,
  })

const resolve = (s: Schema, brick: string, entry: StoredEntry, locale: Locale) =>
  resolveEntry(s, brick, entry, { locale, files: noFiles })

// A menu entry as stored: `name` is translatable, the rest is plain data.
const dish = (id: string, name: Record<string, string>, prints?: StoredEntry['prints']): StoredEntry => ({
  id,
  data: { category: 'mains', name, price: { amount: 1490 }, allergens: [], veg: 'none' },
  ...(prints ? { prints } : {}),
})

describe('resolveEntry: translations and fallback (SPEC 6)', () => {
  it.each([
    {
      name: 'a missing translation falls back to the main language and lists the leaf',
      entry: dish('k1', { de: 'Tafelspitz' }),
      locale: 'en' as const,
      data: 'Tafelspitz',
      fallback: ['name'],
    },
    {
      name: 'a stale translation (print of an older main value) falls back',
      entry: dish('k1', { de: 'Tafelspitz', en: 'Boiled beef' }, { name: { en: printOf('Tafelspitz alt') } }),
      locale: 'en' as const,
      data: 'Tafelspitz',
      fallback: ['name'],
    },
    {
      name: 'a fresh translation (print matches the main value) is used',
      entry: dish('k1', { de: 'Tafelspitz', en: 'Boiled beef' }, { name: { en: printOf('Tafelspitz') } }),
      locale: 'en' as const,
      data: 'Boiled beef',
      fallback: [],
    },
    {
      name: 'the main language never falls back',
      entry: dish('k1', { de: 'Tafelspitz', en: 'Boiled beef' }),
      locale: 'de' as const,
      data: 'Tafelspitz',
      fallback: [],
    },
  ])('$name', ({ entry, locale, data, fallback }) => {
    const r = resolve(base(), 'menu', entry, locale)
    expect(r.data.name).toBe(data)
    expect(r.fallback).toEqual(fallback)
  })

  // Wrong behaviour caught: a list row's missing translation is reported without its row id, so the editor cannot find it.
  it('lists a list-row leaf with its row id, e.g. days.<id>.dish', () => {
    const lunch: StoredEntry = {
      id: 'lunch',
      data: { weekOf: '2026-10-05', days: [{ _id: 'k3Fd9aZ0qx', day: 'mo', dish: { de: 'Tafelspitz' }, allergens: [] }] },
    }
    const r = resolve(base(), 'lunch', lunch, 'en')
    expect(r.data.days).toEqual([{ _id: 'k3Fd9aZ0qx', day: 'mo', dish: 'Tafelspitz', allergens: [] }])
    expect(r.fallback).toEqual(['days.k3Fd9aZ0qx.dish'])
  })
})

describe('buildBundle: locales (SPEC 6)', () => {
  it('an unknown requested locale delivers the main language and marks every translatable leaf as fallback', () => {
    const s = base()
    const b = build(s, { menu: [dish('k1', { de: 'Tafelspitz', en: 'Boiled beef' })] }, 'fr')
    expect(b.locale).toBe('de')
    expect(b.requestedLocale).toBe('fr')
    expect(b.mainLocale).toBe('de')
    expect(itemsOf(b.bricks.menu)[0]).toMatchObject({ id: 'k1', data: { name: 'Tafelspitz' }, fallback: ['name'] })
    // The single brick is built from defaults; both translatable defaults are marked.
    expect(b.bricks.seo).toMatchObject({ kind: 'single', data: { title: 'Gasthaus zur Linde, Salzburg' }, fallback: ['title', 'description'] })
  })

  it('a known locale does not report requestedLocale', () => {
    expect(build(base(), {}, 'en')).not.toHaveProperty('requestedLocale')
  })
})

describe('isVisible: dates are inclusive in the site time zone (SPEC 2.1)', () => {
  it.each([
    { name: 'an active notice without a date stays visible', brick: 'notices', data: {}, visible: true },
    { name: 'an active notice that ends today is visible', brick: 'notices', data: { until: '2026-10-08' }, visible: true },
    { name: 'an active notice that ended yesterday is hidden', brick: 'notices', data: { until: '2026-10-07' }, visible: false },
    { name: 'an active notice that ends tomorrow is visible', brick: 'notices', data: { until: '2026-10-09' }, visible: true },
    { name: 'with days, an entry stays that many days after its date', brick: 'lunchPlans', data: { weekOf: '2026-10-02' }, visible: true },
    { name: 'with days, it is hidden the day after', brick: 'lunchPlans', data: { weekOf: '2026-10-01' }, visible: false },
    { name: 'an event that ends today is visible', brick: 'events', data: { when: { from: '2026-10-01', to: '2026-10-08' } }, visible: true },
    { name: 'an event that ended yesterday is hidden', brick: 'events', data: { when: { from: '2026-10-01', to: '2026-10-07' } }, visible: false },
    { name: 'an event without dates stays visible', brick: 'events', data: {}, visible: true },
  ])('$name', ({ brick, data, visible }) => {
    expect(isVisible(brickOf(base(), brick), data, TODAY)).toBe(visible)
  })

  // Wrong behaviour caught: `days` only counts for a date field, so a daterange entry disappears on its last day.
  it('adds days to the end of a daterange', () => {
    const events = { ...brickOf(base(), 'events'), visible: { mode: 'until', field: 'when', days: 2 } } as Brick
    expect(isVisible(events, { when: { from: '2026-10-01', to: '2026-10-06' } }, TODAY)).toBe(true)
    expect(isVisible(events, { when: { from: '2026-10-01', to: '2026-10-05' } }, TODAY)).toBe(false)
  })

  // Wrong behaviour caught: at 00:30 in Vienna a notice that ended yesterday still shows, because the UTC date is one day behind.
  it('decides today in the site time zone, not in UTC', () => {
    const today = todayIn('Europe/Vienna', new Date('2026-10-07T22:30:00Z'))
    expect(today).toBe('2026-10-08')
    expect(isVisible(brickOf(base(), 'notices'), { until: '2026-10-07' }, today)).toBe(false)
  })
})

describe('sortEntries: when asc (SPEC 2.1)', () => {
  it('sorts by from, then to, then id', () => {
    const entry = (id: string, from: string, to: string): StoredEntry => ({ id, data: { when: { from, to } } })
    const sorted = sortEntries(collectionOf(base(), 'events'), [
      entry('k2', '2026-10-10', '2026-10-12'),
      entry('k9', '2026-10-10', '2026-10-11'),
      entry('k1', '2026-10-10', '2026-10-12'),
      entry('k5', '2026-10-09', '2026-10-30'),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['k5', 'k9', 'k1', 'k2'])
  })

  // Wrong behaviour caught: an order without `dir` sorts descending, the opposite of the query order's default.
  it('sorts ascending when dir is left out', () => {
    const events = { ...collectionOf(base(), 'events'), order: { field: 'when' } }
    const entry = (id: string, from: string): StoredEntry => ({ id, data: { when: { from, to: from } } })
    expect(sortEntries(events, [entry('late', '2026-10-20'), entry('early', '2026-10-01')]).map((e) => e.id)).toEqual(['early', 'late'])
  })
})

describe('retired fields are projected into the bundle (SPEC 2.5)', () => {
  // A live copy `heading` of `title`, then `title` is retired as a mirror of it.
  const mirrored = () => {
    const s = base()
    fieldsOf(s, 'seo').heading = { type: 'text', label: 'Überschrift', max: 70, default: { de: 'Überschrift' } }
    retire(s, 'seo.title', { from: 'heading' })
    return s
  }

  it('{ from } shows the current value of its source', () => {
    const seo: StoredEntry = {
      id: 'seo',
      data: { title: { de: 'Alt' }, description: { de: 'Beschreibung' }, heading: { de: 'Hauptüberschrift', en: 'Main heading' } },
      prints: { heading: { en: printOf('Hauptüberschrift') } },
    }
    const r = resolve(mirrored(), 'seo', seo, 'en')
    expect(r.data.title).toBe('Main heading')
    expect(r.fallback).not.toContain('title')
  })

  // Wrong behaviour caught: the mirror shows a translated value but the bundle does not say the leaf is a fallback.
  it('{ from } takes over the fallback status of its source', () => {
    const seo: StoredEntry = { id: 'seo', data: { title: { de: 'Alt' }, description: { de: 'Beschreibung' }, heading: { de: 'Hauptüberschrift' } } }
    const r = resolve(mirrored(), 'seo', seo, 'en')
    expect(r.data.title).toBe('Hauptüberschrift')
    expect(r.fallback).toContain('title')
  })

  const valueRows: Array<{ name: string; data: StoredEntry['data']; locale: Locale; description: string }> = [
    { name: 'shows the stored value when the entry has one', data: { title: { de: 'T' }, description: { de: 'Neu' } }, locale: 'de', description: 'Neu' },
    { name: 'shows the rule value when the entry has none', data: { title: { de: 'T' } }, locale: 'de', description: 'Alt' },
    { name: 'shows the rule value in another language too', data: { title: { de: 'T' } }, locale: 'en', description: 'Alt' },
  ]
  it.each(valueRows)('{ value } $name', ({ data, locale, description }) => {
    const s = base()
    retire(s, 'seo.description', { value: { de: 'Alt' } })
    expect(resolve(s, 'seo', { id: 'seo', data }, locale).data.description).toBe(description)
  })
})

describe('collections: hidden entries have no URL (SPEC 2.1, 6)', () => {
  it('lists a hidden entry without urls and a visible entry with its URL, in when order', () => {
    const hidden: StoredEntry = { id: 'h1', data: { title: { de: 'Frühlingsfest' }, slug: { de: 'fruehlingsfest' }, when: { from: '2026-10-01', to: '2026-10-02' } } }
    const shown: StoredEntry = { id: 'v1', data: { title: { de: 'Weinabend' }, slug: { de: 'weinabend' }, when: { from: '2026-10-10', to: '2026-10-10' } } }
    const items = itemsOf(build(base(), { events: [shown, hidden] }, 'de').bricks.events)
    expect(items.map((i) => i.id)).toEqual(['h1', 'v1'])
    expect(items[0]).not.toHaveProperty('urls')
    expect(items[1]?.urls?.de).toBe('/veranstaltungen/weinabend')
  })
})

// Wrong behaviour caught: sitemap lastmod and "last updated" lines get no time, or the time of a file entry gets lost on the way to the item.
describe('collections: updatedAt and source of an entry reach its item (bundle format 3)', () => {
  it('copies both when the entry has them and leaves them out otherwise', () => {
    const dated: StoredEntry = { id: 'a', data: { title: { de: 'A' }, slug: { de: 'a' }, when: { from: '2026-10-10', to: '2026-10-10' } }, updatedAt: '2026-10-05T09:00:00.000Z', sources: { de: 'content/events/a.md' } }
    const plain: StoredEntry = { id: 'b', data: { title: { de: 'B' }, slug: { de: 'b' }, when: { from: '2026-10-10', to: '2026-10-10' } } }
    const items = itemsOf(build(base(), { events: [dated, plain] }, 'de').bricks.events)
    expect(items.find((i) => i.id === 'a')).toMatchObject({ updatedAt: '2026-10-05T09:00:00.000Z', source: 'content/events/a.md' })
    expect(items.find((i) => i.id === 'b')).not.toHaveProperty('updatedAt')
    expect(items.find((i) => i.id === 'b')).not.toHaveProperty('source')
  })
})

describe('applyDefaults (SPEC 8): the site fills what its config knows and the bundle lacks', () => {
  const schema = serializeSchema(restaurant)
  const bundle = (bricks: Bundle['bricks']): Bundle => ({
    format: 3, site: 'restaurant', locale: 'en', locales: ['de', 'en'], mainLocale: 'de', currency: 'EUR',
    schemaRev: 1, contentRev: 1, generatedAt: '2026-10-08T00:00:00Z', bricks,
  })

  it('fills a new field, builds a missing single, keeps an empty collection and never overwrites bundle data', () => {
    const out = applyDefaults(bundle({
      hours: { kind: 'single', data: { closedNote: 'Heute zu' }, fallback: [] },
      menu: { kind: 'collection', items: [] },
    }), schema)
    const hours = out.bricks.hours as { data: Record<string, unknown> }
    expect(hours.data.holidayNoticeDays).toBe(14)
    expect(hours.data.closedNote).toBe('Heute zu')
    // seo is missing entirely: built from defaults, English falls back to German.
    expect(out.bricks.seo).toMatchObject({ kind: 'single', data: { title: 'Gasthaus zur Linde, Salzburg' }, fallback: ['title', 'description'] })
    expect(out.bricks.events).toEqual({ kind: 'collection', items: [] })
  })
})

describe('isBundle and bundleFits: a malformed bundle is a platform failure, not data', () => {
  const schema = serializeSchema(restaurant)
  const good = JSON.parse(readFileSync(new URL('../../../../contracts/restaurant/bundle.format3.de.json', import.meta.url), 'utf8')) as Bundle

  it('accepts the corpus bundle', () => {
    expect(isBundle(good) && bundleFits(good, schema)).toBe(true)
  })

  // Format 2 (no updatedAt, no source) is still read; the items just lack the two fields.
  it('accepts a format 2 bundle', () => {
    const old = structuredClone(good) as unknown as Record<string, any>
    old.format = 2
    for (const item of old.bricks.events.items) { delete item.updatedAt; delete item.source }
    expect(isBundle(old)).toBe(true)
  })

  it.each([
    { name: 'items null', mutate: (b: Record<string, any>) => { b.bricks.events.items = null } },
    { name: 'item without data', mutate: (b: Record<string, any>) => { delete b.bricks.events.items[0].data } },
    { name: 'fallback not a string list', mutate: (b: Record<string, any>) => { b.bricks.hours.fallback = [1] } },
    { name: 'url not a string', mutate: (b: Record<string, any>) => { b.bricks.events.items[0].urls = { de: 5 } } },
    { name: 'updatedAt not a string', mutate: (b: Record<string, any>) => { b.bricks.events.items[0].updatedAt = 5 } },
    { name: 'contentRev missing', mutate: (b: Record<string, any>) => { delete b.contentRev } },
    // Format 1 carried AST v1 text values, which the renderer cannot show.
    { name: 'format 1', mutate: (b: Record<string, any>) => { b.format = 1 } },
  ])('rejects $name', ({ mutate }) => {
    const bad = structuredClone(good) as unknown as Record<string, any>
    mutate(bad)
    expect(isBundle(bad)).toBe(false)
  })

  it('a brick of another kind than the config does not fit (no silent empty collection)', () => {
    const bad = structuredClone(good)
    bad.bricks.events = { kind: 'single', data: {}, fallback: [] }
    expect(isBundle(bad)).toBe(true)
    expect(bundleFits(bad, schema)).toBe(false)
  })
})

// Break-it 9: a `__proto__` brick key made every page 500 (devalue refuses it); newer bricks of a newer platform are dropped too.
it('knownBricks keeps only the bricks of the site schema', () => {
  const bundle = JSON.parse('{"format":1,"site":"s","locale":"de","schemaRev":1,"contentRev":1,"bricks":{"__proto__":{"kind":"single","data":{},"fallback":[]},"later":{"kind":"single","data":{},"fallback":[]},"seo":{"kind":"single","data":{},"fallback":[]}}}')
  expect(Object.keys(knownBricks(bundle, { bricks: { seo: { kind: 'single', label: 'SEO', fields: {} } } } as never).bricks)).toEqual(['seo'])
})
