// changes.get, changes.list filters, entries.versionAt and entries.revert against SPEC 3 and 4.2 "Verlauf".
import type { Json } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { historyText, type HistoryMsg } from '../convex/lib/history'
import { errorOf, firstPage, opId, setup } from './setup'

type Backend = Awaited<ReturnType<typeof setup>>
type Diff = { field: string; label: string; kind: string; before: Json; after: Json; locales?: { locale: string; before: Json; after: Json }[]; rows?: { id: string; change: string; fields?: string[] }[] }

/** The owner saves `fields` of an entry at its current revision and returns the new change. */
async function save(s: Backend, entry: Id<'entries'>, fields: Record<string, Json>, extra: { locale?: string } = {}) {
  const rev = (await s.t.run((ctx) => ctx.db.get(entry)))!.rev
  const result = (await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: rev, fields, sentence: 'Test', ...extra })) as { change: Id<'changes'> }
  return result.change
}

const diffOf = async (s: Backend, change: Id<'changes'>) => ((await s.as.owner.query(api.changes.get, { site: 'restaurant', change })) as unknown as { diff: Diff[] }).diff
const changeRows = (s: Backend) => s.t.run((ctx) => ctx.db.query('changes').collect())

describe('changes.get diff', () => {
  it('a plain field shows its kind, label and both values', async () => {
    const s = await setup()
    const change = await save(s, s.entries['menu-saibling']!, { price: { amount: 1450 } })
    expect(await diffOf(s, change)).toEqual([{ field: 'price', label: 'Preis', kind: 'money', before: { amount: 1350 }, after: { amount: 1450 } }])
  })

  it('a localized text names only the locale that changed', async () => {
    const s = await setup()
    const entry = s.entries['menu-saibling']!
    const name = ((await s.t.run((ctx) => ctx.db.get(entry)))!.data as { name: { de: string; en: string } }).name
    const change = await save(s, entry, { name: { en: 'Smoked char' } }, { locale: 'en' })
    expect(await diffOf(s, change)).toMatchObject([{
      field: 'name', kind: 'text', before: name, after: { ...name, en: 'Smoked char' },
      locales: [{ locale: 'en', before: name.en, after: 'Smoked char' }],
    }])
  })

  it('a list shows added, removed and changed rows by _id', async () => {
    const s = await setup()
    const entry = s.entries.lunch!
    const days = ((await s.t.run((ctx) => ctx.db.get(entry)))!.data as { days: Record<string, Json>[] }).days
    const next = days.filter((d) => d._id !== 'ldfr000000').map((d) => (d._id === 'ldmo000000' ? { ...d, price: { amount: 1200 } } : d))
    next.push({ _id: 'ldnew00000', day: 'fr', dish: { de: 'Fisch' }, price: { amount: 1000 }, allergens: [] })
    const diff = await diffOf(s, await save(s, entry, { days: next }))
    expect(diff).toHaveLength(1)
    expect(diff[0]).toMatchObject({ field: 'days', kind: 'list' })
    expect(diff[0]!.rows).toEqual([
      { id: 'ldmo000000', change: 'changed', fields: ['price'], before: days[0], after: next[0] },
      { id: 'ldnew00000', change: 'added', before: null, after: next.at(-1) },
      { id: 'ldfr000000', change: 'removed', before: days.find((d) => d._id === 'ldfr000000'), after: null },
    ])
  })

  it('a change of another site does not exist', async () => {
    const s = await setup()
    const change = await save(s, s.entries['menu-saibling']!, { price: { amount: 1450 } })
    expect((await errorOf(s.as.stranger.query(api.changes.get, { site: 'andere', change }))).code).toBe('NOT_FOUND')
  })
})

