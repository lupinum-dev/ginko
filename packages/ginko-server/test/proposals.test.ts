// Approvals and releases against SPEC 17: when a write becomes a proposal, how it is decided and
// applied through the normal path, and the digest mail. The menu tasks of the restaurant are
// switched to `needsApproval` for the cook; the owner and admin stay direct.
import type { Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, firstPage, opId, people, setup } from './setup'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const YEAR = 365 * 24 * HOUR

type Setup = Awaited<ReturnType<typeof setup>>
type Proposed = { proposal: Id<'proposals'>; status: 'open' }

/** The restaurant with `needsApproval` on every menu task. Fake timers run first: the scheduler of convex-test uses setTimeout. */
async function approvalSetup(opts: { needsApproval?: boolean } = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
  const s = await setup()
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    for (const task of schema.bricks.menu!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = opts.needsApproval ?? true
    await ctx.db.patch(s.site, { schema })
  })
  const saibling = s.entries['menu-saibling']!
  const frittaten = s.entries['menu-frittaten']!
  /** The cook changes a price: a proposal when the task needs approval. */
  const cookPrice = (entry: Id<'entries'>, amount: number) =>
    s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry, baseRev: 1, fields: { price: { amount } } })
  const ownerPrice = (entry: Id<'entries'>, amount: number, baseRev = 1) =>
    s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev, fields: { price: { amount } } })
  const row = (id: Id<'entries'>) => s.t.run((ctx) => ctx.db.get(id))
  const proposalRow = (id: Id<'proposals'>) => s.t.run((ctx) => ctx.db.get(id))
  const rows = (table: 'proposals' | 'changes' | 'outbox' | 'releases') => s.t.run((ctx) => ctx.db.query(table).collect())
  const advanceTo = async (time: number) => {
    vi.advanceTimersByTime(time - Date.now())
    await s.t.finishInProgressScheduledFunctions()
  }
  const bundlePrice = async (entry: Id<'entries'>) => {
    const bundle = await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json() as { bricks: { menu: { items: { id: string; data: { price: { amount: number } } }[] } } }
    return bundle.bricks.menu.items.find((i) => i.id === entry)?.data.price.amount
  }
  return { ...s, saibling, frittaten, cookPrice, ownerPrice, row, proposalRow, rows, advanceTo, bundlePrice }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('when a write needs a yes', () => {
  it('without the flag a staff save writes directly and no proposal exists', async () => {
    const s = await approvalSetup({ needsApproval: false })
    expect(await s.cookPrice(s.saibling, 1450)).toMatchObject({ rev: 2, contentRev: 2 })
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1450 })
    expect(await s.rows('proposals')).toHaveLength(0)
  })

  it('with needsApproval a staff save returns the proposal and writes nothing', async () => {
    const s = await approvalSetup()
    const result = await s.cookPrice(s.saibling, 1450)
    expect(result).toEqual({ proposal: expect.any(String), status: 'open' })
    expect(await s.row(s.saibling)).toMatchObject({ rev: 1, data: { price: { amount: 1350 } } })
    expect(await s.bundlePrice(s.saibling)).toBe(1350)
    expect(await s.rows('changes')).toHaveLength(0)
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev).toBe(1)
    expect(await s.proposalRow((result as Proposed).proposal)).toMatchObject({
      op: 'save', status: 'open', author: 'u-koch', via: 'ui', sentence: 'Preis von „Gebeizter Saibling“ geändert', msg: { key: 'history.changedEntry', params: { title: 'Gebeizter Saibling' } }, before: { price: { amount: 1350 } }, after: { price: { amount: 1450 } },
    })
  })

  it('an owner in the platform is always direct, even on a task that needs approval', async () => {
    const s = await approvalSetup()
    expect(await s.ownerPrice(s.saibling, 1500)).toMatchObject({ rev: 2 })
    expect(await s.rows('proposals')).toHaveLength(0)
  })

  it('editing a draft by such staff is direct: a draft is not live', async () => {
    const s = await approvalSetup()
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const schema = site.schema as Schema
      ;(schema.bricks.menu as { drafts?: boolean }).drafts = true
      await ctx.db.patch(s.site, { schema })
    })
    const draft = await s.as.owner.mutation(api.entries.create, {
      site: 'restaurant', opId: opId(), brick: 'menu', data: { category: 'starters', name: { de: 'Neu' }, price: { amount: 900 }, allergens: ['A'], veg: 'none' },
    })
    expect(draft).toMatchObject({ state: 'draft' })
    const saved = await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: draft.entry as Id<'entries'>, baseRev: 1, fields: { price: { amount: 950 } }, sentence: 'x' })
    expect(saved).toMatchObject({ rev: 2 })
    expect(await s.rows('proposals')).toHaveLength(0)

    // Publishing it is live content: that one waits for a yes.
    const publish = await s.as.cook.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: draft.entry as Id<'entries'>, lifeRev: 1 })
    expect(publish).toMatchObject({ status: 'open' })
    expect((await s.row(draft.entry as Id<'entries'>))!.state).toBe('draft')
    // The approver reads the state change in their own language.
    await s.t.run((ctx) => ctx.db.insert('userSettings', { user: people.owner, remindByMail: false, locale: 'en' }))
    const detail = await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal: (publish as Proposed).proposal })
    expect(detail.diff).toEqual([{ field: 'state', label: 'Status', kind: 'state', before: 'Draft', after: 'Online' }])
    await s.as.owner.mutation(api.proposals.approve, { proposal: (publish as Proposed).proposal })
    expect((await s.row(draft.entry as Id<'entries'>))!.state).toBe('live')
  })

  it('an invalid change is refused when it is proposed, not at approval', async () => {
    const s = await approvalSetup()
    const error = await errorOf(s.cookPrice(s.saibling, -5))
    expect(error.code).toBe('INVALID')
    expect(await s.rows('proposals')).toHaveLength(0)
  })

  it('a retry with the same opId returns the same proposal', async () => {
    const s = await approvalSetup()
    const args = { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1450 } }, sentence: 'x' }
    const first = await s.as.cook.mutation(api.entries.save, args)
    expect(await s.as.cook.mutation(api.entries.save, args)).toEqual(first)
    expect(await s.rows('proposals')).toHaveLength(1)
  })
})

