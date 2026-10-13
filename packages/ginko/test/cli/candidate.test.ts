import { describe, expect, it } from 'vitest'
import { buildCandidate } from '../../src/cli/candidate.ts'
import type { ReleaseState } from '../../src/cli/model.ts'
import { collection, defineSite, f, migrationFingerprint, platformSchema, serializeSchema, single, type SiteInput } from '../../src/core/index.ts'

/** The candidate as `plan()` builds it: with the platform schema of `site`. */
const candidateOf = (release: ReleaseState, site: SiteInput) => buildCandidate(release, site, platformSchema(serializeSchema(site)))

// Production has `menu.headline`. The new config adds `menu.title` (translatable) filled from it,
// retires `headline` in favour of `title`, and adds a plain `code` filled from the price.
const before = defineSite({
  site: 'cafe', name: 'Café', url: 'https://cafe.example', timezone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: {},
  bricks: {
    menu: collection({ label: 'Karte', fields: { headline: f.text('Überschrift', { max: 120 }), price: f.money('Preis') }, max: 20, order: 'manual' }),
  },
})

const after = defineSite({
  ...before,
  bricks: {
    menu: collection({
      label: 'Karte',
      fields: {
        title: f.text('Titel', { max: 120 }),
        code: f.text('Code', { max: 40, translate: false }),
        headline: f.text('Überschrift', { max: 120 }),
        price: f.money('Preis'),
      },
      max: 20,
      order: 'manual',
    }),
  },
  retired: { 'menu.headline': { from: 'title' } },
  migrations: {
    '2026-11-menu-title': { brick: 'menu', fills: 'title', compute: (entry) => entry.headline },
    '2026-11-menu-code': { brick: 'menu', fills: 'code', compute: (entry) => `K${String((entry.price as { amount: number }).amount)}` },
  },
})

const state = (entries: ReleaseState['entries'], migrations: ReleaseState['migrations'] = []): ReleaseState => ({
  site: 'cafe',
  schema: serializeSchema(before),
  schemaRev: 1,
  contentRev: 1,
  migrations,
  entries,
})

const live = { id: 'live-soup', brick: 'menu', data: { headline: { de: 'Suppe', en: 'Soup' }, price: { amount: 500 } }, deletedAt: null }
const deleted = { id: 'old-cake', brick: 'menu', data: { headline: { de: 'Kuchen' }, price: { amount: 300 } }, deletedAt: 1_700_000_000_000 }

describe('buildCandidate: migrations over live and deleted entries (SPEC 5.1 step 4)', () => {
  it('writes the translatable target per locale and the plain target once, for live and deleted entries', async () => {
    const candidate = await candidateOf(state([live, deleted]), after)
    expect(candidate.writes).toEqual([
      { entry: 'live-soup', fields: { title: { de: 'Suppe', en: 'Soup' }, code: 'K500' } },
      { entry: 'old-cake', fields: { title: { de: 'Kuchen' }, code: 'K300' } },
    ])
    expect(candidate.problems).toEqual([])
    expect(candidate.changed.map((c) => c.id)).toEqual(['live-soup', 'old-cake'])
  })

  it('a required target without a main-language value is a problem, not a silent empty field', async () => {
    const onlyEnglish = { id: 'en-only', brick: 'menu', data: { headline: { en: 'Salad' }, price: { amount: 700 } }, deletedAt: null }
    const candidate = await candidateOf(state([onlyEnglish]), after)
    expect(candidate.problems).toContainEqual(expect.stringContaining('title.de'))
  })

  it('a migration the platform already applied is not run again', async () => {
    const applied = { id: '2026-11-menu-title', brick: 'menu', fills: 'title', fingerprint: migrationFingerprint('menu', 'title', after.migrations['2026-11-menu-title']!.compute), schemaRev: 2 }
    const candidate = await candidateOf(state([live, deleted], [applied]), after)
    expect(candidate.writes).toEqual([{ entry: 'live-soup', fields: { code: 'K500' } }, { entry: 'old-cake', fields: { code: 'K300' } }])
  })

  it('an entry above 256 KiB is reported', async () => {
    const big = { id: 'big', brick: 'menu', data: { headline: { de: 'Groß' }, price: { amount: 1 }, padding: 'x'.repeat(300_000) }, deletedAt: null }
    const candidate = await candidateOf(state([big]), after)
    expect(candidate.problems).toContainEqual(expect.stringContaining('is too large'))
  })
})

describe('buildCandidate: the entry limit (SPEC 5.2)', () => {
  it('counts live entries and a new single against the 2000 entry limit', async () => {
    const withHours = defineSite({ ...before, bricks: { ...before.bricks, hours: single({ label: 'Öffnungszeiten', fields: { text: f.text('Text', { max: 120, optional: true }) } }) } })
    const full = Array.from({ length: 2000 }, (_, index) => ({ id: `soup-${index}`, brick: 'menu', data: { headline: { de: 'Suppe' }, price: { amount: 500 } }, deletedAt: null }))
    const candidate = await candidateOf(state(full), withHours)
    expect(candidate.created.map((single) => single.brick)).toEqual(['hours'])
    expect(candidate.problems).toContainEqual(expect.stringContaining('2000'))
  })
})

describe('buildCandidate: entries the release would leave invalid (break-it 9)', () => {
  it('a plain required target that the migration leaves empty is a problem', async () => {
    const empty = defineSite({ ...after, migrations: { ...after.migrations, '2026-11-menu-code': { brick: 'menu', fills: 'code', compute: () => undefined } } })
    const candidate = await candidateOf(state([{ id: 'e1', brick: 'menu', data: { headline: { de: 'Suppe' }, price: { amount: 450 } }, deletedAt: null }]), empty)
    expect(candidate.problems.some((p) => p.includes('e1') && p.includes('Code'))).toBe(true)
  })
})

describe('buildCandidate: site options outside the schema', () => {
  // Wrong behaviour caught: release skips the `languages` check that build and `ginko check` run, and stores the default week.
  it('an invalid language tag is a problem', async () => {
    const candidate = await candidateOf(state([]), defineSite({ ...before, languages: { de: 'de_AT' } }))
    expect(candidate.problems).toContain('languages.de: invalid language “de_AT” (expected a canonical language tag such as “de-AT” or “en-US”).')
  })
})
