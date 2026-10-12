// entries.create, remove, restore, reorder and tasks.prefill against SPEC 2.2, 2.7, 3 and 4.2.
import { printOf } from '@lupinum/ginko'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, opId, setup } from './setup'

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

  it('autoRemoveExpired: the expired notice is removed first, as a remove change of actor system', async () => {
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
    const before = await as.owner.query(api.sites.get, { site: 'restaurant' })
    const lifeRev = before.entries.find((e) => e._id === notice)!.lifeRev
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: notice, lifeRev })
    expect((await as.cook.query(api.entries.removed, { site: 'restaurant', brick: 'notices' })).map((e) => e._id)).toEqual([notice])
    expect(await as.stranger.query(api.entries.removed, { site: 'andere', brick: 'notices' })).toEqual([])
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

  it('an entry of site andere is NOT_FOUND for remove, restore and reorder via site restaurant', async () => {
    const { t, as, other, entries } = await setup()
    const foreign = await t.run((ctx) => ctx.db.insert('entries', { site: other, brick: 'menu', kind: 'item', order: 1, data: {}, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 2 }))
    expect(await errorOf(as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: foreign, lifeRev: 1 }))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await errorOf(as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: foreign, lifeRev: 1 }))).toMatchObject({ code: 'NOT_FOUND' })
    const menu = Object.keys(entries).filter((k) => k.startsWith('menu-')).map((k) => entries[k]!)
    expect(await errorOf(as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'menu', order: [foreign, ...menu], orderRev: 0 }))).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('entries.reorder', () => {
  const menuIds = (entries: Record<string, Id<'entries'>>) => Object.keys(entries).filter((k) => k.startsWith('menu-')).map((k) => entries[k]!)

  it('a second reorder with the same orderRev is CHANGED_SINCE; the first one moves the list', async () => {
    const { as, entries } = await setup()
    const reversed = menuIds(entries).reverse()
    await expect(as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'menu', order: reversed, orderRev: 0 })).resolves.toEqual({ orderRev: 1, contentRev: 2 })
    expect(await errorOf(as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'menu', order: menuIds(entries), orderRev: 0 }))).toMatchObject({ code: 'CHANGED_SINCE', details: { orderRev: 1 } })
  })

  it.each([
    { why: 'a missing id', order: (ids: Id<'entries'>[]) => ids.slice(1), code: 'INVALID' },
    { why: 'a duplicate id', order: (ids: Id<'entries'>[]) => [...ids.slice(0, -1), ids[0]!], code: 'INVALID' },
  ])('rejects a list with $why', async ({ order, code }) => {
    const { as, entries } = await setup()
    const call = as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'menu', order: order(menuIds(entries)), orderRev: 0 })
    expect((await errorOf(call)).code).toBe(code)
  })

  it('rejects a list with a deleted id', async () => {
    const { as, entries } = await setup()
    await as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: entries['menu-topfen']!, lifeRev: 1 })
    const call = as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'menu', order: menuIds(entries), orderRev: 1 })
    expect((await errorOf(call)).code).toBe('INVALID')
  })

  it('reorder on a collection with a date order is rejected', async () => {
    const { as, entries } = await setup()
    const events = Object.keys(entries).filter((k) => ['weinabend', 'martinigans', 'sommerfest'].includes(k)).map((k) => entries[k]!)
    const call = as.owner.mutation(api.entries.reorder, { site: 'restaurant', opId: opId(), brick: 'events', order: events, orderRev: 0 })
    expect((await errorOf(call)).code).toBe('INVALID')
  })
})

describe('tasks.prefill', () => {
  it('soldOut on 2026-10-11T23:30Z is already Monday 2026-10-12 in Vienna, so until is 2026-10-12', async () => {
    vi.setSystemTime(new Date('2026-10-11T23:30:00Z'))
    const { as } = await setup()
    const values = await as.owner.query(api.tasks.prefill, { site: 'restaurant', task: 'notices.soldOut' })
    expect(values).toEqual({ text: { de: 'Heute sind wir ausgebucht.' }, until: '2026-10-12' })
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
      schema.retired['events.booking'] = {}
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