describe('approving', () => {
  it('applies through the normal path: the change names the author and the approver, and it can be undone', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const done = await s.as.owner.mutation(api.proposals.approve, { proposal })
    expect(done).toMatchObject({ proposal, status: 'applied', change: expect.any(String) })
    expect(await s.row(s.saibling)).toMatchObject({ rev: 2, data: { price: { amount: 1450 } } })
    expect(await s.bundlePrice(s.saibling)).toBe(1450)
    const [change] = await s.rows('changes')
    expect(change).toMatchObject({ kind: 'save', actor: 'u-koch', approvedBy: 'u-wirtin', fields: ['price'], entryRev: 2 })
    expect(await s.proposalRow(proposal)).toMatchObject({ status: 'applied', decidedBy: 'u-wirtin', change: change!._id })
    // Verlauf names both: who made it, who approved it.
    expect((await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage })).page[0]).toMatchObject({ who: { email: 'koch@example.com' }, approver: { email: 'wirtin@example.com' } })

    await s.as.owner.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), change: change!._id })
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1350 })
  })

  it('staff cannot approve', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    expect((await errorOf(s.as.cook.mutation(api.proposals.approve, { proposal }))).code).toBe('FORBIDDEN')
  })

  it('nobody approves their own proposal: a cook promoted to owner still cannot', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    await s.t.run(async (ctx) => {
      const member = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', 'u-koch').eq('site', s.site)).unique()
      await ctx.db.patch(member!._id, { role: 'owner' })
    })
    expect((await errorOf(s.as.cook.mutation(api.proposals.approve, { proposal }))).code).toBe('FORBIDDEN')
    expect(await s.row(s.saibling)).toMatchObject({ rev: 1 })
  })

  it('becomes stale when the field changed meanwhile, and writes nothing', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    await s.ownerPrice(s.saibling, 1500)
    const done = await s.as.owner.mutation(api.proposals.approve, { proposal })
    expect(done).toMatchObject({ status: 'stale', reason: expect.stringContaining('Inzwischen hat jemand das geändert') })
    expect(await s.proposalRow(proposal)).toMatchObject({ status: 'stale' })
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1500 })
    expect(await s.rows('changes')).toHaveLength(1)
  })

  it('a stale proposal keeps the catalog message of its reason beside the German text', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    await s.ownerPrice(s.saibling, 1500)
    await s.as.owner.mutation(api.proposals.approve, { proposal })
    expect(await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal })).toMatchObject({
      status: 'stale', reason: 'Inzwischen hat jemand das geändert. Bitte schlage die Änderung neu vor.', reasonMsg: { key: 'history.staleChanged' },
    })
  })

  it('a scheduled approval applies at the time', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const at = NOW + HOUR
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal, at })).toMatchObject({ status: 'scheduled', at })
    expect(await s.row(s.saibling)).toMatchObject({ rev: 1 })
    await s.advanceTo(at - MINUTE)
    expect(await s.row(s.saibling)).toMatchObject({ rev: 1 })
    await s.advanceTo(at + MINUTE)
    expect(await s.proposalRow(proposal)).toMatchObject({ status: 'applied', decidedBy: 'u-wirtin' })
    expect(await s.row(s.saibling)).toMatchObject({ rev: 2, data: { price: { amount: 1450 } } })
  })

  it('a scheduled approval is stale at the time when the field changed before', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const at = NOW + HOUR
    await s.as.owner.mutation(api.proposals.approve, { proposal, at })
    await s.ownerPrice(s.saibling, 1500)
    await s.advanceTo(at + MINUTE)
    expect(await s.proposalRow(proposal)).toMatchObject({ status: 'stale', reason: expect.stringContaining('Inzwischen hat jemand das geändert') })
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1500 })
  })

  it.each([
    ['too far ahead', NOW + YEAR + HOUR],
    ['in the past', NOW - MINUTE],
  ])('a scheduled approval %s is refused', async (_why, at) => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    expect((await errorOf(s.as.owner.mutation(api.proposals.approve, { proposal, at }))).code).toBe('INVALID')
  })

  it('create and remove proposals apply through their own operations', async () => {
    const s = await approvalSetup()
    const created = await s.as.cook.mutation(api.entries.create, {
      site: 'restaurant', opId: opId(), task: 'menu.add', brick: 'menu', data: { category: 'starters', name: { de: 'Neu' }, price: { amount: 900 }, allergens: ['A'], veg: 'none' },
    }) as Proposed
    const removed = await s.as.cook.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), task: 'menu.remove', entry: s.frittaten, lifeRev: 1 }) as Proposed
    expect(created.status).toBe('open')
    expect(removed.status).toBe('open')
    const count = (await s.t.run((ctx) => ctx.db.get(s.site)))!.entryCount

    await s.as.owner.mutation(api.proposals.approve, { proposal: created.proposal })
    await s.as.owner.mutation(api.proposals.approve, { proposal: removed.proposal })
    // One entry added, one removed.
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.entryCount).toBe(count)
    expect((await s.row(s.frittaten))!.deletedAt).toBeDefined()
    const changes = await s.rows('changes')
    expect(changes.map((c) => [c.kind, c.actor, c.approvedBy])).toEqual([['create', 'u-koch', 'u-wirtin'], ['remove', 'u-koch', 'u-wirtin']])
  })

  it('staff cannot undo a change on a task that needs approval to get around the proposal', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    await s.as.owner.mutation(api.proposals.approve, { proposal })
    const [change] = await s.rows('changes')
    expect((await errorOf(s.as.cook.mutation(api.entries.undo, { site: 'restaurant', opId: opId(), task: 'menu.price', change: change!._id }))).code).toBe('FORBIDDEN')
  })
})

