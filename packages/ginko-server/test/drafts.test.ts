// Drafts and unpublished changes against SPEC 15 (D60: every collection and single, no `drafts` option):
// create/publish/unpublish/publishDue, the bundle, revisions, rights, and the readers that must treat a draft apart
// (retention, backup).
import type { Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, opId, people, setup, upload } from './setup'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const event = (title: string) => ({
  title: { de: title }, when: { from: '2026-11-20', to: '2026-11-20' },
  description: { de: 'Test' },
})
const dish = (name: string) => ({ category: 'starters', name: { de: name }, price: { amount: 900 }, allergens: ['A'], veg: 'none' })

type Bundle = { contentRev: number; bricks: Record<string, { items?: { id: string; data: Record<string, unknown>; urls?: Record<string, string>; updatedAt?: string }[] }> }

/** The restaurant on a fake clock: events (routed), menu (staff tasks) and notices (expiring) are the collections used. */
async function draftSetup() {
  // Fake timers must run before anything is scheduled: the scheduler of convex-test uses setTimeout.
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const s = await setup()
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

/**
 * Takes the required description out of a stored draft, as an import keeps it (it checks only the shape), so the draft
 * fails the full check; `false` puts it back.
 */
const breakDraft = (s: Awaited<ReturnType<typeof draftSetup>>, id: string, broken = true) => s.t.run(async (ctx) => {
  const { description: _, ...data } = (await ctx.db.get(id as Id<'entries'>))!.data as Record<string, unknown>
  await ctx.db.patch(id as Id<'entries'>, { data: broken ? data : { ...data, description: { de: 'Test' } } })
})

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

    // A save of the live entry waits unpublished; its publish is the new time.
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: 3, fields: { title: { de: 'Wildwoche 3' } }, sentence: 'Titel' })
    await s.advanceTo(NOW + 4 * HOUR)
    expect((await s.bundle()).bricks.events!.items!.find((i) => i.id === draft.entry)!.updatedAt).toBe(new Date(NOW + 2 * HOUR).toISOString())
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 2 })
    const edited = (await s.bundle()).bricks.events!.items!.find((i) => i.id === draft.entry)!
    expect(edited.updatedAt).toBe(new Date(NOW + 4 * HOUR).toISOString())
  })

  it('publish: {} is live at once', async () => {
    const s = await draftSetup()
    const live = await s.createDraft('Sofort', {})
    expect(live).toMatchObject({ state: 'live' })
    expect(await s.row(live.entry)).not.toHaveProperty('state')
    expect(idsOf(await s.bundle())).toContain(live.entry)
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

describe('the full check where a draft goes online (D101)', () => {
  const paths = (error: { details?: unknown }) => (error.details as { errors: { path: string }[] }).errors.map((e) => e.path)

  // Wrong behaviour caught: a draft that misses a required field goes online half-filled, now or by a plan.
  it('publish now and publish with a time refuse a draft that fails the full check, with the field errors', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Halb')
    await breakDraft(s, draft.entry)
    for (const at of [undefined, NOW + 2 * HOUR]) {
      const error = await errorOf(s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1, ...(at ? { at } : {}) }))
      expect(error.code).toBe('INVALID')
      expect(paths(error)).toEqual(['description'])
    }
    expect(await s.row(draft.entry)).toMatchObject({ state: 'draft', lifeRev: 1 })
    expect((await s.row(draft.entry))!.publishAt).toBeUndefined()
  })

  // Wrong behaviour caught: the job at the time publishes what changed under the plan without checking it again.
  it('the job at the time stops a planned draft that fails the full check: it stays a draft and the history says why', async () => {
    const s = await draftSetup()
    const at = NOW + 2 * HOUR
    const draft = await s.createDraft('Geplant halb', { at })
    await breakDraft(s, draft.entry)
    await s.advanceTo(at + 1000)
    const row = (await s.row(draft.entry))!
    expect(row).toMatchObject({ state: 'draft' })
    expect(row.publishAt).toBeUndefined()
    expect(idsOf(await s.bundle())).not.toContain(draft.entry)
    const changes = await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', draft.entry as Id<'entries'>)).collect())
    expect(changes.at(-1)).toMatchObject({ kind: 'publishStopped', actor: 'system', msg: { key: 'history.publishStoppedInvalid', params: { count: 1, fields: { de: 'Beschreibung', en: 'Description' } } } })
    // Wrong behaviour caught (D103): the failed plan leaves no trace on the entry, so nobody sees it.
    expect(row.stopped).toEqual({ at, by: 'u-wirtin', reason: { code: 'invalid', fields: ['description'] } })
  })

  // Wrong behaviour caught: a save of a planned draft passes on the changed field alone and the plan stops at its time.
  it('a save of a planned draft that leaves it failing the full check is refused; a draft without a time saves', async () => {
    const s = await draftSetup()
    const planned = await s.createDraft('Geplant', { at: NOW + 2 * HOUR })
    const plain = await s.createDraft('Ohne Zeit')
    for (const id of [planned.entry, plain.entry]) await breakDraft(s, id)
    const retitle = (id: string, baseRev: number) =>
      s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: id, baseRev, fields: { title: { de: 'Neu' } }, sentence: 'Titel' })
    const error = await errorOf(retitle(planned.entry, 1))
    expect(error.code).toBe('INVALID')
    expect(paths(error)).toEqual(['description'])
    expect(await retitle(plain.entry, 1)).toMatchObject({ rev: 2 })
  })
})

