// entries.create, remove, restore, move and tasks.prefill against SPEC 2.2, 2.7, 3 and 4.2.
import { printOf } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, firstPage, opId, setup } from './setup'

const dish = (name: string) => ({ category: 'starters', name: { de: name }, price: { amount: 900 }, allergens: ['A'], veg: 'none' })
const event = (title: string) => ({
  title: { de: title }, when: { from: '2026-11-20', to: '2026-11-20' },
  description: { de: 'Test' },
})
const notice = (text: string, until: string) => ({ text: { de: text }, until })

afterEach(() => vi.useRealTimers())

describe('entries.create', () => {
  it('a taken slug gets a suffix: a second "Martini-Gansl" is martini-gansl-2 in both locales', async () => {
    const { t, as } = await setup()
    const created = await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: event('Martini-Gansl') })
    const row = await t.run((ctx) => ctx.db.get(created.entry as Id<'entries'>))
    expect(row!.data.slug).toEqual({ de: 'martini-gansl-2', en: 'martini-gansl-2' })
    expect(created).toMatchObject({ rev: 1 })
  })

  it('a full collection without an expired entry rejects the new one', async () => {
    // A day on which notice-ausgebucht (until 2026-10-08) is still visible and notice-urlaub (2026-09-30) is not.
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
    const { t, as, entries } = await setup()
    // notice-urlaub ran out on 2026-09-30; keep it visible so nothing can be removed.
    await t.run((ctx) => ctx.db.patch(entries['notice-urlaub']!, { data: notice('Urlaub', '2026-12-31') }))
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Eins', '2026-10-30') })
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Zwei', '2026-10-30') })
    expect(await errorOf(as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Drei', '2026-10-30') }))).toMatchObject({ code: 'INVALID' })
  })

  it('visible.deleteExpired: the expired notice is removed first, as a remove change of actor system', async () => {
    // A day on which notice-ausgebucht (until 2026-10-08) is still visible and notice-urlaub (2026-09-30) is not.
    vi.setSystemTime(new Date('2026-10-05T10:00:00Z'))
    const { t, as, entries } = await setup()
    // notice-urlaub is expired: two more notices fill the collection, the third one needs room.
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Eins', '2026-10-30') })
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Zwei', '2026-10-30') })
    const created = await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Drei', '2026-10-30') })
    expect(created).toMatchObject({ rev: 1 })
    const [expired, live, changes] = await t.run(async (ctx) => [
      await ctx.db.get(entries['notice-urlaub']!),
      await ctx.db.get(entries['notice-ausgebucht']!),
      await ctx.db.query('changes').collect(),
    ] as const)
    expect(expired!.deletedAt).toBeDefined()
    expect(live!.deletedAt).toBeUndefined()
    expect(changes.filter((c) => c.kind === 'remove')).toEqual([expect.objectContaining({ actor: 'system', entry: entries['notice-urlaub'] })])
  })

  it.each([
    { task: undefined, why: 'staff without task' },
    { task: 'menu.edit', why: 'staff with a granted task of another kind' },
  ])('FORBIDDEN for the cook: $why', async ({ task }) => {
    const { as } = await setup()
    const call = as.cook.mutation(api.entries.create, { site: 'restaurant', opId: opId(), ...(task ? { task } : {}), brick: 'menu', data: dish('Neu') })
    expect((await errorOf(call)).code).toBe('FORBIDDEN')
  })

  it('the cook creates a dish with the granted add task; it lands at the end', async () => {
    const { as, t } = await setup()
    const created = await as.cook.mutation(api.entries.create, { site: 'restaurant', opId: opId(), task: 'menu.add', brick: 'menu', data: dish('Neu') })
    const row = await t.run((ctx) => ctx.db.get(created.entry as Id<'entries'>))
    expect(row).toMatchObject({ brick: 'menu', rev: 1, lifeRev: 1, order: 9, fieldRevs: { name: 1, price: 1 } })
  })
})

