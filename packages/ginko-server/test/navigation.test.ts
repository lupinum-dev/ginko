// navigation.tree, move and heading: the docs tree of a manually ordered collection with `parent`, `section` and `tab`.
import { collection, defineSite, f } from '@lupinum/ginko'
import { outline, serializeSchema, type Schema } from '@lupinum/ginko/internal'
import { describe, expect, it } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, opId, setup } from './setup'

const docsBrick = serializeSchema(defineSite({
  site: 'x', name: 'x', url: 'https://x.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR', pages: {},
  bricks: {
    docs: collection({
      label: 'Doku', max: 100, order: 'manual',
      fields: {
        title: f.text('Titel'),
        section: f.text('Abschnitt', { optional: true }),
        parent: f.ref('Übergeordnete Seite', { to: 'docs', optional: true }),
        tab: f.text('Reiter', { optional: true, max: 30 }),
        slug: f.slug('Adresse', { from: 'title' }),
      },
    }),
  },
})).bricks.docs!

type Page = { key: string; section?: string; tab?: string; parent?: string; state?: 'draft' }

/** The restaurant site with a docs collection holding `pages` in this order (sections and tabs in both languages). */
async function docsSite(pages: Page[]) {
  const s = await setup()
  const ids: Record<string, Id<'entries'>> = {}
  await s.t.run(async (ctx) => {
    const schema = (await ctx.db.get(s.site))!.schema as Schema
    schema.bricks.docs = docsBrick
    await ctx.db.patch(s.site, { schema })
    for (const [i, p] of pages.entries()) {
      const data = {
        title: { de: p.key }, slug: { de: p.key, en: p.key },
        ...(p.section ? { section: { de: p.section, en: `${p.section} (en)` } } : {}),
        ...(p.tab ? { tab: { de: p.tab, en: `${p.tab} (en)` } } : {}),
        ...(p.parent ? { parent: ids[p.parent] } : {}),
      }
      ids[p.key] = await ctx.db.insert('entries', {
        site: s.site, brick: 'docs', kind: 'item', order: i + 1, data, rev: 1, fieldRevs: { title: 1, section: 1, parent: 1, tab: 1, slug: 1 },
        lifeRev: 1, prints: {}, bytes: 10, ...(p.state ? { state: p.state } : {}),
      })
    }
  })
  const keyOf = (id: string) => Object.entries(ids).find(([, v]) => v === id)![0]
  /**
   * The tree as the Studio reads it, as "tab/section: parent(child)" lines per root (core outline over navigation.tree);
   * `website`: live pages only, as the website shows them.
   */
  const shape = async (website = false) => {
    const rows = await s.as.owner.query(api.navigation.tree, { site: 'restaurant', brick: 'docs' })
    const tree = outline(website ? rows.filter((r) => !r.draft) : rows)
    const line = (n: (typeof tree)[number]): string => keyOf(n.row.id) + (n.children.length ? `(${n.children.map(line).join(' ')})` : '')
    return tree.map((n) => `${n.tab ?? '-'}/${n.section ?? '-'}: ${line(n)}`)
  }
  const rev = async (key: string) => (await s.t.run((ctx) => ctx.db.get(ids[key]!)))!.rev
  const move = async (key: string, place: { parent: string; after?: string } | { after: string } | { before: string }, who: 'owner' | 'cook' = 'owner') => {
    const map = (k?: string) => (k === undefined ? undefined : ids[k]!)
    const p = 'before' in place ? { before: map(place.before)! } : 'parent' in place ? { parent: map(place.parent)!, ...(place.after ? { after: map(place.after)! } : {}) } : { after: map(place.after)! }
    return s.as[who].mutation(api.navigation.move, { site: 'restaurant', opId: opId(), entry: ids[key]!, baseRev: await rev(key), place: p })
  }
  return { ...s, ids, shape, move, rev }
}

const PAGES: Page[] = [
  { key: 'intro', section: 'Start' },
  { key: 'setup' },
  { key: 'install', parent: 'setup' },
  { key: 'auth', section: 'Anleitungen' },
  { key: 'keys', parent: 'auth' },
  { key: 'paging' },
]