describe('the planner of a draft (D102)', () => {
  // Wrong behaviour caught: a plan that stops cannot say whom to tell, or an ended plan still names a planner.
  it('the planner is written with the time and cleared with it: publish now, cancel, remove and the job', async () => {
    const s = await draftSetup()
    const at = NOW + 2 * HOUR
    const by = async (id: string) => (await s.row(id))!.publishBy
    const call = (fn: typeof api.entries.publish | typeof api.entries.unpublish | typeof api.entries.remove, id: string, extra: object = {}) =>
      s.as.owner.mutation(fn, { site: 'restaurant', opId: opId(), entry: id, lifeRev: 1, ...extra } as never)
    const created = await s.createDraft('Erstellt geplant', { at })
    const published = await s.createDraft('Veröffentlicht')
    const cancelled = await s.createDraft('Abgesagt')
    const removed = await s.createDraft('Entfernt', { at })
    await call(api.entries.publish, published.entry, { at })
    await call(api.entries.publish, cancelled.entry, { at })
    for (const id of [created.entry, published.entry, cancelled.entry, removed.entry]) expect(await by(id)).toBe('u-wirtin')

    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: published.entry, lifeRev: 2 })
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: cancelled.entry, lifeRev: 2 })
    await call(api.entries.remove, removed.entry)
    await s.advanceTo(at + 1000)
    for (const id of [created.entry, published.entry, cancelled.entry, removed.entry]) expect(await by(id)).toBeUndefined()
    expect(await s.row(created.entry)).toMatchObject({ state: 'live' })
  })
})

describe('a stopped plan (D103)', () => {
  // Wrong behaviour caught: an entry is planned and stopped at once, or a stopped plan outlives the write that ends it.
  it('planned and stopped are never both set, and a new plan, a publish, cancel and remove clear stopped', async () => {
    const s = await draftSetup()
    let time = NOW
    const life = async (id: string) => (await s.row(id))!.lifeRev
    const both = async () => (await s.t.run((ctx) => ctx.db.query('entries').collect())).filter((r) => r.publishAt !== undefined && r.stopped !== undefined)
    const plan = async (id: string) => {
      time += HOUR
      await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: id, lifeRev: await life(id), at: time })
    }
    /** Plans the draft, breaks it and lets the job run: the plan stops. Then the draft is whole again. */
    const stop = async (id: string) => {
      await plan(id)
      expect(await both()).toEqual([])
      await breakDraft(s, id)
      await s.advanceTo(time + 1000)
      await breakDraft(s, id, false)
      const row = (await s.row(id))!
      expect(row.stopped).toMatchObject({ at: time, by: 'u-wirtin' })
      expect(row.publishAt).toBeUndefined()
    }
    const shape = async (id: string) => {
      const row = (await s.row(id))!
      return { state: row.state ?? 'live', planned: row.publishAt !== undefined, stopped: row.stopped !== undefined }
    }
    const a = await s.createDraft('Stopp A')
    const b = await s.createDraft('Stopp B')

    await stop(a.entry)
    await plan(a.entry)
    expect(await shape(a.entry)).toEqual({ state: 'draft', planned: true, stopped: false })

    await breakDraft(s, a.entry)
    await s.advanceTo(time + 1000)
    await breakDraft(s, a.entry, false)
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: a.entry, lifeRev: await life(a.entry) })
    expect(await shape(a.entry)).toEqual({ state: 'draft', planned: false, stopped: false })

    await stop(a.entry)
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: a.entry, lifeRev: await life(a.entry) })
    expect(await shape(a.entry)).toEqual({ state: 'live', planned: false, stopped: false })

    await stop(b.entry)
    const removed = await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: b.entry, lifeRev: await life(b.entry) })
    expect(await shape(b.entry)).toEqual({ state: 'draft', planned: false, stopped: false })
    await s.as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: b.entry, lifeRev: (removed as { lifeRev: number }).lifeRev })
    expect(await shape(b.entry)).toEqual({ state: 'draft', planned: false, stopped: false })
    expect(await both()).toEqual([])
  })

  it('a plain draft still has nothing to cancel', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Nichts geplant')
    expect(await errorOf(s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 }))).toMatchObject({ code: 'INVALID', key: 'errors.entryAlreadyDraft' })
  })
})