describe('entries.remove and restore', () => {
  it('removed lists the restorable entries of the site only, never live ones or those of another site', async () => {
    const { as, entries } = await setup()
    const notice = entries['notice-ausgebucht']!
    const life = (await as.owner.query(api.entries.removed, { site: 'restaurant', brick: 'notices' }))
    expect(life).toEqual([])
    const lifeRev = (await as.owner.query(api.entries.get, { site: 'restaurant', entry: notice }))!.lifeRev
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: notice, lifeRev })
    expect((await as.cook.query(api.entries.removed, { site: 'restaurant', brick: 'notices' })).map((e) => e._id)).toEqual([notice])
    expect(await as.stranger.query(api.entries.removed, { site: 'andere', brick: 'notices' })).toEqual([])
  })

  // Wrong behaviour caught: a removed entry keeps counting against the site's budget for 30 days, so removing frees nothing.
  it('removing an entry frees its bytes at once; restoring takes them back', async () => {
    const { t, as, entries, site } = await setup()
    const entry = entries['notice-ausgebucht']!
    const [before, row] = await t.run(async (ctx) => [(await ctx.db.get(site))!, (await ctx.db.get(entry))!] as const)
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    expect(await t.run((ctx) => ctx.db.get(site))).toMatchObject({ bytes: before.bytes - row.bytes, trashBytes: row.bytes })
    await as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry, lifeRev: 2 })
    expect(await t.run((ctx) => ctx.db.get(site))).toMatchObject({ bytes: before.bytes, trashBytes: 0 })
  })

  // Wrong behaviour caught: the trash grows without bound (a member loops create and remove), or a removal fails when it is full.
  it('a removal that fills the trash past its cap deletes the oldest removed entry for good', async () => {
    const { t, as, entries, site } = await setup()
    const oldest = entries['notice-weinabend']!
    const removed = entries['notice-ausgebucht']!
    await t.run(async (ctx) => {
      await ctx.db.patch(oldest, { deletedAt: Date.now() - 60_000, bytes: 1000 })
      await ctx.db.patch(site, { trashBytes: 4 * 1024 * 1024 - 10 })
    })
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: removed, lifeRev: 1 })
    const row = await t.run((ctx) => ctx.db.get(removed))
    expect(await t.run((ctx) => ctx.db.get(oldest))).toBeNull()
    expect(row?.deletedAt).toBeDefined()
    expect(await t.run((ctx) => ctx.db.get(site))).toMatchObject({ trashBytes: 4 * 1024 * 1024 - 10 - 1000 + row!.bytes })
  })

  // Wrong behaviour caught: a removed entry can only wait 30 days for retention, so the trash frees no room on demand.
  it('an owner deletes a removed entry for good; staff may not', async () => {
    const { t, as, entries, site } = await setup()
    const entry = entries['notice-ausgebucht']!
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    const [trash] = await as.owner.query(api.entries.trash, { site: 'restaurant', paginationOpts: firstPage }).then((r) => r.page)
    expect(trash).toMatchObject({ entry, mayPurge: true })
    expect(await errorOf(as.cook.mutation(api.entries.purge, { site: 'restaurant', opId: opId(), entry, lifeRev: 2 }))).toMatchObject({ code: 'FORBIDDEN', message: 'Endgültig löschen dürfen nur Inhaber und Admins.' })

    await as.owner.mutation(api.entries.purge, { site: 'restaurant', opId: opId(), entry, lifeRev: 2 })
    const after = await t.run(async (ctx) => ({
      row: await ctx.db.get(entry),
      slugs: await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry)).collect(),
      site: (await ctx.db.get(site))!,
      change: await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).order('desc').first(),
    }))
    expect(after.row).toBeNull()
    expect(after.slugs).toHaveLength(0)
    expect(after.site.trashBytes).toBe(0)
    expect(after.change).toMatchObject({ kind: 'purge', sentence: '„Heute sind wir ausgebucht.“ endgültig gelöscht' })
  })

  it('a restore with a stale lifeRev is CHANGED_SINCE; the current lifeRev restores', async () => {
    const { as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    expect(await errorOf(as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 }))).toMatchObject({ code: 'CHANGED_SINCE' })
    await expect(as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry, lifeRev: 2 })).resolves.toMatchObject({ entry })
  })

  it('restore on a full collection is rejected', async () => {
    const { as, entries } = await setup()
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: entries['notice-weinabend']!, lifeRev: 1 })
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Eins', '2026-10-30') })
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Zwei', '2026-10-30') })
    await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: notice('Drei', '2026-10-30') })
    expect(await errorOf(as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: entries['notice-weinabend']!, lifeRev: 2 }))).toMatchObject({ code: 'INVALID' })
  })

  it('undo of a remove change is NOT_UNDOABLE', async () => {
    const { t, as, entries } = await setup()
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: entries['menu-saibling']!, lifeRev: 1 })
    const change = (await t.run((ctx) => ctx.db.query('changes').collect())).find((c) => c.kind === 'remove')!
    expect(await errorOf(as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change._id }))).toMatchObject({ code: 'NOT_UNDOABLE' })
  })

  it('an entry of site andere is NOT_FOUND for remove, restore and move via site restaurant', async () => {
    const { t, as, other } = await setup()
    const foreign = await t.run((ctx) => ctx.db.insert('entries', { site: other, brick: 'menu', kind: 'item', order: 1, data: {}, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 2 }))
    expect(await errorOf(as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: foreign, lifeRev: 1 }))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await errorOf(as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: foreign, lifeRev: 1 }))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await errorOf(as.owner.mutation(api.entries.move, { site: 'restaurant', opId: opId(), entry: foreign, direction: 'up' }))).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('entries.move', () => {
  const MENU = ['menu-saibling', 'menu-frittaten', 'menu-schnitzel', 'menu-risotto', 'menu-dal', 'menu-marillen', 'menu-veltliner', 'menu-topfen']
  const menuRows = (s: Awaited<ReturnType<typeof setup>>) => s.t.run(async (ctx) => (await ctx.db.query('entries').collect()).filter((e) => e.site === s.site && e.brick === 'menu').sort((a, b) => a.order - b.order))
  const move = (s: Awaited<ReturnType<typeof setup>>, entry: string, direction: 'up' | 'down', who: 'owner' | 'cook' = 'owner') =>
    s.as[who].mutation(api.entries.move, { site: 'restaurant', opId: opId(), entry, direction })

  // Wrong behaviour caught: one step rewrites every row after the moved one (and resends the whole list), so a move at
  // 1,000 entries takes seconds and conflicts with any other move.
  it('moving the third menu entry up writes one order value', async () => {
    const s = await setup()
    const [first, second, third] = MENU.map((k) => s.entries[k]!)
    const before = await menuRows(s)
    expect(await move(s, third!, 'up')).toEqual({ order: 1.5, contentRev: 2 })
    const after = await menuRows(s)
    expect(after.slice(0, 3).map((r) => [r._id, r.order])).toEqual([[first, 1], [third, 1.5], [second, 2]])
    expect(after.filter((r) => r._id !== third && r.rev !== before.find((b) => b._id === r._id)!.rev)).toEqual([])
    const change = (await s.t.run((ctx) => ctx.db.query('changes').collect())).find((c) => c.kind === 'reorder')
    expect(change).toMatchObject({ entry: third, brick: 'menu', actor: 'u-wirtin', entryRev: 2, contentRev: 2 })
  })

  // Wrong behaviour caught: after about 50 halvings of one gap the midpoint equals a neighbour, and a move silently does nothing.
  it('60 moves into the same gap keep the order strictly increasing and land where asked', async () => {
    const s = await setup()
    const ids = MENU.map((k) => s.entries[k]!)
    for (let i = 0; i < 60; i++) {
      // The entry in third place moves up into the gap between the first and the second, over and over.
      const third = (await menuRows(s))[2]!._id
      await move(s, third, 'up')
      const rows = await menuRows(s)
      expect(rows[1]!._id).toBe(third)
      expect(rows.every((r, j) => j === 0 || r.order > rows[j - 1]!.order)).toBe(true)
    }
    const rows = await menuRows(s)
    expect([rows[0]!._id, ...rows.slice(3).map((r) => r._id)]).toEqual([ids[0], ...ids.slice(3)])
  })

  it('the first entry up and the last entry down change nothing', async () => {
    const s = await setup()
    const before = await menuRows(s)
    expect(await move(s, s.entries['menu-saibling']!, 'up')).toEqual({ order: 1, contentRev: 1 })
    expect(await move(s, s.entries['menu-topfen']!, 'down')).toEqual({ order: 8, contentRev: 1 })
    expect(await menuRows(s)).toEqual(before)
  })

  it('two moves of different entries at once both apply', async () => {
    const s = await setup()
    await Promise.all([move(s, s.entries['menu-frittaten']!, 'up'), move(s, s.entries['menu-topfen']!, 'up')])
    expect((await menuRows(s)).map((r) => r._id)).toEqual(['menu-frittaten', 'menu-saibling', 'menu-schnitzel', 'menu-risotto', 'menu-dal', 'menu-marillen', 'menu-topfen', 'menu-veltliner'].map((k) => s.entries[k]))
  })

  it('a removed entry is passed over: the next live one is the neighbour', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: s.entries['menu-frittaten']!, lifeRev: 1 })
    await move(s, s.entries['menu-schnitzel']!, 'up')
    const live = (await menuRows(s)).filter((r) => !r.deletedAt).map((r) => r._id)
    expect(live.slice(0, 2)).toEqual([s.entries['menu-schnitzel'], s.entries['menu-saibling']])
  })

  it('refuses staff, an auto-sorted collection and a removed entry', async () => {
    const s = await setup()
    expect((await errorOf(move(s, s.entries['menu-frittaten']!, 'up', 'cook'))).code).toBe('FORBIDDEN')
    expect((await errorOf(move(s, s.entries.martinigans!, 'up'))).code).toBe('INVALID')
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: s.entries['menu-frittaten']!, lifeRev: 1 })
    expect((await errorOf(move(s, s.entries['menu-frittaten']!, 'up'))).code).toBe('CHANGED_SINCE')
  })
})

