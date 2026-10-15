// GDPR deletion: a person deletes their account, an owner deletes a site (7 days, cancellable, then a hard delete),
// and a daily clean-up drops stale personal data. Everything goes through the public Convex functions.
import { sha256 } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, components, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import { errorOf, firstPage, opId, setup, upload } from './setup'

const DAY = 24 * 60 * 60 * 1000

afterEach(() => vi.useRealTimers())

type Backend = Awaited<ReturnType<typeof setup>>

const baUser = (s: Backend, id: string) => s.t.query(components.betterAuth.adapter.findOne, { model: 'user', where: [{ field: 'id', value: id }] })
const baSession = (s: Backend, userId: string) => s.t.query(components.betterAuth.adapter.findOne, { model: 'session', where: [{ field: 'userId', value: userId }] })

describe('delete account', () => {
  // Wrong behaviour caught: the only owner deletes their account and the site is left without anyone who can manage it.
  it('is refused while the person is the last owner of a site, naming the site', async () => {
    const s = await setup()
    const error = await errorOf(s.as.owner.mutation(api.account.deleteAccount, {}))
    expect(error.code).toBe('INVALID')
    expect(error.message).toContain('Gasthaus')
    expect(await baUser(s, 'u-wirtin')).not.toBeNull()
    expect(await s.t.run((ctx) => ctx.db.query('memberships').collect())).toHaveLength(3)

    // With a second owner the first one may go.
    await s.t.run((ctx) => ctx.db.insert('memberships', { site: s.site, user: 'u-neu', email: 'neu@example.com', role: 'owner', grants: [] }))
    await s.as.owner.mutation(api.account.deleteAccount, {})
    expect(await baUser(s, 'u-wirtin')).toBeNull()
  })

  // Wrong behaviour caught: the person's address stays in the data, history loses its rows, or the old session still works.
  it('removes memberships, invites, sessions and settings; history stays and shows "former"', async () => {
    const s = await setup()
    const entry = s.entries['menu-saibling']!
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry, baseRev: 1, fields: { price: { amount: 1500 } } })
    await s.as.cook.mutation(api.account.setLocale, { locale: 'en' })
    await s.as.cook.mutation(api.views.save, { site: 'restaurant', brick: 'menu', name: 'Meine Ansicht', query: {} })
    await s.t.run((ctx) => ctx.db.insert('invites', { site: s.other, email: 'koch@example.com', role: 'staff', grants: [], tokenHash: 'x', invitedBy: 'u-fremd', expiresAt: Date.now() + DAY }))
    const whoBefore = async () => ((await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage, by: undefined })).page.find((c) => c.actor === 'u-koch'))!.who
    expect(await whoBefore()).toEqual({ email: 'koch@example.com' })

    await s.as.cook.mutation(api.account.deleteAccount, {})

    expect(await baUser(s, 'u-koch')).toBeNull()
    expect(await baSession(s, 'u-koch')).toBeNull()
    await errorOf(s.as.cook.query(api.sites.mine, {}))
    const left = await s.t.run(async (ctx) => {
      const out: Record<string, number> = {}
      for (const table of ['memberships', 'invites', 'userSettings', 'views', 'agentKeys'] as const) {
        out[table] = (await ctx.db.query(table).collect()).filter((r) => JSON.stringify(r).includes('u-koch') || JSON.stringify(r).includes('koch@example.com')).length
      }
      return out
    })
    expect(left).toEqual({ memberships: 0, invites: 0, userSettings: 0, views: 0, agentKeys: 0 })
    // The history line is still there; the owner now reads "former" instead of an address.
    expect(await whoBefore()).toEqual({ kind: 'former' })
    // Nobody else lost anything.
    expect(await baUser(s, 'u-wirtin')).not.toBeNull()
    expect((await s.as.owner.query(api.members.list, { site: 'restaurant' })).members.map((m) => m.email)).toEqual(['wirtin@example.com'])
  })
})

/** Rows of every table that has a `site` field, as `table -> count`, for one site. */
async function rowsOfSite(s: Backend, site: Id<'sites'>) {
  return s.t.run(async (ctx) => {
    const out: Record<string, number> = {}
    for (const [name, table] of Object.entries(schema.tables)) {
      if (!('site' in (table as unknown as { validator: { fields: object } }).validator.fields)) continue
      const rows = await ctx.db.query(name as 'entries').collect()
      out[name] = rows.filter((r) => (r as unknown as { site: Id<'sites'> }).site === site).length
    }
    return out
  })
}