describe('people are told when a plan stops (D104)', () => {
  /** A draft planned by the owner, handed to `planner`, that fails the full check at its time. */
  async function stoppedBy(planner: string, mail = true, ownerLocale?: string) {
    if (mail) {
      vi.stubEnv('GINKO_MAIL', 'outbox')
      vi.stubEnv('SITE_URL', 'https://ginko.test')
    }
    const s = await draftSetup()
    if (ownerLocale) await s.t.run((ctx) => ctx.db.insert('userSettings', { user: people.owner, remindByMail: false, locale: ownerLocale }))
    const at = Date.parse('2026-10-08T12:30:00Z')
    const draft = await s.createDraft('Herbstfest', { at })
    await s.t.run((ctx) => ctx.db.patch(draft.entry as Id<'entries'>, { publishBy: planner }))
    await breakDraft(s, draft.entry)
    await s.advanceTo(at + 1000)
    return { ...s, draft, at }
  }
  afterEach(() => vi.unstubAllEnvs())
  const outbox = (s: Awaited<ReturnType<typeof draftSetup>>) => s.t.run((ctx) => ctx.db.query('outbox').collect())

  // Wrong behaviour caught: a plan stops at night and nobody hears of it, or a person who left the site still gets mail.
  it('mails the planner while a member and every owner, each once, in their language, with the entry\'s link', async () => {
    const s = await stoppedBy(people.cook)
    const mails = await outbox(s)
    expect(mails.map((m) => m.to).sort()).toEqual(['koch@example.com', 'wirtin@example.com'])
    expect(mails[0]).toMatchObject({
      subject: '„Herbstfest“ ging nicht online',
      text: `Hallo,\n\ndein Eintrag war für Donnerstag, 8. Oktober, 14:30 Uhr geplant. Er ging nicht online, weil „Beschreibung“ fehlt oder ungültig ist.\n\nDer Eintrag ist sicher. Korrigiere ihn, dann veröffentliche ihn oder gib ihm einen neuen Tag.\n\nEintrag öffnen: https://ginko.test/s/restaurant/all/events/${s.draft.entry}\n`,
    })

    const left = await stoppedBy('u-weg')
    expect((await outbox(left)).map((m) => m.to)).toEqual(['wirtin@example.com'])
  })

  it('the owner gets one mail when she planned it herself, in her language', async () => {
    const s = await stoppedBy(people.owner, true, 'en')
    expect(await outbox(s)).toMatchObject([{
      to: 'wirtin@example.com',
      subject: '“Herbstfest” did not go online',
      text: `Hello,\n\nyour entry was planned for Thursday, October 8, 14:30. It did not go online, because “Description” is missing or not valid.\n\nThe entry is safe. Fix it, then publish it or give it a new day.\n\nOpen the entry: https://ginko.test/s/restaurant/all/events/${s.draft.entry}\n`,
    }])
  })

  // Wrong behaviour caught: a stopped plan is not on Today, or staff see the plans of others.
  it('Today lists a stopped plan for the owners and for its planner, with the cause as second line', async () => {
    const s = await stoppedBy(people.cook, false)
    const row = { entry: s.draft.entry, brick: 'events', at: s.at, titleText: '„Herbstfest“ ging nicht online', causeText: '„Beschreibung“ fehlt oder ist ungültig.' }
    expect(await s.as.owner.query(api.entries.stoppedPlans, { site: 'restaurant' })).toMatchObject([row])
    expect(await s.as.cook.query(api.entries.stoppedPlans, { site: 'restaurant' })).toMatchObject([row])
    await s.t.run((ctx) => ctx.db.patch(s.draft.entry as Id<'entries'>, { stopped: { at: s.at, by: people.owner, reason: { code: 'late' } } }))
    expect(await s.as.cook.query(api.entries.stoppedPlans, { site: 'restaurant' })).toEqual([])
    // Cancelling the plan takes it off Today.
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: s.draft.entry, lifeRev: (await s.row(s.draft.entry))!.lifeRev })
    expect(await s.as.owner.query(api.entries.stoppedPlans, { site: 'restaurant' })).toEqual([])
  })
})

