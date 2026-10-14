// Drafts of collection entries against SPEC 15: create/publish/unpublish/publishDue, the bundle,
// revisions, rights, and the readers that must treat a draft apart (retention, backup).
import type { Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, opId, setup } from './setup'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const event = (title: string) => ({
  title: { de: title }, when: { from: '2026-11-20', to: '2026-11-20' },
  description: { de: 'Test' },
})
const dish = (name: string) => ({ category: 'starters', name: { de: name }, price: { amount: 900 }, allergens: ['A'], veg: 'none' })

type Bundle = { contentRev: number; bricks: Record<string, { items?: { id: string; data: Record<string, unknown>; urls?: Record<string, string>; updatedAt?: string }[] }> }

/** The restaurant with drafts switched on for events (routed), menu (staff tasks) and notices (expiring). */
async function draftSetup() {
  // Fake timers must run before anything is scheduled: the scheduler of convex-test uses setTimeout.
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const s = await setup()
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    for (const key of ['events', 'menu', 'notices']) (schema.bricks[key] as { drafts?: boolean }).drafts = true
    await ctx.db.patch(s.site, { schema })
  })
  const bundle = async (): Promise<Bundle> => (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json() as Promise<Bundle>
  const row = (id: string) => s.t.run((ctx) => ctx.db.get(id as Id<'entries'>))
  const siteRow = () => s.t.run((ctx) => ctx.db.get(s.site))
  const createDraft = async (title: string, publish?: { at?: number }) =>
    s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: event(title), ...(publish ? { publish } : {}) })
  /** Moves the fake clock (timers included) and lets the scheduled functions that are due run. */
  const advanceTo = async (time: number) => {
    vi.advanceTimersByTime(time - Date.now())
    await s.t.finishInProgressScheduledFunctions()
  }
  return { ...s, bundle, row, siteRow, createDraft, advanceTo }
}

const idsOf = (bundle: Bundle) => bundle.bricks.events!.items!.map((i) => i.id)

afterEach(() => vi.useRealTimers())

describe('drafts in the public bundle', () => {
  it('a draft is absent from the bundle and from urls; publish brings it in, unpublish takes it out', async () => {
    const s = await draftSetup()
    const before = await s.siteRow()
    const draft = await s.createDraft('Wildwoche')
    expect(draft).toMatchObject({ state: 'draft', rev: 1, contentRev: before!.contentRev })

    const hidden = await s.bundle()
    expect(idsOf(hidden)).not.toContain(draft.entry)
    expect(JSON.stringify(hidden)).not.toContain('wildwoche')

    const published = await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 })
    expect(published).toMatchObject({ state: 'live', lifeRev: 2, contentRev: before!.contentRev + 1 })
    const shown = await s.bundle()
    expect(shown.bricks.events!.items!.find((i) => i.id === draft.entry)!.urls).toEqual({ de: '/veranstaltungen/wildwoche' })

    const withdrawn = await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 2 })
    expect(withdrawn).toMatchObject({ state: 'draft', lifeRev: 3, contentRev: before!.contentRev + 2 })
    expect(idsOf(await s.bundle())).not.toContain(draft.entry)
  })

  // Wrong behaviour caught: sitemap lastmod shows the time of an invisible draft edit instead of the time the page went online.
  it('a published entry carries the time of its publish, not of the draft edits before it', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Wildwoche')
    await s.advanceTo(NOW + HOUR)
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: 1, fields: { title: { de: 'Wildwoche 2' } }, sentence: 'Titel' })
    await s.advanceTo(NOW + 2 * HOUR)
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 })
    await s.advanceTo(NOW + 3 * HOUR)
    const published = (await s.bundle()).bricks.events!.items!.find((i) => i.id === draft.entry)!
    expect(published.updatedAt).toBe(new Date(NOW + 2 * HOUR).toISOString())

    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: 3, fields: { title: { de: 'Wildwoche 3' } }, sentence: 'Titel' })
    const edited = (await s.bundle()).bricks.events!.items!.find((i) => i.id === draft.entry)!
    expect(edited.updatedAt).toBe(new Date(NOW + 3 * HOUR).toISOString())
  })

  it('publish: {} on a drafts collection is live at once', async () => {
    const s = await draftSetup()
    const live = await s.createDraft('Sofort', {})
    expect(live).toMatchObject({ state: 'live' })
    expect(await s.row(live.entry)).not.toHaveProperty('state')
    expect(idsOf(await s.bundle())).toContain(live.entry)
  })

  it('a collection without drafts ignores publish: the entry is live and no job is scheduled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const s = await setup()
    const created = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: dish('Neu'), publish: { at: NOW + HOUR } })
    expect(created).toMatchObject({ state: 'live' })
    expect(await s.t.run((ctx) => ctx.db.get(created.entry as Id<'entries'>))).toMatchObject({ lifeRev: 1 })
    expect(await s.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).toHaveLength(0)
  })
})