describe('tasks.prefill', () => {
  it('soldOut on 2026-10-11T23:30Z is already Monday 2026-10-12 in Vienna, so until is 2026-10-12', async () => {
    vi.setSystemTime(new Date('2026-10-11T23:30:00Z'))
    const { as } = await setup()
    const values = await as.owner.query(api.tasks.prefill, { site: 'restaurant', task: 'notices.soldOut' })
    expect(values).toEqual({ text: { de: 'Heute sind wir ausgebucht.', en: 'We are fully booked today.' }, until: '2026-10-12' })
  })

  it('lunchWeek: weekOf is the Monday of this week, the stored days stay', async () => {
    vi.setSystemTime(new Date('2026-10-11T23:30:00Z'))
    const { t, as, entries } = await setup()
    const lunch = await t.run((ctx) => ctx.db.get(entries.lunch!))
    const values = await as.cook.query(api.tasks.prefill, { site: 'restaurant', task: 'lunch.lunchWeek', entry: entries.lunch! })
    expect(values).toEqual({ ...lunch!.data, weekOf: '2026-10-12' })
  })

  // Wrong behaviour caught: a week planned for today is what the website shows, but the cook's weekly task could
  // only edit the single, so the cook's change never appeared (or the cook was refused the planned week).
  it('lunchWeek fills the week planned for this week; a week planned for later is not the task\'s', async () => {
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'))
    const { t, as, entries } = await setup()
    const plan = entries['plan-kw42']!
    const values = await as.cook.query(api.tasks.prefill, { site: 'restaurant', task: 'lunch.lunchWeek', entry: plan })
    expect(values).toMatchObject({ weekOf: '2026-10-12' })
    const days = (values as { days: { day: string }[] }).days
    expect(days[1]).toMatchObject({ day: 'tu', dish: { de: 'Krautfleckerl mit Speck' } })
    const fields = { days: days.map((d) => (d.day === 'tu' ? { ...d, dish: { de: 'Kürbisgulasch' } } : d)) }
    // The task needs approval, also on the planned week: a proposal, then live once the owner says yes.
    const proposed = await as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'lunch.lunchWeek', entry: plan, baseRev: 1, fields }) as { proposal: Id<'proposals'> }
    expect(proposed).toMatchObject({ status: 'open' })
    await as.owner.mutation(api.proposals.approve, { proposal: proposed.proposal })
    expect(((await t.run((ctx) => ctx.db.get(plan)))!.data as { days: { dish: unknown }[] }).days[1]!.dish).toEqual({ de: 'Kürbisgulasch' })

    vi.setSystemTime(new Date('2026-10-06T08:00:00Z'))
    const later = as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'lunch.lunchWeek', entry: plan, baseRev: 2, fields })
    expect((await errorOf(later)).code).toBe('FORBIDDEN')
  })
})