describe('changes.list filters', () => {
  it('entry and brick narrow the list; without them the list is the whole site', async () => {
    const s = await setup()
    const saibling = await save(s, s.entries['menu-saibling']!, { price: { amount: 1450 } })
    const frittaten = await save(s, s.entries['menu-frittaten']!, { price: { amount: 900 } })
    await save(s, s.entries.lunch!, { note: { de: 'Heute Suppe' } })
    const ids = async (extra: { entry?: string; brick?: string }) =>
      ((await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage, ...extra })).page as { _id: string }[]).map((c) => c._id)
    expect(await ids({})).toHaveLength(3)
    expect(await ids({ entry: s.entries['menu-saibling']! })).toEqual([saibling])
    expect((await ids({ brick: 'menu' })).sort()).toEqual([saibling, frittaten].sort())
    expect(await ids({ brick: 'menu', entry: s.entries['menu-frittaten']! })).toEqual([frittaten])
  })

  it('by "me" is the signed-in person\'s changes, by "ai" the agent door\'s; brick narrows both', async () => {
    const s = await setup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      ;(schema.bricks.events as { drafts?: boolean }).drafts = true
      await ctx.db.patch(s.site, { schema })
    })
    await save(s, s.entries['menu-saibling']!, { price: { amount: 1450 } })
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.entries['menu-frittaten']!, baseRev: 1, fields: { price: { amount: 900 } }, sentence: 'x' })
    const key = (await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'Claude Code' })).key
    const draft = await s.t.fetch('/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ginko_draft', arguments: { brick: 'events', fields: { title: 'Erntedank', when: { from: '2026-11-20', to: '2026-11-20' }, description: 'Mit Musik.' } } } }),
    })
    expect(((await draft.json()) as { result: { isError: boolean } }).result.isError).toBe(false)
    /** `actor:brick:via` of each change of the page, sorted. */
    const rows = async (person: 'owner' | 'cook', extra: { by?: 'me' | 'ai'; brick?: string }) =>
      ((await s.as[person].query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage, ...extra })).page as { actor: string; brick: string; via: string }[])
        .map((c) => `${c.actor}:${c.brick}:${c.via ?? 'ui'}`).sort()
    expect(await rows('owner', { by: 'me' })).toEqual(['u-wirtin:events:agent', 'u-wirtin:menu:ui'])
    expect(await rows('owner', { by: 'ai' })).toEqual(['u-wirtin:events:agent'])
    expect(await rows('owner', { by: 'me', brick: 'menu' })).toEqual(['u-wirtin:menu:ui'])
    expect(await rows('owner', { by: 'ai', brick: 'menu' })).toEqual([])
    expect(await rows('cook', { by: 'me' })).toEqual(['u-koch:menu:ui'])
  })

  it('an older save whose field was saved again offers no undo and says why', async () => {
    const s = await setup()
    const c1 = await save(s, s.entries['menu-saibling']!, { price: { amount: 1450 } })
    const c2 = await save(s, s.entries['menu-saibling']!, { price: { amount: 1500 } })
    const page = (await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage, entry: s.entries['menu-saibling']! })).page
    expect(page.map((r) => [r._id, r.undoBlocked])).toEqual([[c2, null], [c1, 'changed']])
  })

  // Wrong behaviour caught: after two bad saves, undoing the newer one left the older one "changed since", although its
  // field held exactly what it wrote, so the person could not step back further (R6).
  it('once the newer save is undone, the older one can be undone again, step by step', async () => {
    const s = await setup()
    const entry = s.entries['menu-saibling']!
    const a = await save(s, entry, { price: { amount: 1450 } })
    const b = await save(s, entry, { price: { amount: 1500 } })
    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: b })
    const page = (await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage, entry })).page
    expect(page.find((r) => r._id === a)!.undoBlocked).toBeNull()
    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: a })
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.data.price).toEqual({ amount: 1350 })
  })
})

/** Three saves touching different fields of one dish, an hour apart. Returns the entry, its first data and the three changes. */
async function threeSaves(s: Backend) {
  const entry = s.entries['menu-saibling']!
  const start = (await s.t.run((ctx) => ctx.db.get(entry)))!.data as Record<string, Json>
  const c1 = await save(s, entry, { name: { ...(start.name as object), de: 'Saibling gebeizt' } })
  vi.setSystemTime(Date.now() + 3600 * 1000)
  const c2 = await save(s, entry, { price: { amount: 1450 } })
  vi.setSystemTime(Date.now() + 3600 * 1000)
  const c3 = await save(s, entry, { veg: 'vegan' })
  return { entry, start, c1, c2, c3 }
}

const versionAt = (s: Backend, entry: Id<'entries'>, change: string) =>
  s.as.owner.query(api.entries.versionAt, { site: 'restaurant', entry, change }) as Promise<{ data: Record<string, Json>; fields: string[]; at: number }>