describe('rejecting and withdrawing', () => {
  it('a rejection needs a reason of one to 300 characters; staff cannot reject', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    expect((await errorOf(s.as.owner.mutation(api.proposals.reject, { proposal, reason: '   ' }))).code).toBe('INVALID')
    expect((await errorOf(s.as.owner.mutation(api.proposals.reject, { proposal, reason: 'x'.repeat(301) }))).code).toBe('INVALID')
    expect((await errorOf(s.as.cook.mutation(api.proposals.reject, { proposal, reason: 'Nein.' }))).code).toBe('FORBIDDEN')
    expect(await s.as.owner.mutation(api.proposals.reject, { proposal, reason: 'Der Preis stimmt nicht.' })).toMatchObject({ status: 'rejected' })
    expect(await s.proposalRow(proposal)).toMatchObject({ status: 'rejected', reason: 'Der Preis stimmt nicht.', decidedBy: 'u-wirtin' })
    expect(await s.row(s.saibling)).toMatchObject({ rev: 1 })
  })

  it('only the author withdraws, and only while open', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    expect((await errorOf(s.as.owner.mutation(api.proposals.withdraw, { proposal }))).code).toBe('FORBIDDEN')
    expect(await s.as.cook.mutation(api.proposals.withdraw, { proposal })).toMatchObject({ status: 'withdrawn' })
    expect((await errorOf(s.as.owner.mutation(api.proposals.approve, { proposal }))).code).toBe('CHANGED_SINCE')
    expect((await errorOf(s.as.cook.mutation(api.proposals.withdraw, { proposal }))).code).toBe('CHANGED_SINCE')
  })
})