describe('navigation.move', () => {
  // Wrong behaviour caught: nesting moves the page but leaves its subpages behind, or changes the order of others.
  it('nests a page with its subpages under another, in one step with one history line on the page', async () => {
    const s = await docsSite(PAGES)
    expect(await s.move('auth', { parent: 'setup', after: 'install' })).toMatchObject({ moved: true })
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install auth(keys))', '-/Anleitungen: paging'])
    const changes = await s.t.run((ctx) => ctx.db.query('changes').collect())
    expect(changes.filter((c) => c.entry === s.ids.auth).map((c) => c.kind)).toEqual(['place'])
  })

  // Wrong behaviour caught: the section heading is a field of its first page, so moving that page away took the
  // heading along and dropped the remaining pages into the section before.
  it('hands the section of a moved first page to the next page, in every language', async () => {
    const s = await docsSite(PAGES)
    await s.move('auth', { after: 'paging' })
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install)', '-/Anleitungen: paging', '-/Anleitungen: auth(keys)'])
    const paging = await s.t.run((ctx) => ctx.db.get(s.ids.paging!))
    expect(paging!.data.section).toEqual({ de: 'Anleitungen', en: 'Anleitungen (en)' })
    expect(paging!.fieldRevs.section).toBe(paging!.rev)
  })

  // Wrong behaviour caught: a page placed first in a section lands at the end of the section before it.
  it('puts a page first in a section: it takes over the heading', async () => {
    const s = await docsSite(PAGES)
    await s.move('paging', { before: 'auth' })
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install)', '-/Anleitungen: paging', '-/Anleitungen: auth(keys)'])
    const [paging, auth] = await s.t.run(async (ctx) => [await ctx.db.get(s.ids.paging!), await ctx.db.get(s.ids.auth!)])
    expect([paging!.data.section, auth!.data.section]).toEqual([{ de: 'Anleitungen', en: 'Anleitungen (en)' }, undefined])
  })

  // Wrong behaviour caught: the heading of a moved first page goes to the next stored page although it is a draft, so
  // the heading vanishes from the website and its live pages join the section before.
  it('hands a heading over to the next live page, never to a draft', async () => {
    const s = await docsSite([{ key: 'a', section: 'S' }, { key: 'p', section: 'G' }, { key: 'q', state: 'draft' }, { key: 'r' }])
    await s.move('p', { after: 'r' })
    expect(await s.shape(true)).toEqual(['-/S: a', '-/G: r', '-/G: p'])
    expect((await s.t.run((ctx) => ctx.db.get(s.ids.q!)))!.data.section).toBeUndefined()
  })

  // Wrong behaviour caught: "Go back to this version" restores the old parent or section of one page, which splits a
  // section or puts the page inside its own subpages (a move changes several pages; only the tree moves pages).
  it('going back to an older version leaves the page where the tree put it', async () => {
    const s = await docsSite(PAGES)
    const saved = await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.ids.paging!, baseRev: 1, fields: { title: { de: 'Blättern' } } }) as { change: string }
    await s.move('paging', { parent: 'setup', after: 'install' })
    const moved = await s.shape()
    await s.as.owner.mutation(api.entries.revert, { site: 'restaurant', opId: opId(), entry: s.ids.paging!, change: saved.change })
    expect(await s.shape()).toEqual(moved)
  })

  // Wrong behaviour caught: the list's one-step move on a tree page leaves its subpages and heading behind.
  it('refuses the list’s one-step move for a tree page', async () => {
    const s = await docsSite(PAGES)
    expect(await errorOf(s.as.owner.mutation(api.entries.move, { site: 'restaurant', opId: opId(), entry: s.ids.auth!, direction: 'up' }))).toMatchObject({ code: 'INVALID', key: 'errors.moveInNavigationTree' })
  })

  // Wrong behaviour caught: a page put inside its own subpage vanishes from the website's navigation (a cycle).
  it('refuses a place inside the page or its subpages and writes nothing', async () => {
    const s = await docsSite(PAGES)
    const before = await s.shape()
    expect(await errorOf(s.move('auth', { parent: 'keys' }))).toMatchObject({ code: 'INVALID', key: 'errors.placeInsideItself' })
    expect(await errorOf(s.move('auth', { parent: 'auth' }))).toMatchObject({ code: 'INVALID' })
    expect(await s.shape()).toEqual(before)
    expect(await s.rev('auth')).toBe(1)
  })

  // Wrong behaviour caught: two owners rearranging at once: the second move, based on the old tree, silently undoes
  // or scrambles the first. A text edit meanwhile is no reason to refuse.
  it('refuses a move based on a page whose place changed since; a text edit meanwhile does not block', async () => {
    const s = await docsSite(PAGES)
    const seen = await s.rev('paging')
    await s.move('paging', { parent: 'setup' })
    const stale = s.as.owner.mutation(api.navigation.move, { site: 'restaurant', opId: opId(), entry: s.ids.paging!, baseRev: seen, place: { after: s.ids.intro! } })
    expect(await errorOf(stale)).toMatchObject({ code: 'CHANGED_SINCE' })

    const base = await s.rev('intro')
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.ids.intro!, baseRev: base, fields: { title: { de: 'Einleitung' } } })
    expect(await s.as.owner.mutation(api.navigation.move, { site: 'restaurant', opId: opId(), entry: s.ids.intro!, baseRev: base, place: { after: s.ids.setup! } })).toMatchObject({ moved: true })
  })

  // Wrong behaviour caught: a target removed meanwhile is treated as "no parent", so the page lands at the top level.
  it('refuses a place whose page went to the trash meanwhile', async () => {
    const s = await docsSite(PAGES)
    await s.t.run((ctx) => ctx.db.patch(s.ids.setup!, { deletedAt: Date.now() }))
    expect(await errorOf(s.move('paging', { parent: 'setup' }))).toMatchObject({ code: 'CHANGED_SINCE', key: 'errors.placeGone' })
  })

  // Wrong behaviour caught: staff rearrange the navigation, which no task covers (SPEC 2.7).
  it('refuses staff', async () => {
    const s = await docsSite(PAGES)
    expect(await errorOf(s.move('paging', { after: 'intro' }, 'cook'))).toMatchObject({ code: 'FORBIDDEN' })
  })

  // Wrong behaviour caught: a move and its way back leave the stored structure different, so the website's navigation
  // changes although the owner undid the move.
  it('moving there and back gives the same tree and new content revisions for the website', async () => {
    const s = await docsSite([...PAGES, { key: 'api', tab: 'API', section: 'Referenz' }, { key: 'client' }])
    const before = await s.shape()
    const site0 = (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
    await s.move('api', { after: 'paging' })
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install)', '-/Anleitungen: auth(keys)', '-/Anleitungen: paging', '-/Anleitungen: api', 'API/Referenz: client'])
    await s.move('api', { before: 'client' })
    expect(await s.shape()).toEqual(before)
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev).toBeGreaterThan(site0)
  })
})