describe('entries.versionAt', () => {
  it('after three saves of different fields it returns the right mix for each change', async () => {
    const s = await setup()
    const { entry, start, c1, c2, c3 } = await threeSaves(s)
    const now = (await s.t.run((ctx) => ctx.db.get(entry)))!.data as Record<string, Json>
    expect((await versionAt(s, entry, c1)).data).toEqual({ ...start, name: { ...(start.name as object), de: 'Saibling gebeizt' } })
    expect((await versionAt(s, entry, c2)).data).toEqual({ ...start, name: now.name, price: { amount: 1450 } })
    expect((await versionAt(s, entry, c3)).data).toEqual(now)
  })

  // Wrong behaviour caught: "Zurück zu dieser Version" asked only about a date; the person could not see what it changes.
  it('says what going back changes: now before, the version after, only the fields that differ', async () => {
    const s = await setup()
    const { entry, start, c1 } = await threeSaves(s)
    const { diff } = (await versionAt(s, entry, c1)) as unknown as { diff: Diff[] }
    expect(diff).toEqual([
      { field: 'price', label: 'Preis', kind: 'money', before: { amount: 1450 }, after: start.price },
      { field: 'veg', label: expect.any(String), kind: 'choice', before: 'vegan', after: start.veg ?? null },
    ])
  })

  it('a change that is gone, or belongs to another entry, is NOT_FOUND', async () => {
    const s = await setup()
    const { entry, c1, c2 } = await threeSaves(s)
    const other = await save(s, s.entries['menu-frittaten']!, { price: { amount: 900 } })
    expect((await errorOf(s.as.owner.query(api.entries.versionAt, { site: 'restaurant', entry, change: other }))).code).toBe('NOT_FOUND')
    await s.t.run((ctx) => ctx.db.delete(c1)) // as the retention cron does
    expect((await errorOf(s.as.owner.query(api.entries.versionAt, { site: 'restaurant', entry, change: c1 }))).code).toBe('NOT_FOUND')
    expect((await versionAt(s, entry, c2)).fields).toEqual(['veg'])
  })
})

describe('entries.revert', () => {
  const revert = (s: Backend, entry: Id<'entries'>, change: string, task?: string) =>
    s.as.owner.mutation(api.entries.revert, { site: 'restaurant', opId: opId(), entry, change, ...(task ? { task } : {}) })

  it('writes one change with the sentence and only the differing fields, and it can be undone', async () => {
    const s = await setup()
    const { entry, start, c1 } = await threeSaves(s)
    const before = await changeRows(s)
    const after1 = (await s.t.run((ctx) => ctx.db.get(entry)))!.data as Record<string, Json>
    const result = (await revert(s, entry, c1)) as { change: Id<'changes'>; rev: number }
    const rows = await changeRows(s)
    expect(rows).toHaveLength(before.length + 1)
    const row = rows.find((r) => r._id === result.change)!
    // c1 ran at 2026-10-08 10:00 UTC, which is 12:00 in Vienna.
    expect(row).toMatchObject({ kind: 'save', sentence: 'Zurück zur Version vom 08.10.2026 12:00', fields: ['price', 'veg'] })
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.data).toEqual({ ...after1, price: start.price, veg: start.veg })
    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: row._id })
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.data).toEqual(after1)
  })

  it('without a difference nothing is written', async () => {
    const s = await setup()
    const { entry, c3 } = await threeSaves(s)
    const rev = (await s.t.run((ctx) => ctx.db.get(entry)))!.rev
    const before = await changeRows(s)
    expect(await revert(s, entry, c3)).toMatchObject({ entry, rev })
    expect(await changeRows(s)).toHaveLength(before.length)
  })

  it('a deleted entry is refused until it is restored', async () => {
    const s = await setup()
    const { entry, c1 } = await threeSaves(s)
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    expect(await errorOf(revert(s, entry, c1))).toMatchObject({ code: 'INVALID', message: expect.stringContaining('wieder her') })
  })

  it('staff on a task that needs approval propose the revert and write nothing', async () => {
    vi.stubEnv('GINKO_MAIL', 'outbox')
    const s = await setup()
    await s.t.run(async (ctx) => {
      const schema = (await ctx.db.get(s.site))!.schema as Schema
      for (const task of schema.bricks.menu!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true
      await ctx.db.patch(s.site, { schema })
    })
    const entry = s.entries['menu-saibling']!
    const c1 = await save(s, entry, { price: { amount: 1450 } })
    await save(s, entry, { price: { amount: 1500 } })
    const result = await s.as.cook.mutation(api.entries.revert, { site: 'restaurant', opId: opId(), task: 'menu.price', entry, change: c1 })
    expect(result).toEqual({ proposal: expect.any(String), status: 'open' })
    expect((await s.t.run((ctx) => ctx.db.get(entry)))!.data).toMatchObject({ price: { amount: 1500 } })
    expect(await changeRows(s)).toHaveLength(2)
    const proposal = (await s.t.run((ctx) => ctx.db.query('proposals').collect()))[0]!
    expect(proposal).toMatchObject({ op: 'save', sentence: 'Zurück zur Version vom 08.10.2026 12:00', after: { price: { amount: 1450 } } })
    vi.unstubAllEnvs()
  })
})

