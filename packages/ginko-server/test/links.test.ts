// A save or publish that ADDS a broken link is refused (V1: link check blocks on error); old links, warnings and drafts never block.
import type { Schema } from '@lupinum/ginko/internal'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { cookGrants, errorOf, opId, setup } from './setup'

const BROKEN = '[Karte]($page.unknown)'
const OK = '[Karte]($page.menu)'

/** The restaurant; `description` of an event is Markdown. */
async function linkSetup() {
  const s = await setup()
  const create = (description: string, publish?: object) => s.as.owner.mutation(api.entries.create, {
    site: 'restaurant', opId: opId(), brick: 'events', data: { title: { de: 'Fest' }, when: { from: '2026-11-20', to: '2026-11-20' }, description: { de: description } }, ...(publish ? { publish } : {}),
  })
  const save = (entry: string, rev: number, fields: Record<string, unknown>) => s.as.owner.mutation(api.entries.save, {
    site: 'restaurant', opId: opId(), entry: entry as Id<'entries'>, baseRev: rev, fields: fields as never, sentence: 'x',
  })
  return { ...s, create, save }
}

describe('links in saves', () => {
  it('creating a live entry with a broken link is refused and writes nothing', async () => {
    const s = await linkSetup()
    const events = () => s.t.run(async (ctx) => (await ctx.db.query('entries').filter((q) => q.eq(q.field('brick'), 'events')).collect()).length)
    const before = await events()
    expect(await errorOf(s.create(BROKEN, {}))).toMatchObject({ code: 'INVALID', key: 'errors.linkBroken', params: { link: '$page.unknown' } })
    expect(await events()).toBe(before)
  })


  it.each([
    ['a new broken link on a live entry is refused', 'Text', BROKEN, 'refused'],
    ['a new link to an existing page saves', 'Text', OK, 'saved'],
    ['an old broken link stays when another field changes', BROKEN, BROKEN, 'saved-other-field'],
  ])('%s', async (_name, stored, next, outcome) => {
    const s = await linkSetup()
    // An old broken link: stored as a draft, then made live directly (a create would refuse it now).
    const { entry } = (await s.create(stored, stored === BROKEN ? undefined : {})) as { entry: string }
    if (stored === BROKEN) await s.t.run((ctx) => ctx.db.patch(entry as Id<'entries'>, { state: undefined }))
    if (outcome === 'saved-other-field') {
      expect(await s.save(entry, 1, { title: { de: 'Neues Fest' } })).toMatchObject({ rev: 2 })
      return
    }
    const call = s.save(entry, 1, { description: { de: next } })
    if (outcome === 'refused') {
      // Events keep drafts: the save waits unpublished, and publishing it is what refuses the link.
      expect(await call).toMatchObject({ pending: true })
      const error = await errorOf(s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 }))
      expect(error).toMatchObject({ code: 'INVALID', key: 'errors.linkBroken', params: { link: '$page.unknown' } })
      expect(error.message).toContain('$page.unknown')
      const row = await s.t.run((ctx) => ctx.db.get(entry as Id<'entries'>))
      expect(row).toMatchObject({ rev: 2, data: { description: { de: stored } } })
    } else {
      expect(await call).toMatchObject({ rev: 2 })
    }
  })

  it('a draft saves a broken link; publishing it is refused, with and without a time', async () => {
    const s = await linkSetup()
    const { entry } = (await s.create('Text')) as { entry: string }
    expect(await s.save(entry, 1, { description: { de: BROKEN } })).toMatchObject({ rev: 2 })
    expect(await errorOf(s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: entry as Id<'entries'>, lifeRev: 1 })))
      .toMatchObject({ code: 'INVALID', key: 'errors.linkBroken' })
    expect(await s.t.run((ctx) => ctx.db.get(entry as Id<'entries'>))).toMatchObject({ state: 'draft' })
    expect(await save(s, entry, 2, OK)).toMatchObject({ rev: 3 })
    expect(await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: entry as Id<'entries'>, lifeRev: 1 })).toMatchObject({ state: 'live' })
  })
})

const save = (s: Awaited<ReturnType<typeof linkSetup>>, entry: string, rev: number, text: string) => s.save(entry, rev, { description: { de: text } })