describe('delete site', () => {
  it('blocks every way in at once; cancel brings them back', async () => {
    const s = await setup()
    const pushKey = (await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'ci', scopes: ['release'] })).key
    const agentKey = await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'ai' })
    const open = async () => ({
      studio: await s.as.owner.query(api.sites.meta, { site: 'restaurant' }).then(() => 'open', () => 'closed'),
      cook: await s.as.cook.query(api.entries.trash, { site: 'restaurant', paginationOpts: firstPage }).then(() => 'open', () => 'closed'),
      bundle: (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).status,
      push: !!(await s.t.query(internal.release.pushKey, { hash: sha256(pushKey) })),
      agent: (await s.t.mutation(internal.agent.admit, { hash: sha256(agentKey.key) })).ok,
    })
    expect(await open()).toEqual({ studio: 'open', cook: 'open', bundle: 200, push: true, agent: true })

    const wrong = await errorOf(s.as.owner.mutation(api.sites.startDeletion, { site: 'restaurant', confirm: 'Restaurant' }))
    expect(wrong.code).toBe('INVALID')
    expect(await open()).toMatchObject({ studio: 'open' })

    const { at } = await s.as.owner.mutation(api.sites.startDeletion, { site: 'restaurant', confirm: 'restaurant' })
    expect(at).toBe(Date.now() + 7 * DAY)
    const unknown = (await s.t.fetch('/bundle/nope?format=3&locale=de')).status
    expect(await open()).toEqual({ studio: 'closed', cook: 'closed', bundle: unknown, push: false, agent: false })
    // Only the owner can see the deletion and cancel it.
    expect(await s.as.owner.query(api.sites.deletion, { site: 'restaurant' })).toEqual({ name: 'Gasthaus zur Linde', at })
    expect(await s.as.cook.query(api.sites.deletion, { site: 'restaurant' })).toBeNull()
    expect((await s.as.owner.query(api.sites.mine, {})).map((x) => x.slug)).toEqual(['restaurant'])
    expect(await s.as.cook.query(api.sites.mine, {})).toEqual([])

    await s.as.owner.mutation(api.sites.cancelDeletion, { site: 'restaurant' })
    expect(await open()).toEqual({ studio: 'open', cook: 'open', bundle: 200, push: true, agent: true })
    expect(await s.as.owner.query(api.sites.deletion, { site: 'restaurant' })).toBeNull()
  })

  // Wrong behaviour caught: staff or a stranger deletes a customer's site; an admin cannot rescue one.
  it('is for owners and admins only', async () => {
    const s = await setup()
    for (const person of ['cook', 'stranger'] as const) {
      const error = await errorOf(s.as[person].mutation(api.sites.startDeletion, { site: 'restaurant', confirm: 'restaurant' }))
      expect(error.code).toBe('FORBIDDEN')
    }
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.deleting).toBeUndefined()
    await s.as.admin.mutation(api.sites.startDeletion, { site: 'restaurant', confirm: 'restaurant' })
    expect(await errorOf(s.as.cook.mutation(api.sites.cancelDeletion, { site: 'restaurant' }))).toMatchObject({ code: 'FORBIDDEN' })
    await s.as.admin.mutation(api.sites.cancelDeletion, { site: 'restaurant' })
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.deleting).toBeUndefined()
  })

  it('the scheduled hard delete leaves no row of the site in any table and no stored file, and spares other sites', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-10-08T10:00:00Z'))
    vi.stubEnv('GINKO_MAIL', 'outbox')
    vi.stubEnv('SITE_URL', 'https://ginko.test')
    const s = await setup()
    // One row in every table that names a site.
    const file = await upload(s, { person: 'owner' })
    const stored = await s.t.run(async (ctx) => {
      const variant = await ctx.storage.store(new Blob(['variant']))
      const processed = await ctx.storage.store(new Blob(['processed']))
      await ctx.db.patch(file, { processedId: processed, variants: [{ width: 320, storageId: variant }] })
      const row = (await ctx.db.get(file))!
      await ctx.db.insert('fileRefs', { site: s.site, file, holder: 'change', holderId: 'x' })
      await ctx.db.insert('migrationsApplied', { site: s.site, id: 'm1', brick: 'menu', fills: 'x', fingerprint: 'f', schemaRev: 1 })
      await ctx.db.insert('reminders', { site: s.site, brick: 'lunch', week: '2026-W41', user: 'u-wirtin', at: Date.now() })
      return [row.storageId, processed, variant]
    })
    await s.as.owner.mutation(api.files.createFolder, { site: 'restaurant', name: 'Ordner' })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.entries['menu-saibling']!, baseRev: 1, fields: { price: { amount: 1500 } } })
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.entries['menu-frittaten']!, baseRev: 1, fields: { price: { amount: 999 } } })
    // A Markdown text stores its trees (entryTrees).
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.entries.legal!, baseRev: 1, fields: { imprint: { de: '**Hallo**' } } })
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const menu = (site.schema as { bricks: Record<string, { tasks?: { needsApproval?: boolean }[] }> }).bricks.menu!
      for (const task of menu.tasks ?? []) task.needsApproval = true
      await ctx.db.patch(s.site, { schema: site.schema })
    })
    await s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry: s.entries['menu-saibling']!, baseRev: 2, fields: { price: { amount: 1600 } } })
    await s.as.owner.mutation(api.proposals.createRelease, { site: 'restaurant', name: 'R' })
    await s.as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: [] })
    await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'ci', scopes: ['release'] })
    await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'ai' })
    await s.as.owner.mutation(api.views.save, { site: 'restaurant', brick: 'menu', name: 'V', query: {} })
    await s.as.owner.mutation(api.uploads.prepare, { site: 'restaurant' })
    await s.t.fetch('/bundle/restaurant?format=3&locale=de')
    // The other site keeps everything.
    await s.as.stranger.mutation(api.files.createFolder, { site: 'andere', name: 'Bleibt' })

    const before = await rowsOfSite(s, s.site)
    const empty = Object.entries(before).filter(([, n]) => n === 0).map(([name]) => name)
    expect(empty, 'every table with a site field must have a row, or this test proves nothing').toEqual([])
    const otherBefore = await rowsOfSite(s, s.other)
    for (const id of stored) expect(await s.t.run((ctx) => ctx.db.system.get(id))).not.toBeNull()

    await s.as.owner.mutation(api.sites.startDeletion, { site: 'restaurant', confirm: 'restaurant' })
    // Not yet: the job is for day 7.
    vi.advanceTimersByTime(6 * DAY)
    await s.t.finishInProgressScheduledFunctions()
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.deleting).toBeDefined()
    expect((await rowsOfSite(s, s.site)).entries).toBeGreaterThan(0)

    vi.advanceTimersByTime(DAY + 1000)
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await s.t.run((ctx) => ctx.db.get(s.site))).toBeNull()
    expect(Object.values(await rowsOfSite(s, s.site)).every((n) => n === 0)).toBe(true)
    for (const id of stored) expect(await s.t.run((ctx) => ctx.db.system.get(id))).toBeNull()
    expect(await rowsOfSite(s, s.other)).toEqual(otherBefore)
    expect((await s.t.run((ctx) => ctx.db.get(s.other)))!.slug).toBe('andere')
  })
})