describe('scheduled publishing', () => {
  it('a scheduled draft appears after publishAt, as actor system, with contentRev+1', async () => {
    const s = await draftSetup()
    const at = NOW + 2 * HOUR
    const before = await s.siteRow()
    const draft = await s.createDraft('Adventsmarkt', { at })
    expect(draft).toMatchObject({ state: 'draft', publishAt: at, contentRev: before!.contentRev })
    expect(await s.row(draft.entry)).toMatchObject({ state: 'draft', publishAt: at })

    await s.advanceTo(at - 1000)
    expect(idsOf(await s.bundle())).not.toContain(draft.entry)

    await s.advanceTo(at + 1000)
    expect(idsOf(await s.bundle())).toContain(draft.entry)
    const entry = await s.row(draft.entry)
    expect(entry).toMatchObject({ state: 'live', lifeRev: 2 })
    expect(entry!.publishAt).toBeUndefined()
    expect(entry!.publishJob).toBeUndefined()
    expect((await s.siteRow())!.contentRev).toBe(before!.contentRev + 1)
    const changes = await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', draft.entry)).collect())
    expect(changes.map((c) => [c.kind, c.actor])).toEqual([['create', 'u-wirtin'], ['publish', 'system']])
  })

  it('a rescheduled job does not publish at the old time', async () => {
    const s = await draftSetup()
    const first = NOW + 2 * HOUR
    const second = NOW + 5 * HOUR
    const draft = await s.createDraft('Umgeplant', { at: first })
    const oldJob = (await s.row(draft.entry))!.publishJob!

    const moved = await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1, at: second })
    expect(moved).toMatchObject({ state: 'draft', publishAt: second, lifeRev: 2 })
    expect(await s.t.run((ctx) => ctx.db.system.get(oldJob))).toMatchObject({ state: { kind: 'canceled' } })

    await s.advanceTo(first + 1000)
    expect(idsOf(await s.bundle())).not.toContain(draft.entry)
    // Even a run for the old time that slipped through does nothing.
    await s.t.mutation(internal.entries.publishDue, { entry: draft.entry as Id<'entries'>, at: first })
    expect(await s.row(draft.entry)).toMatchObject({ state: 'draft', publishAt: second })

    await s.advanceTo(second + 1000)
    expect(idsOf(await s.bundle())).toContain(draft.entry)
  })

  it('unpublish of a scheduled draft and removing one both cancel the job', async () => {
    const s = await draftSetup()
    const at = NOW + 2 * HOUR
    const before = await s.siteRow()
    const a = await s.createDraft('Zurückgestellt', { at })
    const b = await s.createDraft('Gelöscht', { at })
    const jobA = (await s.row(a.entry))!.publishJob!
    const jobB = (await s.row(b.entry))!.publishJob!

    const unscheduled = await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: a.entry, lifeRev: 1 })
    expect(unscheduled).toMatchObject({ state: 'draft', contentRev: before!.contentRev })
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: b.entry, lifeRev: 1 })
    expect((await s.siteRow())!.contentRev).toBe(before!.contentRev)
    expect(await s.t.run((ctx) => ctx.db.system.get(jobA))).toMatchObject({ state: { kind: 'canceled' } })
    expect(await s.t.run((ctx) => ctx.db.system.get(jobB))).toMatchObject({ state: { kind: 'canceled' } })

    await s.advanceTo(at + 1000)
    expect(idsOf(await s.bundle())).not.toContain(a.entry)
    expect(idsOf(await s.bundle())).not.toContain(b.entry)
    expect(await s.row(a.entry)).toMatchObject({ state: 'draft' })
  })

  it.each([
    { name: 'in the past', at: NOW - 1000 },
    { name: 'now', at: NOW },
    { name: 'more than a year ahead', at: NOW + 366 * DAY },
    { name: 'not a whole number', at: NOW + 1.5 },
  ])('a publish time $name is INVALID, on create and on publish', async ({ at }) => {
    const s = await draftSetup()
    expect((await errorOf(s.createDraft('Zeit', { at }))).code).toBe('INVALID')
    const draft = await s.createDraft('Zeit 2')
    expect((await errorOf(s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1, at }))).code).toBe('INVALID')
    expect(await s.row(draft.entry)).toMatchObject({ state: 'draft', lifeRev: 1 })
  })
})