describe('navigation.heading', () => {
  const heading = (s: Awaited<ReturnType<typeof docsSite>>, key: string, text: string, locale = 'de') =>
    s.as.owner.mutation(api.navigation.heading, { site: 'restaurant', opId: opId(), entry: s.ids[key]!, baseRev: 1, field: 'section', locale, text })

  // Wrong behaviour caught: renaming the heading in German overwrites the English one, or renames only the first page
  // so a repeated copy on the next page splits the section in two.
  it('renames a section in one language on every page of its run that repeats it', async () => {
    const s = await docsSite([{ key: 'a', section: 'Start' }, { key: 'b', section: 'Start' }, { key: 'c', section: 'Mehr' }])
    expect(await heading(s, 'a', 'Los geht’s')).toMatchObject({ changed: 2 })
    const rows = await s.t.run(async (ctx) => Promise.all(['a', 'b', 'c'].map((k) => ctx.db.get(s.ids[k]!))))
    expect(rows.map((r) => r!.data.section)).toEqual([
      { de: 'Los geht’s', en: 'Start (en)' }, { de: 'Los geht’s', en: 'Start (en)' }, { de: 'Mehr', en: 'Mehr (en)' },
    ])
  })

  // Wrong behaviour caught: with Section out of the page form there is no way to start a section, or a heading put on
  // a subpage is accepted although the website ignores it.
  it('starts a section at a top-level page, removes one, and refuses a subpage', async () => {
    const s = await docsSite(PAGES)
    expect(await heading(s, 'paging', 'Referenz')).toMatchObject({ changed: 1 })
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install)', '-/Anleitungen: auth(keys)', '-/Referenz: paging'])
    await heading(s, 'auth', '')
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install)', '-/Start: auth(keys)', '-/Referenz: paging'])
    expect((await s.t.run((ctx) => ctx.db.get(s.ids.auth!)))!.data.section).toBeUndefined()
    expect(await errorOf(heading(s, 'keys', 'Unten'))).toMatchObject({ code: 'INVALID', key: 'errors.headingOnSubpage' })
  })

  // Wrong behaviour caught: a section started while the Studio shows English exists in English only, so the navigation
  // (built on the main language) has no such section; renaming it in English must leave German alone.
  it('starts a heading from another language in the main language too, and renames it there only', async () => {
    const s = await docsSite(PAGES)
    await heading(s, 'paging', 'Reference', 'en')
    expect(await s.shape()).toEqual(['-/Start: intro', '-/Start: setup(install)', '-/Anleitungen: auth(keys)', '-/Reference: paging'])
    await s.as.owner.mutation(api.navigation.heading, { site: 'restaurant', opId: opId(), entry: s.ids.auth!, baseRev: 1, field: 'section', locale: 'en', text: 'Guides' })
    expect((await s.t.run((ctx) => ctx.db.get(s.ids.auth!)))!.data.section).toEqual({ de: 'Anleitungen', en: 'Guides' })
  })
})