describe('revisions and slugs of a draft', () => {
  it('editing a draft bumps rev and fieldRevs but not contentRev; publishing a live entry\'s saved changes bumps all three', async () => {
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
    expect(live).toMatchObject({ rev: 5, contentRev: rev + 1, pending: true })
    const out = await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 2 })
    expect(out).toMatchObject({ rev: 6, contentRev: rev + 2 })
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

describe('entry names (D96)', () => {
  const nameOf = async (s: Awaited<ReturnType<typeof draftSetup>>, id: string) => {
    const row = (await s.row(id))!
    return { name: row.name, nameFixed: row.nameFixed, slug: (row.data as { slug?: Record<string, string> }).slug?.de }
  }
  const slugRows = (s: Awaited<ReturnType<typeof draftSetup>>, id: string) =>
    s.t.run(async (ctx) => (await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', id as Id<'entries'>)).collect()).filter((r) => r.locale === 'de').map((r) => ({ slug: r.slug, old: r.old })))
  const retitle = (s: Awaited<ReturnType<typeof draftSetup>>, id: string, baseRev: number, title: string) =>
    s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: id, baseRev, fields: { title: { de: title } }, sentence: 'Titel' })

  // Wrong behaviour caught: two entries get one name, so a link or an export by name points at the wrong one.
  it('the same title twice gives x and x-2, as name and main slug together', async () => {
    const s = await draftSetup()
    const first = await s.createDraft('Martinsfest')
    const second = await s.createDraft('Martinsfest', {})
    expect(await nameOf(s, first.entry)).toEqual({ name: 'martinsfest', nameFixed: undefined, slug: 'martinsfest' })
    // Created online, the name is fixed at once.
    expect(await nameOf(s, second.entry)).toEqual({ name: 'martinsfest-2', nameFixed: true, slug: 'martinsfest-2' })
  })

  // Wrong behaviour caught: restoring the removed entry would give two entries one name.
  it('a name in the trash stays taken', async () => {
    const s = await draftSetup()
    const removed = await s.createDraft('Kürbisabend')
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: removed.entry, lifeRev: 1 })
    const next = await s.createDraft('Kürbisabend')
    expect((await nameOf(s, next.entry)).name).toBe('kuerbisabend-2')
  })

  // Wrong behaviour caught: a draft keeps the name of its first rough title, or its old address stays reserved as a
  // forward that nobody ever saw.
  it('a draft\'s title change makes the name and the main slug again and leaves no old row', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Erster Titel')
    await retitle(s, draft.entry, 1, 'Herbstball')
    expect(await nameOf(s, draft.entry)).toEqual({ name: 'herbstball', nameFixed: undefined, slug: 'herbstball' })
    expect(await slugRows(s, draft.entry)).toEqual([{ slug: 'herbstball', old: undefined }])
  })

  /** The name, the slug in `data` and the current slug rows, per language: the two must agree after every write. */
  const addressOf = async (s: Awaited<ReturnType<typeof draftSetup>>, id: string) => {
    const row = (await s.row(id))!
    const rows = await s.t.run(async (ctx) => (await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', id as Id<'entries'>)).collect()).filter((r) => !r.old))
    return { name: row.name, data: (row.data as { slug?: Record<string, string> }).slug, rows: Object.fromEntries(rows.map((r) => [r.locale, r.slug])) }
  }

  // Wrong behaviour caught: the English address keeps the first rough title after the draft's title changed, and goes
  // online with it; or an English address made from the English title is thrown away.
  it.each([
    { case: 'copied from the main slug follows it', english: undefined, en: 'herbstball' },
    { case: 'made from its own text stays', english: 'Autumn ball', en: 'autumn-ball' },
  ])('a foreign slug $case', async ({ english, en }) => {
    const s = await draftSetup()
    const draft = await s.createDraft('Erster Titel')
    let rev = 1
    if (english) rev = (await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: draft.entry, baseRev: rev, locale: 'en', fields: { title: { en: english } }, sentence: 'Titel' })).rev
    await retitle(s, draft.entry, rev, 'Herbstball')
    const slugs = { de: 'herbstball', en }
    expect(await addressOf(s, draft.entry)).toEqual({ name: 'herbstball', data: slugs, rows: slugs })
  })

  // Wrong behaviour caught: a followed slug is missing from the change row and its revision, so the history does not
  // show it and another open form does not see the conflict.
  it('a followed slug is part of the change: its revision rises and the change row holds it', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Erster Titel')
    const renamed = await retitle(s, draft.entry, 1, 'Herbstball')
    if (!('change' in renamed)) throw new Error('the title change wrote nothing')
    const change = await s.t.run((ctx) => ctx.db.get(renamed.change))
    expect(change).toMatchObject({ fields: ['title', 'slug'], before: { slug: { de: 'erster-titel', en: 'erster-titel' } }, after: { slug: { de: 'herbstball', en: 'herbstball' } } })
    expect((await s.row(draft.entry))!.fieldRevs.slug).toBe(renamed.rev)
  })

  // Wrong behaviour caught: the undo of a title change the slug followed puts the old slug into the data while the
  // slug rows keep the new one.
  it('the undo of a title change brings back name, slugs and slug rows', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Erster Titel')
    const renamed = await retitle(s, draft.entry, 1, 'Herbstball')
    if (!('change' in renamed)) throw new Error('the title change wrote nothing')
    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: renamed.change })
    const first = { de: 'erster-titel', en: 'erster-titel' }
    expect(await addressOf(s, draft.entry)).toEqual({ name: 'erster-titel', data: first, rows: first })
  })

  // Wrong behaviour caught: undoing an address change puts the old slug into the data while the slug rows keep the
  // new one, so the website's page and the reserved address differ.
  it('an unfixed draft: changeSlug, a title change, then undo of the changeSlug keeps data and slug rows equal', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Erster Titel')
    const moved = await s.as.owner.mutation(api.entries.changeSlug, { site: 'restaurant', opId: opId(), entry: draft.entry, locale: 'de', slug: 'handgemacht' })
    const step1 = { de: 'handgemacht', en: 'erster-titel' }
    expect(await addressOf(s, draft.entry)).toEqual({ name: 'erster-titel', data: step1, rows: step1 })
    await retitle(s, draft.entry, moved.rev, 'Herbstball')
    // A slug set by hand stays; the English one was copied from the old main slug, which was not "handgemacht".
    expect(await addressOf(s, draft.entry)).toEqual({ name: 'herbstball', data: step1, rows: step1 })
    const change = await s.t.run(async (ctx) => (await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', draft.entry as Id<'entries'>)).collect()).find((c) => c.fields?.length === 1 && c.fields[0] === 'slug')!)
    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change._id })
    const step3 = { de: 'erster-titel', en: 'erster-titel' }
    expect(await addressOf(s, draft.entry)).toEqual({ name: 'herbstball', data: step3, rows: step3 })
  })

  // Wrong behaviour caught: the undo takes an address another entry holds now, so two pages share one URL.
  it('the undo of an address change is refused when the old slug is taken now', async () => {
    const s = await draftSetup()
    const draft = await s.createDraft('Erster Titel')
    const moved = await s.as.owner.mutation(api.entries.changeSlug, { site: 'restaurant', opId: opId(), entry: draft.entry, locale: 'de', slug: 'handgemacht' })
    const other = await s.createDraft('Anderes')
    await s.as.owner.mutation(api.entries.changeSlug, { site: 'restaurant', opId: opId(), entry: other.entry, locale: 'de', slug: 'erster-titel' })
    const change = await s.t.run(async (ctx) => (await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', draft.entry as Id<'entries'>)).collect()).at(-1)!)
    expect(change.entryRev).toBe(moved.rev)
    expect(await errorOf(s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change._id }))).toMatchObject({ code: 'NOT_UNDOABLE', key: 'errors.undoAddressTaken' })
  })

  // Wrong behaviour caught: a name that links and the export already use changes once the entry was planned or online.
  // The entry is a draft again when its title changes, so only `nameFixed` (set by the publish or the plan) keeps it.
  it.each([
    { case: 'published and taken offline', at: undefined },
    { case: 'planned and the plan cancelled', at: NOW + DAY },
  ])('after it was $case, a title change leaves the name', async ({ at }) => {
    const s = await draftSetup()
    const entry = await s.createDraft('Sommerfest')
    const published = await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: entry.entry, lifeRev: 1, ...(at ? { at } : {}) })
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: entry.entry, lifeRev: published.lifeRev })
    const draft = (await s.row(entry.entry))!
    expect([draft.state, draft.publishAt]).toEqual(['draft', undefined])
    await retitle(s, entry.entry, draft.rev, 'Sommernachtsfest')
    expect(await nameOf(s, entry.entry)).toEqual({ name: 'sommerfest', nameFixed: true, slug: 'sommerfest' })
  })

  // Wrong behaviour caught: a new address renames the entry, so its links by name break.
  it('changeSlug leaves the name of a draft', async () => {
    const s = await draftSetup()
    const entry = await s.createDraft('Gansl-Essen')
    await s.as.owner.mutation(api.entries.changeSlug, { site: 'restaurant', opId: opId(), entry: entry.entry, locale: 'de', slug: 'gansl-im-november' })
    expect(await nameOf(s, entry.entry)).toEqual({ name: 'gansl-essen', nameFixed: undefined, slug: 'gansl-im-november' })
  })

  // Wrong behaviour caught: a title change gives a draft the name another entry holds, or a slug only an old forwarding
  // row holds, so two entries share a name or a forward points at the wrong page; or name and slug get different ends.
  it('a title change to a taken name, or to a slug an old forwarding row holds, gives -2 to name and slug together', async () => {
    const s = await draftSetup()
    await s.createDraft('Herbstball')
    // "markt-a" is held only by an old row: the live market moved on to "markt-b", and no entry has that name.
    const market = await s.createDraft('Wintermarkt', {})
    for (const slug of ['markt-a', 'markt-b']) await s.as.owner.mutation(api.entries.changeSlug, { site: 'restaurant', opId: opId(), entry: market.entry, locale: 'de', slug })
    const first = await s.createDraft('Erster Titel')
    const second = await s.createDraft('Zweiter Titel')
    await retitle(s, first.entry, 1, 'Herbstball')
    await retitle(s, second.entry, 1, 'Markt A')
    expect(await nameOf(s, first.entry)).toEqual({ name: 'herbstball-2', nameFixed: undefined, slug: 'herbstball-2' })
    expect(await nameOf(s, second.entry)).toEqual({ name: 'markt-a-2', nameFixed: undefined, slug: 'markt-a-2' })
  })

  // Wrong behaviour caught: a copy takes the name of the entry it copies, or a name that is not made from its title.
  it('a copy is named after its marked title', async () => {
    const s = await draftSetup()
    const original = await s.createDraft('Martinsfest')
    const copy = await s.as.owner.mutation(api.entries.duplicate, { site: 'restaurant', opId: opId(), entry: original.entry })
    expect(await nameOf(s, copy.entry)).toEqual({ name: 'martinsfest-kopie', nameFixed: undefined, slug: 'martinsfest-kopie' })
  })

  // Wrong behaviour caught: a live entry removed before its name was fixed comes back with a name that follows its
  // title, so an unpublish and a title change rename an entry that was online.
  it('a restored live entry has a fixed name', async () => {
    const s = await draftSetup()
    const entry = await s.createDraft('Adventmarkt', {})
    await s.t.run((ctx) => ctx.db.patch(entry.entry as Id<'entries'>, { nameFixed: undefined }))
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: entry.entry, lifeRev: 1 })
    await s.as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: entry.entry, lifeRev: 2 })
    expect((await nameOf(s, entry.entry)).nameFixed).toBe(true)
  })

  // Wrong behaviour caught: a title without letters gives an empty name, or a German word in an English site.
  it('a title without letters or digits gives the brick key as name', async () => {
    const s = await draftSetup()
    const create = () => s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'notices', data: { text: { de: '…' }, until: '2026-12-31' } })
    const first = await create()
    const second = await create()
    expect([(await s.row(first.entry))!.name, (await s.row(second.entry))!.name]).toEqual(['notices', 'notices-2'])
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

  // Wrong behaviour caught: a single taken offline, so the page that shows it loses its content.
  it('unpublish of a single is INVALID: a single stays online', async () => {
    const s = await setup()
    expect(await errorOf(s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry: s.entries.legal!, lifeRev: 1 }))).toMatchObject({ code: 'INVALID', key: 'errors.singleStaysOnline' })
  })
})