describe('the author follows up on their own proposal', () => {
  /** The cook's note on this week's lunch, through the weekly task (it needs approval in the restaurant). */
  const cookNote = (s: Setup, de: string) =>
    s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'lunch.lunchWeek', entry: s.entries.lunch!, baseRev: 1, fields: { note: { de } } }) as Promise<Proposed>

  // Wrong behaviour caught: sending the week again left two open proposals of the cook for the same week, and approving
  // one made the other stale.
  it('a second save through the same task replaces the author\'s open proposal on that entry, and only that one', async () => {
    const s = await approvalSetup()
    const first = await cookNote(s, 'Suppe inklusive')
    const other = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const second = await cookNote(s, 'Suppe und Salat inklusive')
    expect(await s.proposalRow(first.proposal)).toMatchObject({ status: 'withdrawn', decidedBy: people.cook })
    expect([(await s.proposalRow(second.proposal))!.status, (await s.proposalRow(other.proposal))!.status]).toEqual(['open', 'open'])
  })

  // Wrong behaviour caught: after sending, the cook's sheet showed the old week, so he thought nothing was saved; a
  // rejection was a dead end; an old rejection stayed on top of Verlauf after he sent the fix or the owner changed it.
  it('ownFor gives the open proposal, then the rejection with its reason, until a newer proposal or a change of those fields', async () => {
    const s = await approvalSetup()
    const own = () => s.as.cook.query(api.proposals.ownFor, { site: 'restaurant', entry: s.entries.lunch! })
    const rejected = async () => (await s.as.cook.query(api.proposals.mine, { site: 'restaurant' })).rejected.map((p) => p.proposal)
    const first = await cookNote(s, 'Suppe inklusive')
    expect(await own()).toMatchObject({ proposal: first.proposal, status: 'open', task: 'lunch.lunchWeek', fields: { note: { de: 'Suppe inklusive' } } })
    await s.as.owner.mutation(api.proposals.reject, { proposal: first.proposal, reason: 'Bitte mit Preis.' })
    expect(await own()).toMatchObject({ proposal: first.proposal, status: 'rejected', reason: 'Bitte mit Preis.', decidedBy: { kind: 'member' } })
    expect(await rejected()).toEqual([first.proposal])

    const second = await cookNote(s, 'Suppe inklusive, 12 Euro')
    expect(await own()).toMatchObject({ proposal: second.proposal, status: 'open' })
    expect(await rejected()).toEqual([])

    await s.as.owner.mutation(api.proposals.reject, { proposal: second.proposal, reason: 'Zu teuer.' })
    expect(await rejected()).toEqual([second.proposal])
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.entries.lunch!, baseRev: 1, fields: { note: { de: 'Suppe inklusive, 11 Euro' } } })
    expect(await own()).toBeNull()
    expect(await rejected()).toEqual([])
  })

  // Wrong behaviour caught: the cook was never told that his week was not approved, and found out from the website.
  it('a rejection mails the author at once with the reason and a link that reopens the proposal', async () => {
    const s = await approvalSetup()
    const { proposal } = await cookNote(s, 'Suppe inklusive')
    await s.as.owner.mutation(api.proposals.reject, { proposal, reason: 'Bitte mit Preis.' })
    const mails = (await s.rows('outbox')).filter((m) => m.to === 'koch@example.com')
    expect(mails).toHaveLength(1)
    expect(mails[0]!.subject).toContain('Nicht freigegeben')
    expect(mails[0]!.text).toContain('„Bitte mit Preis.“')
    expect(mails[0]!.text).toContain(`https://ginko.test/s/restaurant?task=lunch.lunchWeek&reopen=${proposal}`)
  })

  // Wrong behaviour caught: the mail about an assistant's rejected proposal linked to a sheet that cannot reopen it
  // (the Studio follows up only on its own proposals), so "Korrigieren" opened the stored values.
  it('the mail about an assistant\'s rejected proposal links to Verlauf', async () => {
    const s = await approvalSetup()
    const { proposal } = await cookNote(s, 'Suppe inklusive')
    await s.t.run((ctx) => ctx.db.patch(proposal, { via: 'agent' }))
    await s.as.owner.mutation(api.proposals.reject, { proposal, reason: 'Bitte mit Preis.' })
    const [mail] = (await s.rows('outbox')).filter((m) => m.to === 'koch@example.com')
    expect(mail!.text).toContain('Korrigieren: https://ginko.test/s/restaurant/history\n')
  })
})