describe('history messages', () => {
  // Wrong behaviour caught: the line is stored as finished German, so an English reader sees German and
  // a date in another zone; or the German `sentence` that agents read drifts from the stored message.
  it('save, revert and undo store a msg: German renders the stored sentence, English reads English with the date in the site zone', async () => {
    const s = await setup()
    const { entry, c1 } = await threeSaves(s)
    const schema = (await s.t.run((ctx) => ctx.db.query('sites').collect())).find((site) => site.slug === 'restaurant')!.schema as Schema
    const row = async (id: Id<'changes'>) => (await changeRows(s)).find((r) => r._id === id)!
    const shows = (r: { msg?: unknown; sentence: string }, de: string, en: string) => {
      expect(historyText(r.msg as HistoryMsg, 'de', schema)).toBe(r.sentence)
      expect(r.sentence).toBe(de)
      expect(historyText(r.msg as HistoryMsg, 'en', schema)).toBe(en)
    }

    const saved = await row(c1)
    expect(saved.msg).toMatchObject({ key: 'history.changedEntry', params: { title: 'Gebeizter Saibling' } })
    shows(saved, 'Name von „Gebeizter Saibling“ geändert', 'Name changed in “Gebeizter Saibling”')

    // c1 ran at 2026-10-08 10:00 UTC, which is 12:00 in Vienna.
    const reverted = await row(((await s.as.owner.mutation(api.entries.revert, { site: 'restaurant', opId: opId(), entry, change: c1 })) as { change: Id<'changes'> }).change)
    expect(reverted.msg).toEqual({ key: 'history.revert', params: { when: (await row(c1)).at } })
    shows(reverted, 'Zurück zur Version vom 08.10.2026 12:00', 'Back to the version of Oct 8, 2026, 12:00')

    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: reverted._id })
    const undone = (await changeRows(s)).find((r) => r.kind === 'undo')!
    expect(undone.msg).toEqual({ key: 'history.undo', params: { what: reverted.msg } })
    shows(undone, 'Rückgängig: Zurück zur Version vom 08.10.2026 12:00', 'Undone: Back to the version of Oct 8, 2026, 12:00')
  })

  // Wrong behaviour caught: the line of an English-only save read like a change of the German text (romi-16).
  it('a save that changes only another language names it; one that also changes the main language does not', async () => {
    const s = await setup()
    const entry = s.entries['menu-saibling']!
    const english = await save(s, entry, { name: { en: 'Smoked char' } }, { locale: 'en' })
    const both = await save(s, entry, { name: { de: 'Saibling', en: 'Char' }, price: { amount: 1450 } })
    const rows = await changeRows(s)
    expect(rows.find((r) => r._id === english)).toMatchObject({ msg: { key: 'history.changedEntryIn', params: { languages: 'EN' } }, sentence: 'Name von „Gebeizter Saibling“ geändert (EN)' })
    expect(rows.find((r) => r._id === both)).toMatchObject({ msg: { key: 'history.changedEntry' } })
  })

  it('the client sentence is ignored: the server words the line from what changed', async () => {
    const s = await setup()
    const change = await save(s, s.entries['menu-saibling']!, { price: { amount: 1450 } })
    expect((await changeRows(s)).find((r) => r._id === change)).toMatchObject({ sentence: 'Preis von „Gebeizter Saibling“ geändert' })
  })
})