// Astra phase 5 review, findings in entries.ts.
describe('entries.create and lifecycle after the phase 5 review', () => {
  const pumpkin = { title: { de: 'Kürbisabend', en: 'Pumpkin night' }, when: { from: '2026-11-05', to: '2026-11-05' }, description: { de: 'Suppe und Musik.' } }

  it('a translation sent with a new entry is fresh, not a fallback', async () => {
    const { t, as } = await setup()
    const { entry } = await as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: pumpkin }) as { entry: Id<'entries'> }
    const row = (await t.run((ctx) => ctx.db.get(entry)))!
    expect(Object.keys(row.prints)).toContain('title')
    expect(row.prints.title!.en).toBe(printOf('Kürbisabend'))
  })

  it('a retired field cannot be written on create', async () => {
    const { t, as } = await setup()
    await t.run(async (ctx) => {
      const site = (await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', 'restaurant')).unique())!
      const schema = structuredClone(site.schema)
      schema.bricks.events.fields.booking.retired = true
      schema.retired['events.booking'] = { drop: true }
      await ctx.db.patch(site._id, { schema })
    })
    const call = as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: { ...pumpkin, booking: 'not a url but retired' } })
    expect(await errorOf(call)).toMatchObject({ code: 'INVALID', details: { field: 'booking' } })
  })

  it('remove and restore advance rev with lifeRev (SPEC 3)', async () => {
    const { t, as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    await as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry, lifeRev: 2 })
    expect(await t.run((ctx) => ctx.db.get(entry))).toMatchObject({ rev: 3, lifeRev: 3 })
  })
})