describe('links when a write is not live yet', () => {
  it('a scheduled publish whose link broke meanwhile stays a draft and says why', async () => {
    vi.useFakeTimers()
    try {
      const s = await linkSetup()
      const at = Date.now() + 60 * 60 * 1000
      const { entry } = (await s.create('Text')) as { entry: string }
      // The link target must be live when scheduling.
      const target = (await s.create('Ziel', {})) as { entry: string }
      const slug = (await s.t.run((ctx) => ctx.db.get(target.entry as Id<'entries'>)))!.data.slug as Record<string, string>
      await s.save(entry, 1, { description: { de: `[Karte]($events.${slug.de})` } })
      await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: entry as Id<'entries'>, lifeRev: 1, at })
      // The target goes away (hard delete of the row and its slugs), then the job runs.
      await s.t.run(async (ctx) => {
        await ctx.db.delete(target.entry as Id<'entries'>)
        for (const row of await ctx.db.query('slugs').collect()) if (row.entry === target.entry) await ctx.db.delete(row._id)
      })
      vi.setSystemTime(at + 1000)
      await s.t.mutation(internal.entries.publishDue, { entry: entry as Id<'entries'>, at })
      const row = (await s.t.run((ctx) => ctx.db.get(entry as Id<'entries'>)))!
      expect(row.state).toBe('draft')
      expect(row.publishAt).toBeUndefined()
      expect(row.publishJob).toBeUndefined()
      expect(row.stopped).toEqual({ at, by: 'u-wirtin', reason: { code: 'link', href: `$events.${slug.de}` } })
      const lines = await s.t.run((ctx) => ctx.db.query('changes').collect())
      expect(lines.find((c) => c.entry === entry && c.kind === 'publishStopped')?.msg).toMatchObject({ key: 'history.publishStoppedBrokenLink', params: { link: expect.stringContaining('$events.') } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a create that needs approval with a broken link is refused when proposed', async () => {
    const s = await linkSetup()
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const schema = site.schema as Schema
      for (const task of schema.bricks.events!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true
      await ctx.db.patch(s.site, { schema })
      const cook = (await ctx.db.query('memberships').collect()).find((m) => m.role === 'staff')!
      await ctx.db.patch(cook._id, { grants: [...cookGrants, 'events.add'] })
    })
    const propose = (description: string) => s.as.cook.mutation(api.entries.create, {
      site: 'restaurant', opId: opId(), task: 'events.add', brick: 'events', publish: {},
      data: { title: { de: 'Fest' }, when: { from: '2026-11-20', to: '2026-11-20' }, description: { de: description } },
    })
    const proposals = () => s.t.run(async (ctx) => (await ctx.db.query('proposals').collect()).length)
    expect(await errorOf(propose(BROKEN))).toMatchObject({ code: 'INVALID', key: 'errors.linkBroken', params: { link: '$page.unknown' } })
    expect(await proposals()).toBe(0)
    expect(await propose(OK)).toMatchObject({ status: 'open' })
    expect(await proposals()).toBe(1)
  })
})