describe('revisions and slugs of a draft', () => {
  it('editing a draft bumps rev and fieldRevs but not contentRev; editing a live entry bumps all three', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Bearbeitung')
    const rev = (await s.siteRow())!.contentRev

    const edited = await s.as.owner.mutation(api.entries.save, {
      site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: 1, fields: { title: { de: 'Bearbeitung neu' } }, sentence: 'Titel',
    })
    expect(edited).toMatchObject({ rev: 2, contentRev: rev })
    expect(await s.row(draft.entry)).toMatchObject({ rev: 2, fieldRevs: { title: 2 } })
    // Undo of a draft edit is no public change either.
    const undone = await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: edited.change as string })
    expect(undone).toMatchObject({ rev: 3, contentRev: rev })
    expect((await s.siteRow())!.contentRev).toBe(rev)

    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 })
    const live = await s.as.owner.mutation(api.entries.save, {
      site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: 4, fields: { title: { de: 'Live bearbeitet' } }, sentence: 'Titel',
    })
    expect(live).toMatchObject({ rev: 5, contentRev: rev + 2 })
  })

  it('the slug of a draft is reserved: the next entry with the same title gets a suffix', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Martinsfest')
    expect((await s.row(draft.entry))!.data.slug).toEqual({ de: 'martinsfest', en: 'martinsfest' })
    const second = await s.createDraft('Martinsfest', {})
    expect((await s.row(second.entry))!.data.slug).toEqual({ de: 'martinsfest-2', en: 'martinsfest-2' })
    // The draft keeps its address when it goes online.
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 })
    expect((await s.bundle()).bricks.events!.items!.find((i) => i.id === draft.entry)!.urls!.de).toBe('/veranstaltungen/martinsfest')
  })

  it('a draft takes a place in the collection max', async () => {
    const s = await draftSetup()
    const limit = ((await s.siteRow())!.schema as Schema).bricks.notices as { max: number }
    // Keep the old notice visible, so nothing expired can make room.
    await s.t.run((ctx) => ctx.db.patch(s.entries['notice-urlaub']!, { data: { text: { de: 'Urlaub' }, until: '2026-12-31' } }))
    const rows = await s.t.run((ctx) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', s.site).eq('brick', 'notices')).collect())
    // Fill the rest of the collection with drafts, then one more is refused.
    for (let i = rows.filter((r) => !r.deletedAt).length; i < limit.max; i++) {
      await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: { text: { de: `Entwurf ${i}` }, until: '2026-12-31' } })
    }
    const full = s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: { text: { de: 'Zu viel' }, until: '2026-12-31' } })
    expect(await errorOf(full)).toMatchObject({ code: 'INVALID' })
  })
})