describe('drafts for Heute', () => {
  // Wrong behaviour caught: staff see "Meine Entwürfe" that someone else made, or the owner's drafts lose their date.
  it('the read of a brick marks a draft the caller made as own and dates every draft; live entries carry neither', async () => {
    const s = await draftSetup()
    const mine = await s.as.cook.mutation(api.entries.create, { site: 'restaurant', opId: opId(), task: 'menu.add', brick: 'menu', data: dish('Vom Koch') })
    vi.setSystemTime(NOW + HOUR)
    const theirs = await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: dish('Von der Chefin') })
    const read = async (as: typeof s.as.cook) => (await as.query(api.entries.ofBricks, { site: 'restaurant', bricks: ['menu'], slim: true })).filter((e) => e.state === 'draft')
    const asCook = await read(s.as.cook)
    expect(asCook.map((e) => [e._id, 'own' in e, typeof e.since])).toEqual(expect.arrayContaining([[mine.entry, true, 'number'], [theirs.entry, false, 'number']]))
    const asOwner = await read(s.as.owner)
    expect(asOwner.find((e) => e._id === mine.entry)).not.toHaveProperty('own')
    const live = (await s.as.cook.query(api.entries.ofBricks, { site: 'restaurant', bricks: ['menu'], slim: true })).find((e) => e.state !== 'draft')!
    expect(live).not.toHaveProperty('since')
    expect(live).not.toHaveProperty('own')
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
    expect(snapshot.entries.find((e) => e.id === draft.entry)).toMatchObject({ state: 'draft', publishAt: at, name: 'gesichert', nameFixed: true })
    expect(snapshot.entries.find((e) => e.id === s.entries.weinabend)).not.toHaveProperty('state')

    expect(await s.as.cook.query(api.entries.get, { site: 'restaurant', entry: draft.entry })).toMatchObject({ state: 'draft', publishAt: at })
  })
})