describe('links of a plan (D106)', () => {
  const HOUR = 60 * 60 * 1000
  /** Draft A links to draft B; B gets `bAt` (or no time), then A is planned for `at`. */
  async function plannedPair(bAt: number | undefined) {
    const s = await linkSetup()
    const at = Date.now() + 2 * HOUR
    const b = (await s.create('Ziel')) as { entry: Id<'entries'> }
    if (bAt !== undefined) await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: b.entry, lifeRev: 1, at: bAt })
    const slug = (await s.t.run((ctx) => ctx.db.get(b.entry)))!.data.slug as Record<string, string>
    const a = (await s.create(`[Ziel]($events.${slug.de})`)) as { entry: Id<'entries'> }
    const planA = () => s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: a.entry, lifeRev: 1, at })
    return { ...s, a, b, at, planA }
  }

  // Wrong behaviour caught: a plan cannot link to an entry that goes online with it or before it, or it can link to
  // one that comes later or never.
  it.each([
    { name: 'planned for the same time', offset: 0, ok: true },
    { name: 'planned earlier', offset: -HOUR, ok: true },
    { name: 'planned later', offset: HOUR, ok: false },
    { name: 'a draft without a time', offset: undefined, ok: false },
  ])('a plan may link to a draft $name: $ok', async ({ offset, ok }) => {
    const base = Date.now() + 2 * HOUR
    const s = await plannedPair(offset === undefined ? undefined : base + offset)
    if (ok) expect(await s.planA()).toMatchObject({ state: 'draft', publishAt: s.at })
    else expect(await errorOf(s.planA())).toMatchObject({ code: 'INVALID', key: 'errors.linkBroken' })
  })

  // The known edge, kept on purpose: A and B are due together, A's job runs first and counts B as online, then B
  // stops. A is online with a link to a page that does not exist; the cancel and remove screen will name such links.
  it('A and B due together, B stops: A is online with a link to B', async () => {
    const s = await plannedPair(Date.now() + 2 * HOUR)
    await s.planA()
    await s.t.run(async (ctx) => {
      const { description: _, ...data } = (await ctx.db.get(s.b.entry))!.data as Record<string, unknown>
      await ctx.db.patch(s.b.entry, { data })
    })
    vi.setSystemTime(s.at + 1000)
    await s.t.mutation(internal.entries.publishDue, { entry: s.a.entry, at: s.at })
    await s.t.mutation(internal.entries.publishDue, { entry: s.b.entry, at: s.at })
    const [a, b] = await s.t.run(async (ctx) => [await ctx.db.get(s.a.entry), await ctx.db.get(s.b.entry)])
    expect(a!.state ?? 'live').toBe('live')
    expect(b).toMatchObject({ state: 'draft', stopped: { reason: { code: 'invalid' } } })
  })
})

describe('restore from the trash (D109)', () => {
  // Wrong behaviour caught: an entry that was online came back online from the trash with a link to an entry removed
  // meanwhile, or without a field that became required, unchecked; or a draft came back online.
  it.each([
    { name: 'passes both checks', breakIt: 'nothing', state: undefined, history: 'history.restored', params: {} },
    { name: 'links to an entry removed meanwhile', breakIt: 'target', state: 'draft', history: 'history.restoredAsDraftBrokenLink', params: { link: expect.stringMatching(/^\$events\./) } },
    { name: 'misses a required field', breakIt: 'field', state: 'draft', history: 'history.restoredAsDraftInvalid', params: { count: 1 } },
    // Restore fills no `publishedOn`, so an empty required date fails the check instead of counting as filled.
    { name: 'has an empty required publishedOn date', breakIt: 'publishedOn', state: 'draft', history: 'history.restoredAsDraftInvalid', params: { count: 1, fields: expect.objectContaining({ de: 'Veröffentlicht am' }) } },
  ] as const)('an entry that was online and $name', async ({ breakIt, state, history, params }) => {
    const s = await linkSetup()
    const b = (await s.create(OK, {})) as { entry: Id<'entries'> }
    const slug = (await s.t.run((ctx) => ctx.db.get(b.entry)))!.data.slug as Record<string, string>
    const a = (await s.create(`[Ziel]($events.${slug.de})`, {})) as { entry: Id<'entries'> }
    const remove = (entry: Id<'entries'>) => s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry, lifeRev: 1 })
    await remove(a.entry)
    if (breakIt === 'target') await remove(b.entry)
    if (breakIt === 'publishedOn') {
      await s.t.run(async (ctx) => {
        const schema = (await ctx.db.get(s.site))!.schema as { bricks: Record<string, { fields: object }> }
        const events = schema.bricks.events!
        await ctx.db.patch(s.site, { schema: { ...schema, bricks: { ...schema.bricks, events: { ...events, publishedOn: 'postedOn', fields: { ...events.fields, postedOn: { type: 'date', label: { de: 'Veröffentlicht am' } } } } } } as never })
      })
    }
    if (breakIt === 'field') {
      await s.t.run(async (ctx) => {
        const { description: _, ...data } = (await ctx.db.get(a.entry))!.data as Record<string, unknown>
        await ctx.db.patch(a.entry, { data })
      })
    }
    const before = (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
    await s.as.owner.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: a.entry, lifeRev: 2 })
    const row = (await s.t.run((ctx) => ctx.db.get(a.entry)))!
    const changes = await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', a.entry)).collect())
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    expect({ deleted: row.deletedAt !== undefined, state: row.state, contentRev: site.contentRev - before, change: changes.at(-1)!.msg })
      .toEqual({ deleted: false, state, contentRev: state ? 0 : 1, change: { key: history, params: expect.objectContaining(params) } })
  })
})