describe('reading', () => {
  it('approvers see every proposal, authors only their own; get returns before and after per field; count is "Zu prüfen"', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    await s.t.run((ctx) => ctx.db.insert('proposals', {
      site: s.site, op: 'save', brick: 'menu', args: {}, base: {}, sentence: 'Fremd', author: 'u-anderer', via: 'ui', status: 'open', createdAt: NOW,
    }))
    const all = await s.as.owner.query(api.proposals.list, { site: 'restaurant', paginationOpts: firstPage })
    expect(all.page.map((p) => p.sentence).sort()).toEqual(['Fremd', 'Preis von „Gebeizter Saibling“ geändert'])
    expect((await s.as.cook.query(api.proposals.list, { site: 'restaurant', paginationOpts: firstPage })).page.map((p) => p.sentence)).toEqual(['Preis von „Gebeizter Saibling“ geändert'])
    expect((await s.as.owner.query(api.proposals.list, { site: 'restaurant', status: 'applied', paginationOpts: firstPage })).page).toEqual([])
    expect(await s.as.owner.query(api.proposals.count, { site: 'restaurant' })).toBe(2)
    expect(await s.as.cook.query(api.proposals.count, { site: 'restaurant' })).toBe(1)

    const detail = await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal })
    expect(detail).toMatchObject({ diff: [{ field: 'price', before: { amount: 1350 }, after: { amount: 1450 } }], conflict: null, canDecide: true })
    await s.ownerPrice(s.saibling, 1500)
    expect((await s.as.owner.query(api.proposals.get, { site: 'restaurant', proposal })).conflict).toEqual(expect.stringContaining('Inzwischen'))
    expect((await errorOf(s.as.stranger.query(api.proposals.list, { site: 'restaurant', paginationOpts: firstPage }))).code).toBe('FORBIDDEN')
  })

  it('a row whose entry changed after the proposal conflicts; newest first, order oldest reverses', async () => {
    const s = await approvalSetup()
    const first = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const second = (await s.cookPrice(s.frittaten, 950)) as Proposed
    await s.ownerPrice(s.saibling, 1500)
    const newest = await s.as.owner.query(api.proposals.list, { site: 'restaurant', paginationOpts: firstPage })
    expect(newest.page.map((p) => [p.proposal, p.conflict, p.conflictMsg?.key ?? null])).toEqual([
      [second.proposal, null, null],
      [first.proposal, 'Inzwischen hat jemand das geändert. Bitte schlage die Änderung neu vor.', 'history.staleChanged'],
    ])
    expect((await s.as.owner.query(api.proposals.list, { site: 'restaurant', order: 'oldest', paginationOpts: firstPage })).page.map((p) => p.proposal)).toEqual([first.proposal, second.proposal])
  })

  // Wrong behaviour caught: History hides the approver's own waiting proposal once 50 newer ones of others exist.
  it('mine shows an approver their own older open proposal behind more than 50 newer ones', async () => {
    const s = await approvalSetup()
    const base = { site: s.site, op: 'save' as const, brick: 'menu', args: {}, base: {}, via: 'agent' as const, status: 'open' as const, createdAt: NOW }
    await s.t.run(async (ctx) => {
      // The owner's own agent proposed first ("show me first"); then the cook sent 51 more.
      await ctx.db.insert('proposals', { ...base, sentence: 'Meins', author: people.owner })
      for (let i = 0; i < 51; i++) await ctx.db.insert('proposals', { ...base, sentence: `P${i}`, author: people.cook })
    })
    const mine = await s.as.owner.query(api.proposals.mine, { site: 'restaurant' })
    expect(mine.open.map((p) => p.sentence)).toEqual(['Meins'])
  })

  // Wrong behaviour caught: a plan made weeks ago that failed today, or an old proposal rejected today, is hidden behind 50 newer-created ones decided long ago.
  it('mine finds what was decided in the last two weeks, however long ago it was created', async () => {
    const s = await approvalSetup()
    const base = { site: s.site, op: 'save' as const, brick: 'menu', args: {}, base: {}, via: 'ui' as const, author: people.owner, createdAt: NOW }
    const longAgo = NOW - 20 * 24 * HOUR
    await s.t.run(async (ctx) => {
      await ctx.db.insert('proposals', { ...base, sentence: 'Geplant', status: 'stale', at: NOW - HOUR, decidedAt: NOW - HOUR })
      await ctx.db.insert('proposals', { ...base, sentence: 'Abgelehnt', status: 'rejected', decidedAt: NOW - HOUR })
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert('proposals', { ...base, sentence: `S${i}`, status: 'stale', at: longAgo, decidedAt: longAgo })
        await ctx.db.insert('proposals', { ...base, sentence: `R${i}`, status: 'rejected', decidedAt: longAgo })
      }
    })
    const mine = await s.as.owner.query(api.proposals.mine, { site: 'restaurant' })
    expect([mine.notLive.map((p) => p.sentence), mine.rejected.map((p) => p.sentence)]).toEqual([['Geplant'], ['Abgelehnt']])
  })
})