describe('daily clean-up of stale personal data', () => {
  // Wrong behaviour caught: the clean-up removes live sessions, open invitations or recent ones.
  it('removes expired sessions, verification rows and invitations expired 30+ days ago, and nothing else', async () => {
    const s = await setup()
    const now = Date.now()
    const ba = (model: 'session' | 'verification', id: string, expiresAt: number) =>
      s.t.mutation(components.betterAuth.adapter.create, {
        model,
        data: model === 'session'
          ? { id, token: `t-${id}`, userId: 'u-wirtin', expiresAt, createdAt: now, updatedAt: now, ipAddress: '203.0.113.7', userAgent: 'x' }
          : { id, identifier: `i-${id}`, value: 'v', expiresAt, createdAt: now, updatedAt: now },
      })
    await ba('session', 'old-s', now - 1000)
    await ba('session', 'new-s', now + DAY)
    await ba('verification', 'old-v', now - 1000)
    await ba('verification', 'new-v', now + 1000)
    const invite = (tag: string, expiresAt: number, acceptedAt?: number) =>
      s.t.run((ctx) => ctx.db.insert('invites', { site: s.site, email: `${tag}@example.com`, role: 'staff', grants: [], tokenHash: tag, invitedBy: 'u-wirtin', expiresAt, ...(acceptedAt ? { acceptedAt } : {}) }))
    await invite('stale', now - 31 * DAY)
    await invite('stale-accepted', now - 40 * DAY, now - 45 * DAY)
    await invite('recent', now - 29 * DAY)
    await invite('open', now + 3 * DAY)

    await s.t.mutation(internal.cleanup.daily, {})
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)

    const find = (model: 'session' | 'verification', id: string) => s.t.query(components.betterAuth.adapter.findOne, { model, where: [{ field: 'id', value: id }] })
    expect([await find('session', 'old-s'), await find('verification', 'old-v')]).toEqual([null, null])
    expect(await find('session', 'new-s')).not.toBeNull()
    expect(await find('verification', 'new-v')).not.toBeNull()
    // The sessions of the signed-in test people live on.
    expect(await baSession(s, 'u-koch')).not.toBeNull()
    const invites = await s.t.run((ctx) => ctx.db.query('invites').collect())
    expect(invites.map((i) => i.tokenHash).sort()).toEqual(['open', 'recent'])
  })
})