describe('rights', () => {
  it('staff without a create or edit task of the brick is FORBIDDEN on publish and unpublish', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Nur Wirtin')
    const publish = (task?: string) => s.as.cook.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), ...(task ? { task } : {}), entry: draft.entry, lifeRev: 1 })
    expect((await errorOf(publish())).code).toBe('FORBIDDEN')
    expect((await errorOf(publish('menu.add'))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.stranger.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 }))).code).toBe('FORBIDDEN')
    expect(await s.row(draft.entry)).toMatchObject({ state: 'draft', lifeRev: 1 })
  })

  it.each([
    { task: 'menu.add', why: 'a create task' },
    { task: 'menu.price', why: 'an edit task' },
  ])('the cook may publish and unpublish a dish with $why', async ({ task }) => {
    const s = await draftSetup()
    const dishDraft = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: dish('Neu') })
    const published = await s.as.cook.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), task, entry: dishDraft.entry, lifeRev: 1 })
    expect(published).toMatchObject({ state: 'live' })
    await expect(s.as.cook.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), task, entry: dishDraft.entry, lifeRev: 2 })).resolves.toMatchObject({ state: 'draft' })
  })

  it('a remove task alone does not publish', async () => {
    const s = await draftSetup()
    const dishDraft = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: dish('Neu') })
    expect((await errorOf(s.as.cook.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), task: 'menu.remove', entry: dishDraft.entry, lifeRev: 1 }))).code).toBe('FORBIDDEN')
  })
})

describe('preconditions', () => {
  it('publish on a live entry is INVALID, a stale lifeRev is CHANGED_SINCE with the state, a retry with the same opId replays', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Doppelt')
    const args = { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 }
    const first = await s.as.owner.mutation(api.entries.publish, args)
    expect(await s.as.owner.mutation(api.entries.publish, args)).toEqual(first)
    expect(await errorOf(s.as.owner.mutation(api.entries.publish, { ...args, opId: opId() }))).toMatchObject({ code: 'CHANGED_SINCE', details: { lifeRev: 2, state: 'live' } })
    expect((await errorOf(s.as.owner.mutation(api.entries.publish, { ...args, opId: opId(), lifeRev: 2 }))).code).toBe('INVALID')
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 2 })
    expect((await errorOf(s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 3 }))).code).toBe('INVALID')
  })

  it('unpublish on a collection without drafts is INVALID', async () => {
    const s = await setup()
    expect((await errorOf(s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: s.entries.weinabend!, lifeRev: 1 }))).code).toBe('INVALID')
  })
})

describe('readers that treat a draft apart', () => {
  it('retention leaves an expired draft alone, but removes an expired live notice', async () => {
    const s = await draftSetup()
    await s.t.run(async (ctx) => {
      // 2026-07-01 is far more than 30 days back.
      await ctx.db.patch(s.entries['notice-urlaub']!, { data: { text: { de: 'Alt' }, until: '2026-07-01' } })
      await ctx.db.patch(s.entries['notice-ausgebucht']!, { data: { text: { de: 'Alt entwurf' }, until: '2026-07-01' }, state: 'draft' })
    })
    await s.t.mutation(internal.retention.daily, {})
    expect((await s.row(s.entries['notice-urlaub']!))!.deletedAt).toBeDefined()
    expect((await s.row(s.entries['notice-ausgebucht']!))!.deletedAt).toBeUndefined()
  })

  it('the export keeps the draft with its state and schedule; the editor read lists it', async () => {
    const s = await draftSetup()
    const at = NOW + HOUR
    const draft = await s.createDraft('Gesichert', { at })
    const snapshot = await s.t.query(internal.backup.snapshot, { site: s.site })
    expect(snapshot.entries.find((e) => e.id === draft.entry)).toMatchObject({ state: 'draft', publishAt: at })
    expect(snapshot.entries.find((e) => e.id === s.entries.weinabend)).not.toHaveProperty('state')

    const read = await s.as.cook.query(api.sites.get, { site: 'restaurant' })
    expect(read.entries.find((e) => e._id === draft.entry)).toMatchObject({ state: 'draft', publishAt: at })
  })
})