describe('releases', () => {
  it('apply all proposals in one go', async () => {
    const s = await approvalSetup()
    const a = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const b = (await s.cookPrice(s.frittaten, 1100)) as Proposed
    const { release } = await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'Herbstkarte' }) as { release: Id<'releases'> }
    await s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: a.proposal })
    await s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: b.proposal })
    // A member is decided with its release, not alone.
    expect((await errorOf(s.as.owner.mutation(api.proposals.approve, { proposal: a.proposal }))).code).toBe('INVALID')
    expect((await s.as.owner.query(api.proposals.releases, { site: 'restaurant' })).map((r) => r.proposals.length)).toEqual([2])

    expect(await s.as.owner.mutation(api.proposals.approveRelease, { release })).toMatchObject({ status: 'applied', applied: 2 })
    // The inbox lists only releases still to decide.
    expect(await s.as.owner.query(api.proposals.releases, { site: 'restaurant' })).toEqual([])
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1450 })
    expect((await s.row(s.frittaten))!.data.price).toEqual({ amount: 1100 })
    expect((await s.rows('changes')).map((c) => c.approvedBy)).toEqual(['u-wirtin', 'u-wirtin'])
  })

  it('all or nothing: a stale member blocks the release and is named; without it the rest goes', async () => {
    const s = await approvalSetup()
    const a = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const b = (await s.cookPrice(s.frittaten, 1100)) as Proposed
    const { release } = await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'Herbstkarte' }) as { release: Id<'releases'> }
    for (const p of [a, b]) await s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: p.proposal })
    await s.ownerPrice(s.saibling, 1500)
    const frittatenPrice = (await s.row(s.frittaten))!.data.price

    const blocked = await s.as.owner.mutation(api.proposals.approveRelease, { release })
    expect(blocked).toMatchObject({ status: 'stale', stale: [{ proposal: a.proposal, sentence: 'Preis von „Gebeizter Saibling“ geändert', reason: expect.stringContaining('Inzwischen') }] })
    // Nothing of the release was written, not even the member that still fits.
    expect((await s.row(s.frittaten))!.data.price).toEqual(frittatenPrice)
    expect((await s.proposalRow(b.proposal))!.status).toBe('open')
    // Asking again does not skip the stale member behind the owner's back.
    expect(await s.as.owner.mutation(api.proposals.approveRelease, { release })).toMatchObject({ status: 'stale' })

    await s.as.owner.mutation(api.proposals.removeFromRelease, { release, proposal: a.proposal })
    expect(await s.as.owner.mutation(api.proposals.approveRelease, { release })).toMatchObject({ status: 'applied', applied: 1 })
    expect((await s.row(s.frittaten))!.data.price).toEqual({ amount: 1100 })
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1500 })
  })

  it('two proposals for the same field in one release block it: the second would not fit after the first', async () => {
    const s = await approvalSetup()
    const a = (await s.cookPrice(s.saibling, 1450)) as Proposed
    // Through another task: a second save through the same task would replace the first proposal.
    const b = (await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.edit', entry: s.saibling, baseRev: 1, fields: { price: { amount: 1600 } } })) as Proposed
    const { release } = await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'Doppelt' }) as { release: Id<'releases'> }
    for (const p of [a, b]) await s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: p.proposal })
    expect(await s.as.owner.mutation(api.proposals.approveRelease, { release })).toMatchObject({ status: 'stale', stale: [{ proposal: b.proposal }] })
    expect(await s.row(s.saibling)).toMatchObject({ rev: 1 })
  })

  it('a release holds at most 50 proposals', async () => {
    const s = await approvalSetup()
    const { release } = await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'Voll' }) as { release: Id<'releases'> }
    const ids = await s.t.run(async (ctx) => {
      const out: Id<'proposals'>[] = []
      for (let i = 0; i < 51; i++) {
        out.push(await ctx.db.insert('proposals', { site: s.site, op: 'save', brick: 'menu', args: {}, base: {}, sentence: `P${i}`, author: 'u-koch', via: 'ui', status: 'open', createdAt: NOW, ...(i < 50 ? { release } : {}) }))
      }
      return out
    })
    expect((await errorOf(s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: ids[50]! }))).code).toBe('INVALID')
  })

  it('a scheduled release applies at the time, all together', async () => {
    const s = await approvalSetup()
    const a = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const b = (await s.cookPrice(s.frittaten, 1100)) as Proposed
    const { release } = await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'Nachts' }) as { release: Id<'releases'> }
    for (const p of [a, b]) await s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: p.proposal })
    const at = NOW + 2 * HOUR
    expect(await s.as.owner.mutation(api.proposals.approveRelease, { release, at })).toMatchObject({ status: 'scheduled', at })
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1350 })
    await s.advanceTo(at + MINUTE)
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1450 })
    expect((await s.row(s.frittaten))!.data.price).toEqual({ amount: 1100 })
    expect(await s.t.run((ctx) => ctx.db.get(release))).toMatchObject({ status: 'applied' })
  })

  it('a scheduled release that fails while applying is recorded as stale, nothing is written, the approver is told', async () => {
    const s = await approvalSetup()
    const a = (await s.cookPrice(s.saibling, 1450)) as Proposed
    const b = (await s.cookPrice(s.frittaten, 1100)) as Proposed
    const { release } = await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'Nachts' }) as { release: Id<'releases'> }
    for (const p of [a, b]) await s.as.owner.mutation(api.proposals.addToRelease, { release, proposal: p.proposal })
    const at = NOW + 2 * HOUR
    await s.as.owner.mutation(api.proposals.approveRelease, { release, at })
    // The cook loses the task in between: the pre-check passes, the save itself refuses.
    await s.t.run(async (ctx) => {
      const cook = (await ctx.db.query('memberships').collect()).find((m) => m.grants.includes('menu.price'))!
      await ctx.db.patch(cook._id, { grants: [] })
    })
    await s.advanceTo(at + MINUTE)
    expect((await s.row(s.saibling))!.data.price).toEqual({ amount: 1350 })
    expect(await s.t.run((ctx) => ctx.db.get(release))).toMatchObject({ status: 'stale' })
    expect((await s.proposalRow(a.proposal))!).toMatchObject({ status: 'stale', reasonMsg: { key: 'history.staleRefused' } })
    expect((await s.proposalRow(b.proposal))!.status).toBe('open')
    expect((await s.rows('outbox')).map((m) => m.subject)).toContain('Nicht live gegangen: eine geplante Änderung für Gasthaus zur Linde')
  })

  it('staff cannot make or decide releases', async () => {
    const s = await approvalSetup()
    expect((await errorOf(s.as.cook.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'X' }))).code).toBe('FORBIDDEN')
  })
})