describe('unpublished changes of a live entry (save without publishing)', () => {
  const save = (s: Awaited<ReturnType<typeof draftSetup>>, entry: string, baseRev: number, fields: Record<string, unknown>, as: 'owner' | 'cook' = 'owner', task?: string) =>
    s.as[as].mutation(api.entries.save, { site: 'restaurant', opId: opId(), ...(task ? { task } : {}), entry, baseRev, fields })
  const publish = (s: Awaited<ReturnType<typeof draftSetup>>, entry: string, extra: { lifeRev?: number; rev?: number; at?: number; task?: string } = {}, as: 'owner' | 'cook' = 'owner') =>
    s.as[as].mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry, lifeRev: 1, ...extra })
  const liveTitle = async (s: Awaited<ReturnType<typeof draftSetup>>, entry: string) => (await s.bundle()).bricks.events!.items!.find((i) => i.id === entry)!.data.title
  /** A live event of its own (rev 1, lifeRev 1); the seeded ones point at fixture images that are no uploads. */
  const liveEvent = async (s: Awaited<ReturnType<typeof draftSetup>>) => (await s.createDraft('Weinabend', {})).entry as string
  const pendingRows = (s: Awaited<ReturnType<typeof draftSetup>>) => s.t.run((ctx) => ctx.db.query('pendingChanges').collect())

  // Wrong behaviour caught: Speichern on a live page of a drafts collection changes the website at once (Romi's problem).
  it('a save waits unpublished: the website and contentRev stay, the editor reads the saved version', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    const before = await s.bundle()
    const contentRev = (await s.siteRow())!.contentRev
    const saved = await save(s, entry, 1, { title: { de: 'Weinabend neu' }, description: { de: '**Neu** mit [Link](https://example.com)' } })
    expect(saved).toMatchObject({ rev: 2, contentRev, pending: true })

    expect(await s.bundle()).toEqual(before)
    expect((await s.siteRow())!.contentRev).toBe(contentRev)
    expect((await s.row(entry))!.data.title).toEqual({ de: 'Weinabend' })

    const read = await s.as.owner.query(api.entries.get, { site: 'restaurant', entry })
    expect(read).toMatchObject({ rev: 2, data: { title: { de: 'Weinabend neu' }, description: { de: '**Neu** mit [Link](https://example.com)' } }, pending: { fields: expect.arrayContaining(['title', 'description']), own: true } })
    expect(read.pending!.since).toBeGreaterThanOrEqual(NOW)
    // The list marks it, with the website's title.
    expect((await s.as.owner.query(api.entries.list, { site: 'restaurant', brick: 'events' })).rows.find((r) => r._id === entry)).toMatchObject({ pending: true, title: 'Weinabend' })
    // The preview builds the site from the same read, so it shows the saved version too.
    expect((await s.as.owner.query(api.entries.ofBricks, { site: 'restaurant', bricks: ['events'] })).find((e) => e._id === entry)).toMatchObject({ data: { title: { de: 'Weinabend neu' } } })
  })

  // Wrong behaviour caught: Veröffentlichen leaves the saved changes out, or writes them without a history line that can be undone.
  it('publish puts the saved changes live in one undoable change and clears them', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    const contentRev = (await s.siteRow())!.contentRev
    await save(s, entry, 1, { title: { de: 'Weinabend neu' } })
    await save(s, entry, 2, { description: { de: 'Mehr Text' } })
    const out = await publish(s, entry, { rev: 3 })
    expect(out).toMatchObject({ state: 'live', rev: 4, contentRev: contentRev + 1 })
    expect(await liveTitle(s, entry)).toBe('Weinabend neu')
    expect(await pendingRows(s)).toEqual([])
    expect(await s.as.owner.query(api.entries.get, { site: 'restaurant', entry })).not.toHaveProperty('pending')

    const change = await s.t.run((ctx) => ctx.db.get(out.change as Id<'changes'>))
    expect(change).toMatchObject({ kind: 'save', fields: expect.arrayContaining(['title', 'description']), after: { title: { de: 'Weinabend neu' }, description: { de: 'Mehr Text' } } })
    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: out.change as string })
    expect(await liveTitle(s, entry)).toBe('Weinabend')
  })

  // Wrong behaviour caught: Verwerfen keeps the unpublished values, or touches the live version.
  it('discard returns to the live version; a field saved back to its live value leaves nothing to publish', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    const live = (await s.row(entry))!.data.title
    const before = await s.bundle()
    await save(s, entry, 1, { title: { de: 'Weg damit' } })
    const gone = await s.as.owner.mutation(api.entries.discard, { site: 'restaurant', opId: opId(), entry, rev: 2 })
    expect(gone).toMatchObject({ rev: 3 })
    expect(await s.as.owner.query(api.entries.get, { site: 'restaurant', entry })).toMatchObject({ rev: 3, fieldRevs: { title: 3 }, data: { title: live } })
    expect(await s.bundle()).toEqual(before)
    expect(await errorOf(s.as.owner.mutation(api.entries.discard, { site: 'restaurant', opId: opId(), entry }))).toMatchObject({ code: 'INVALID', key: 'errors.noUnpublishedChanges' })

    await save(s, entry, 3, { title: { de: 'Hin' } })
    expect(await save(s, entry, 4, { title: live })).toMatchObject({ pending: false })
    expect(await pendingRows(s)).toEqual([])
  })

  // Wrong behaviour caught: a publish puts live what the person never saw, or overwrites a live change made after the save.
  it('publish refuses a newer save than the one the person saw, and a live change after the save', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    await save(s, entry, 1, { title: { de: 'Meins' } })
    await save(s, entry, 2, { description: { de: 'Von jemand anderem' } })
    expect(await errorOf(publish(s, entry, { rev: 2 }))).toMatchObject({ code: 'CHANGED_SINCE' })

    // The live title changes after the unpublished one was saved (an older proposal applied, a migration): publish refuses.
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(entry as Id<'entries'>))!
      await ctx.db.patch(row._id, { rev: row.rev + 1, fieldRevs: { ...row.fieldRevs, title: row.rev + 1 }, data: { ...row.data, title: { de: 'Online geändert' } } })
    })
    expect(await errorOf(publish(s, entry))).toMatchObject({ code: 'CHANGED_SINCE', key: 'errors.liveChangedMeanwhile', details: { conflicts: ['title'] } })
    expect(await liveTitle(s, entry)).toBe('Online geändert')
  })

  // Wrong behaviour caught: "publish later" puts the changes live at once, or never; a removal leaves them behind.
  it('a scheduled publish applies them at the time; until then the website keeps the live version', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    const live = await liveTitle(s, entry)
    await save(s, entry, 1, { title: { de: 'Ab morgen' } })
    expect(await publish(s, entry, { at: NOW + 2 * HOUR })).toMatchObject({ state: 'live', publishAt: NOW + 2 * HOUR })
    expect(await s.as.owner.query(api.entries.get, { site: 'restaurant', entry })).toMatchObject({ pending: { publishAt: NOW + 2 * HOUR } })
    await s.advanceTo(NOW + HOUR)
    expect(await liveTitle(s, entry)).toEqual(live)
    await s.advanceTo(NOW + 2 * HOUR + 1)
    expect(await liveTitle(s, entry)).toBe('Ab morgen')
    expect(await pendingRows(s)).toEqual([])

    // Unpublish of a planned publish takes back only the time; the entry stays online with its changes saved.
    await save(s, entry, 3, { title: { de: 'Noch später' } })
    await publish(s, entry, { at: NOW + 4 * HOUR })
    expect(await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })).toMatchObject({ state: 'live' })
    expect((await pendingRows(s))[0]).not.toHaveProperty('publishAt')
    const row = (await s.row(entry))!
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: row.lifeRev })
    expect(await pendingRows(s)).toEqual([])
    await s.advanceTo(NOW + 5 * HOUR)
    expect((await s.row(entry))!.data.title).toEqual({ de: 'Ab morgen' })
  })

  // Wrong behaviour caught: with needsApproval the save goes to review, or the publish skips it; an approval puts live a newer save.
  it('with needsApproval the save needs no yes, the publish does, and a save after sending makes it stale', async () => {
    const s = await draftSetup()
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      for (const task of (site.schema as Schema).bricks.menu!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true
      await ctx.db.patch(s.site, { schema: site.schema })
    })
    const dish = s.entries['menu-saibling']!
    expect(await save(s, dish, 1, { price: { amount: 1500 } }, 'cook', 'menu.price')).toMatchObject({ pending: true })
    const sent = await publish(s, dish, { rev: 2, task: 'menu.price' }, 'cook') as unknown as { proposal: string; status: string }
    expect(sent).toMatchObject({ status: 'open' })
    const detail = await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal: sent.proposal })
    expect(detail.diff).toMatchObject([{ field: 'price' }])
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal: sent.proposal })).toMatchObject({ status: 'applied' })
    expect((await s.row(dish))!.data.price).toEqual({ amount: 1500 })

    await save(s, dish, 3, { price: { amount: 1700 } }, 'cook', 'menu.price')
    const again = await publish(s, dish, { rev: 4, task: 'menu.price' }, 'cook') as unknown as { proposal: string }
    await save(s, dish, 4, { price: { amount: 1800 } }, 'cook', 'menu.price')
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal: again.proposal })).toMatchObject({ status: 'stale' })
    expect((await s.row(dish))!.data.price).toEqual({ amount: 1500 })
  })

  // Wrong behaviour caught: taking a page back to a draft loses the saved changes.
  it('unpublish folds the saved changes into the draft', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    await save(s, entry, 1, { title: { de: 'Behalten' } })
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    expect(await s.row(entry)).toMatchObject({ state: 'draft', data: { title: { de: 'Behalten' } } })
    expect(await pendingRows(s)).toEqual([])
  })

  // Wrong behaviour caught: an image only in unpublished changes had no file reference, so the daily sweep purged it
  // after 7 days and the "unused" view offered it for the trash; publishing then showed a missing picture.
  it('an image only in unpublished changes counts as used until it is published', async () => {
    const s = await draftSetup()
    const image = async (name: string) => {
      const id = await upload(s, { type: 'image/jpeg', content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), name, ready: false })
      await s.t.run(async (ctx) => ctx.db.patch(id, { status: 'ready', processedId: (await ctx.db.get(id))!.storageId }))
      return id
    }
    const refsOf = (file: Id<'uploads'>) => s.t.run(async (ctx) => (await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', file)).collect())
      .filter((r) => r.holder !== 'change').map((r) => [r.holder, r.holderId]))

    // Published: the entry holds the file, the reference of the waiting changes is gone (history keeps its own).
    const published = await liveEvent(s)
    const shown = await image('live.jpg')
    await save(s, published, 1, { image: { file: shown, alt: { de: 'Foto' } } })
    await publish(s, published, { rev: 2 })
    expect(await refsOf(shown)).toEqual([['entry', published]])

    const entry = await liveEvent(s)
    const file = await image('foto.jpg')
    await save(s, entry, 1, { image: { file, alt: { de: 'Foto' } } })
    expect(await refsOf(file)).toEqual([['pending', entry]])
    expect((await s.as.owner.query(api.files.list, { site: 'restaurant', view: 'unused' })).files).toEqual([])
    // The daily sweep 8 days later (no signed-in call after this: the session would not live that long).
    vi.setSystemTime(NOW + 8 * DAY)
    await s.t.mutation(internal.uploads.sweep, { phase: 'ready' })
    expect(await s.t.run((ctx) => ctx.db.get(file))).not.toBeNull()
  })

  // Wrong behaviour caught: staff allowed to change only the price could publish the waiting changes of other fields.
  it('publishing needs the right to change every waiting field', async () => {
    const s = await draftSetup()
    const dishId = (await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: dish('Suppe'), publish: {} })).entry as string
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: dishId, baseRev: 1, fields: { name: { de: 'Suppe neu' } } })
    expect(await errorOf(publish(s, dishId, { task: 'menu.price' }, 'cook'))).toMatchObject({ code: 'FORBIDDEN' })
    expect(await pendingRows(s)).toHaveLength(1)
  })

  // Wrong behaviour caught: after the collection turned drafts off, the editor still showed the waiting values but a
  // save went live and left them waiting, so the form kept snapping back to them with no way to publish or discard.
  // Wrong behaviour caught: a site released with 0.12 (`drafts: false` stored) cannot release again, or its collection
  // still saves live because the old key is read.
  it('a released schema with drafts: false still loads and releases, and its collection now keeps changes', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    const site = (await s.siteRow())!
    const old = structuredClone(site.schema as Schema)
    ;(old.bricks.events as { drafts?: boolean }).drafts = false
    ;(old.bricks.menu as { drafts?: boolean }).drafts = true
    await s.t.run((ctx) => ctx.db.patch(s.site, { schema: old }))
    expect(await save(s, entry, 1, { title: { de: 'Wartet' } })).toMatchObject({ pending: true })

    // The next release leaves the key out, as serializeSchema now does.
    const next = structuredClone(site.schema as Schema)
    next.bricks.events!.label = 'Termine'
    await s.t.mutation(internal.release.release, {
      site: s.site, actor: 'pushkey:test', commit: 'c'.repeat(40), expectedSchemaRev: site.schemaRev, expectedContentRev: site.contentRev, schema: next, writes: [],
    })
    expect((await s.siteRow())!.schema.bricks.events).not.toHaveProperty('drafts')
    expect(await save(s, entry, 2, { description: { de: 'Auch' } })).toMatchObject({ pending: true })
    expect(await liveTitle(s, entry)).toBe('Weinabend')
    await publish(s, entry, { rev: 3 })
    expect(await liveTitle(s, entry)).toBe('Wartet')
  })

  // Wrong behaviour caught: Speichern on a single (Startseite, Preise, Öffnungszeiten) changes the website at once.
  it('a single keeps unpublished changes until publish, and Verwerfen returns to the website\'s version', async () => {
    const s = await draftSetup()
    const legal = s.entries.legal!
    const imprint = async () => ((await s.bundle()).bricks.legal as unknown as { data: { imprint: string } }).data.imprint
    const before = await imprint()
    const contentRev = (await s.siteRow())!.contentRev
    expect(await save(s, legal, 1, { imprint: { de: 'Neues Impressum' } })).toMatchObject({ rev: 2, contentRev, pending: true })
    expect(await imprint()).toEqual(before)
    expect(await s.as.owner.query(api.entries.single, { site: 'restaurant', brick: 'legal' })).toMatchObject({ data: { imprint: { de: 'Neues Impressum' } }, pending: { fields: ['imprint'] } })
    // A single without a task on Heute still says so in Inhalte, so the change is not forgotten.
    expect((await s.as.owner.query(api.sites.areas, { site: 'restaurant' })).find((a) => a.brick === 'legal')).toMatchObject({ changes: 1 })

    await s.as.owner.mutation(api.entries.discard, { site: 'restaurant', opId: opId(), entry: legal, rev: 2 })
    expect(await pendingRows(s)).toEqual([])
    await save(s, legal, 3, { imprint: { de: 'Neues Impressum' } })
    await publish(s, legal, { rev: 4 })
    expect(JSON.stringify(await imprint())).toContain('Neues Impressum')
    expect((await s.siteRow())!.contentRev).toBe(contentRev + 1)
    expect(await pendingRows(s)).toEqual([])
  })

  // Wrong behaviour caught: the conflict panel offers the website's old value as "the new state" while someone's saved
  // change waits, so "Neuen Stand übernehmen" throws that change away, and it names nobody.
  it('a conflict with someone else\'s unpublished change shows their saved value and who saved it', async () => {
    const s = await draftSetup()
    const dish = s.entries['menu-schnitzel']!
    await save(s, dish, 1, { price: { amount: 2500 } })
    const error = await errorOf(save(s, dish, 1, { price: { amount: 2300 } }, 'cook', 'menu.price'))
    expect(error).toMatchObject({ code: 'CHANGED_SINCE', details: { conflicts: ['price'], data: { price: { amount: 2500 } }, by: { price: expect.anything() } } })
  })

  // Wrong behaviour caught: a Today task's Veröffentlichen puts the person's other waiting fields online unseen, or
  // leaves its own field waiting so a later publish overwrites it with the older value.
  it('a save with publish goes online with only its fields; the other unpublished fields keep waiting', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    await save(s, entry, 1, { title: { de: 'Wartet' }, description: { de: 'Wartet auch' } })
    const now = await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, fields: { title: { de: 'Sofort' } }, publish: true })
    expect(now).toMatchObject({ change: expect.any(String) })
    expect(now).not.toHaveProperty('pending')
    expect(await liveTitle(s, entry)).toBe('Sofort')
    const item = (await s.bundle()).bricks.events!.items!.find((i) => i.id === entry)!
    expect(JSON.stringify(item.data.description)).not.toContain('Wartet auch')
    expect(await pendingRows(s)).toMatchObject([{ fields: { description: { de: 'Wartet auch' } } }])
    expect(Object.keys((await pendingRows(s))[0]!.fields)).toEqual(['description'])
  })

  // Wrong behaviour caught: "Diese Version wiederherstellen" compared the old version with the live one, so with a
  // waiting change it said "nothing to change" while the form showed the waiting value, and the revert wrote nothing.
  it('a revert compares with the waiting version the person sees', async () => {
    const s = await draftSetup()
    const entry = await liveEvent(s)
    const first = await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry as Id<'entries'>)).first())
    await save(s, entry, 1, { title: { de: 'Wartet' } })
    const version = await s.as.owner.query(api.entries.versionAt, { site: 'restaurant', entry, change: first!._id })
    expect(version.diff).not.toEqual([])
    await s.as.owner.mutation(api.entries.revert, { site: 'restaurant', opId: opId(), entry, change: first!._id })
    expect(await s.as.owner.query(api.entries.get, { site: 'restaurant', entry })).toMatchObject({ data: { title: { de: 'Weinabend' } } })
    expect(await pendingRows(s)).toEqual([])
  })
})