describe('the agent door', () => {
  let rpcId = 0
  async function call(s: Setup, key: string, name: string, args: Record<string, unknown> = {}) {
    const response = await s.t.fetch('/mcp', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    })
    const answer = ((await response.json()) as { result: { content: { text: string }[]; isError: boolean } }).result
    return { text: answer.content[0]!.text, isError: answer.isError }
  }
  const PROPOSED = 'Proposed, waiting for approval.'

  type Level = boolean | undefined
  /** Key setting, site setting, config default → does a "Heute ausgebucht" call from the owner's agent become a proposal? */
  it.each<[string, Level, Level, Level, boolean]>([
    ['everything unset: off', undefined, undefined, undefined, false],
    ['config on', undefined, undefined, true, true],
    ['site off beats config on', undefined, false, true, false],
    ['site on beats config unset', undefined, true, undefined, true],
    ['key off beats site on', false, true, true, false],
    ['key on beats site off and config off', true, false, false, true],
  ])('review precedence key, site, config: %s', async (_name, keySetting, siteSetting, configSetting, expected) => {
    const s = await approvalSetup()
    const key = await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'Claude Code' })
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const schema = site.schema as Schema
      if (configSetting !== undefined) schema.agents = { review: configSetting }
      await ctx.db.patch(s.site, { schema, agentReview: siteSetting })
      await ctx.db.patch(key.id, { review: keySetting })
    })
    const done = await call(s, key.key, 'task_notices_soldOut')
    expect(done.isError).toBe(false)
    expect(done.text.startsWith(PROPOSED)).toBe(expected)
    expect((await s.rows('proposals')).length).toBe(expected ? 1 : 0)
    expect((await s.rows('changes')).length).toBe(expected ? 0 : 1)
  })

  it('the owner approves a proposal of their own agent ("show me first")', async () => {
    const s = await approvalSetup()
    const key = await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'Claude Code' })
    await s.as.owner.mutation(api.agent.setKeyReview, { site: 'restaurant', key: key.id, review: true })
    expect(await call(s, key.key, 'task_notices_soldOut')).toEqual({ text: PROPOSED, isError: false })
    const [proposal] = await s.rows('proposals')
    expect(proposal).toMatchObject({ via: 'agent', agentKey: key.id, author: 'u-wirtin', status: 'open' })
    expect(await s.as.owner.mutation(api.proposals.approve, { proposal: proposal!._id })).toMatchObject({ status: 'applied' })
    expect(await s.rows('changes')).toMatchObject([{ kind: 'create', actor: 'u-wirtin', via: 'agent', agentKey: key.id, approvedBy: 'u-wirtin' }])
  })

  it('staff can switch review on for their key but not off; the site setting is for owners', async () => {
    const s = await approvalSetup()
    const key = await s.as.cook.mutation(api.agent.createKey, { site: 'restaurant', label: 'Koch' })
    await expect(s.as.cook.mutation(api.agent.setKeyReview, { site: 'restaurant', key: key.id, review: true })).resolves.toMatchObject({ review: true })
    expect((await errorOf(s.as.cook.mutation(api.agent.setKeyReview, { site: 'restaurant', key: key.id, review: false }))).code).toBe('FORBIDDEN')
    await expect(s.as.owner.mutation(api.agent.setKeyReview, { site: 'restaurant', key: key.id, review: null })).resolves.toMatchObject({ review: null })
    expect((await errorOf(s.as.cook.mutation(api.sites.setAgentReview, { site: 'restaurant', review: false }))).code).toBe('FORBIDDEN')
    await s.as.owner.mutation(api.sites.setAgentReview, { site: 'restaurant', review: true })
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.agentReview).toBe(true)
  })
})

describe('digest mail', () => {
  it('two proposals within ten minutes make one mail to the owner, listing both', async () => {
    const s = await approvalSetup()
    await s.cookPrice(s.saibling, 1450)
    await s.advanceTo(NOW + 4 * MINUTE)
    await s.cookPrice(s.frittaten, 1100)
    await s.advanceTo(NOW + 9 * MINUTE)
    expect(await s.rows('outbox')).toHaveLength(0)

    await s.advanceTo(NOW + 11 * MINUTE)
    const mails = await s.rows('outbox')
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({ to: 'wirtin@example.com', subject: expect.stringContaining('2 Vorschläge') })
    expect(mails[0]!.text).toContain('koch@example.com: Preis von „Gebeizter Saibling“ geändert')
    expect(mails[0]!.text).toContain('koch@example.com: Preis von „Frittatensuppe“ geändert')
    expect(mails[0]!.text).toContain('https://ginko.test/s/restaurant/review')

    // The next proposal starts the next digest; the two already mailed are not listed again.
    await s.cookPrice(s.saibling, 1500)
    await s.advanceTo(NOW + 25 * MINUTE)
    const later = await s.rows('outbox')
    expect(later).toHaveLength(2)
    expect(later[1]!.text).toContain('Preis von „Gebeizter Saibling“ geändert')
    expect(later[1]!.text).not.toContain('Frittaten')
  })

  it('a proposal decided within the window is not mailed', async () => {
    const s = await approvalSetup()
    const { proposal } = (await s.cookPrice(s.saibling, 1450)) as Proposed
    await s.as.owner.mutation(api.proposals.reject, { proposal, reason: 'Nein.' })
    await s.advanceTo(NOW + 11 * MINUTE)
    // Only the cook's rejection mail: no digest to the owner.
    expect((await s.rows('outbox')).map((m) => m.to)).toEqual(['koch@example.com'])
  })
})

describe('retention', () => {
  it('deletes decided proposals older than a year and keeps the rest', async () => {
    const s = await approvalSetup()
    const base = { site: s.site, op: 'save' as const, brick: 'menu', args: {}, base: {}, author: 'u-koch', via: 'ui' as const, createdAt: NOW - 2 * YEAR }
    const ids = await s.t.run(async (ctx) => ({
      old: await ctx.db.insert('proposals', { ...base, sentence: 'alt', status: 'rejected', decidedAt: NOW - YEAR - HOUR }),
      recent: await ctx.db.insert('proposals', { ...base, sentence: 'neu', status: 'rejected', decidedAt: NOW - 10 * HOUR }),
      open: await ctx.db.insert('proposals', { ...base, sentence: 'offen', status: 'open' }),
    }))
    await s.t.mutation(internal.retention.daily, {})
    const left = (await s.rows('proposals')).map((p) => p._id)
    expect(left.sort()).toEqual([ids.recent, ids.open].sort())
  })
})
