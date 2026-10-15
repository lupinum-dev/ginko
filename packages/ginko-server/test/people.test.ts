// Invitations, memberships, and the read queries of sites and changes (SPEC 2.7, 10, 4.2).
import { sha256 } from '@lupinum/ginko/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import betterAuthSchema from '../convex/betterAuth/schema'
import { api, components, internal } from '../convex/_generated/api'
import { cookGrants, errorOf, firstPage, opId, people, setup } from './setup'

beforeEach(() => {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** The token from the newest invite mail to `email`, the only place it is visible. */
async function tokenMailedTo(t: Awaited<ReturnType<typeof setup>>['t'], email: string): Promise<string> {
  const mails = await t.run((ctx) => ctx.db.query('outbox').withIndex('by_to', (q) => q.eq('to', email)).collect())
  const link = mails.at(-1)?.text.match(/https:\/\/ginko\.test\/invite\/([A-Za-z0-9_-]+)/)
  if (!link) throw new Error(`no invite mail to ${email}`)
  return link[1]!
}

describe('invites.mine and acceptMine', () => {
  it('lists only open invites for the own address and drops them once accepted', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'andere@example.com', role: 'staff', grants: [] })
    const invited = t.withIdentity({ subject: 'u-neu', email: 'Neu@Example.com' })
    const [card, ...rest] = await invited.query(api.invites.mine, {})
    expect(rest).toEqual([])
    expect(card).toMatchObject({ site: 'Gasthaus zur Linde', role: 'staff' })
    expect(await as.stranger.query(api.invites.mine, {})).toEqual([])

    await expect(invited.mutation(api.invites.acceptMine, { invite: card!.invite })).resolves.toEqual({ already: false, site: 'restaurant' })
    expect(await invited.query(api.invites.mine, {})).toEqual([])
    const membership = await t.run((ctx) => ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', 'u-neu')).unique())
    expect(membership).toMatchObject({ role: 'staff', grants: ['menu.price'], email: 'neu@example.com' })
  })

  it('another user cannot accept it and learns nothing; the invite stays open', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: [] })
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    const [card] = await invited.query(api.invites.mine, {})
    const stranger = t.withIdentity({ subject: 'u-anders', email: 'anders@example.com' })
    const refused = await errorOf(stranger.mutation(api.invites.acceptMine, { invite: card!.invite }))
    const missing = await errorOf(stranger.mutation(api.invites.acceptMine, { invite: 'nicht-vorhanden' }))
    expect(refused).toMatchObject({ code: 'NOT_FOUND', message: missing.message })
    expect(await invited.query(api.invites.mine, {})).toHaveLength(1)
  })

  it('an expired invite is not listed and cannot be accepted', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: [] })
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    const [card] = await invited.query(api.invites.mine, {})
    await t.run(async (ctx) => {
      const invite = await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', 'neu@example.com')).unique()
      await ctx.db.patch(invite!._id, { expiresAt: Date.now() - 1 })
    })
    expect(await invited.query(api.invites.mine, {})).toEqual([])
    const error = await errorOf(invited.mutation(api.invites.acceptMine, { invite: card!.invite }))
    expect(error).toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('abgelaufen') })
  })
})

describe('invites.accept', () => {
  it('rejects a signed-in user with another email and keeps the invite open for the invited one', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const token = await tokenMailedTo(t, 'neu@example.com')
    const stranger = t.withIdentity({ subject: 'u-anders', email: 'anders@example.com' })
    expect((await errorOf(stranger.mutation(api.invites.accept, { token }))).code).toBe('FORBIDDEN')
    const invited = t.withIdentity({ subject: 'u-neu', email: 'Neu@Example.com' })
    await expect(invited.mutation(api.invites.accept, { token })).resolves.toEqual({ already: false, site: 'restaurant' })
  })

  // Break-it 9: the page before accepting names the site and the role, and says when the link is for another address.
  // Wrong behaviour caught (onboard-4): a signed-out invitee was sent to a bare sign-in page with no word about the
  // invite, typed another address and waited for a code that never came.
  it('peek names site, address, role and rights, also signed out, tells whether the invite is for this address, and is null once used', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.add', 'menu.price'] })
    const token = await tokenMailedTo(t, 'neu@example.com')
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    const stranger = t.withIdentity({ subject: 'u-anders', email: 'anders@example.com' })
    const offer = { site: 'Gasthaus zur Linde', url: 'https://ginko-demo-restaurant.vercel.app', role: 'staff', rights: ['Speisekarte: Preis ändern, Gericht hinzufügen'] }
    expect(await t.query(api.invites.peek, { token })).toEqual({ ...offer, email: 'neu@example.com', forYou: false })
    expect(await t.query(api.invites.peek, { token, language: 'en' })).toMatchObject({ rights: ['Menu: Change a price, Add a dish'] })
    expect(await invited.query(api.invites.peek, { token })).toEqual({ ...offer, forYou: true })
    expect(await stranger.query(api.invites.peek, { token })).toEqual({ ...offer, forYou: false })
    await invited.mutation(api.invites.accept, { token })
    expect(await invited.query(api.invites.peek, { token })).toBeNull()
    expect(await t.query(api.invites.peek, { token })).toBeNull()
  })

  it('a second accept of the same link is NOT_FOUND', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const token = await tokenMailedTo(t, 'neu@example.com')
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    await invited.mutation(api.invites.accept, { token })
    expect((await errorOf(invited.mutation(api.invites.accept, { token }))).code).toBe('NOT_FOUND')
  })

  it('an expired invite is NOT_FOUND', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const token = await tokenMailedTo(t, 'neu@example.com')
    await t.run(async (ctx) => {
      const invite = await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', 'neu@example.com')).unique()
      await ctx.db.patch(invite!._id, { expiresAt: Date.now() - 1 })
    })
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    expect((await errorOf(invited.mutation(api.invites.accept, { token }))).code).toBe('NOT_FOUND')
  })

  it('an existing member gets { already: true } and keeps role and grants', async () => {
    const { t, as, site } = await setup()
    // Inviting a member is refused (F14), so the person joins by another way while the invite is open.
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.add'] })
    const token = await tokenMailedTo(t, 'neu@example.com')
    await t.run((ctx) => ctx.db.insert('memberships', { site, user: 'u-neu', email: 'neu@example.com', role: 'staff', grants: cookGrants }))
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    await expect(invited.mutation(api.invites.accept, { token })).resolves.toEqual({ already: true, site: 'restaurant' })
    const membership = await t.run((ctx) => ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', 'u-neu')).unique())
    expect(membership).toMatchObject({ role: 'staff', grants: cookGrants })
  })

  it('a link that was replaced by a newer invite no longer works', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const oldToken = await tokenMailedTo(t, 'neu@example.com')
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.add'] })
    const invited = t.withIdentity({ subject: 'u-neu', email: 'neu@example.com' })
    expect((await errorOf(invited.mutation(api.invites.accept, { token: oldToken }))).code).toBe('NOT_FOUND')
  })
})

describe('invites.create', () => {
  it('staff cannot invite', async () => {
    const { as } = await setup()
    const call = as.cook.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: [] })
    expect((await errorOf(call)).code).toBe('FORBIDDEN')
  })

  it('an owner cannot invite an owner', async () => {
    const { as } = await setup()
    const call = as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'owner', grants: [] })
    expect((await errorOf(call)).code).toBe('FORBIDDEN')
  })

  it('grants with an unknown TaskRef are rejected', async () => {
    const { as } = await setup()
    const call = as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.nope'] })
    expect(await errorOf(call)).toMatchObject({ code: 'INVALID', details: { grant: 'menu.nope' } })
  })

  it('without a mail sink nothing is created: sending is off', async () => {
    vi.stubEnv('GINKO_MAIL', '')
    const { t, as } = await setup()
    const call = as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: [] })
    expect((await errorOf(call)).message).toBe('Anmeldung noch nicht eingerichtet.')
    expect(await t.run((ctx) => ctx.db.query('invites').collect())).toHaveLength(0)
  })

  // Wrong behaviour caught (onboard-4, admin-7): a mail that names no sender, website or rights reads like phishing.
  it('the invite mail names the inviter, the website and the rights, carries the link, and only the token hash is stored', async () => {
    const { t, as } = await setup()
    await as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const mails = await t.run((ctx) => ctx.db.query('outbox').collect())
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({ to: 'neu@example.com', subject: 'Einladung zu Gasthaus zur Linde von wirtin@example.com' })
    expect(mails[0]!.text).toContain('wirtin@example.com lädt dich ein, die Website Gasthaus zur Linde (https://ginko-demo-restaurant.vercel.app) zu bearbeiten.')
    expect(mails[0]!.text).toContain('Du darfst:\n- Speisekarte: Preis ändern\n')
    const token = await tokenMailedTo(t, 'neu@example.com')
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const invite = await t.run((ctx) => ctx.db.query('invites').unique())
    expect(invite).toMatchObject({ tokenHash: sha256(token), grants: ['menu.price'], role: 'staff' })
    expect(JSON.stringify(invite)).not.toContain(token)
  })

  it('an owner sends 20 invites in an hour; the 21st is refused without a mail, a platform admin is not counted', async () => {
    const { t, as } = await setup()
    const invite = (who: typeof as.owner, email: string) => who.mutation(api.invites.create, { site: 'restaurant', email, role: 'staff', grants: [] })
    const mails = async () => (await t.run((ctx) => ctx.db.query('outbox').collect())).length
    for (let i = 0; i < 20; i++) await invite(as.owner, `a${i}@example.com`)
    expect(await errorOf(invite(as.owner, 'a20@example.com'))).toMatchObject({ code: 'RATE_LIMITED', key: 'errors.tooManyInvites', params: { max: 20 } })
    expect(await mails()).toBe(20)
    await invite(as.admin, 'b0@example.com')
    expect(await mails()).toBe(21)
    vi.setSystemTime(Date.now() + 61 * 60_000)
    await invite(as.owner, 'a20@example.com')
    expect(await mails()).toBe(22)
  })
})

describe('members.remove and setGrants', () => {
  // Wrong behaviour caught (A17): the Team page cannot tell the caller's own row, so it offers an owner to remove themselves.
  it("members.list marks only the caller's own membership as you", async () => {
    const { as } = await setup()
    const rows = async (who: typeof as.owner) => (await who.query(api.members.list, { site: 'restaurant' })).members.map((m) => [m.email, m.you])
    expect(await rows(as.owner)).toEqual([['wirtin@example.com', true], ['koch@example.com', false]])
    // A platform admin has no membership row.
    expect(await rows(as.admin)).toEqual([['wirtin@example.com', false], ['koch@example.com', false]])
  })

  it('the last owner cannot be removed', async () => {
    const { t, as } = await setup()
    const owner = await t.run((ctx) => ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', people.owner)).unique())
    expect(await errorOf(as.owner.mutation(api.members.remove, { site: 'restaurant', member: owner!._id }))).toMatchObject({ code: 'INVALID' })
  })

  it('an owner cannot set grants on an owner', async () => {
    const { t, as } = await setup()
    const owner = await t.run((ctx) => ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', people.owner)).unique())
    expect((await errorOf(as.owner.mutation(api.members.setGrants, { site: 'restaurant', member: owner!._id, grants: ['menu.price'] }))).code).toBe('INVALID')
  })
})

describe('sites and changes reads', () => {
  it('sites.meta never contains refreshToken', async () => {
    const { t, as, site } = await setup()
    await t.run((ctx) => ctx.db.patch(site, { refreshToken: 'vercel-bypass-secret' }))
    const result = await as.owner.query(api.sites.meta, { site: 'restaurant' })
    expect(result.site).not.toHaveProperty('refreshToken')
    expect(JSON.stringify(result)).not.toContain('vercel-bypass-secret')
  })

  it('sites.meta of another site is FORBIDDEN', async () => {
    const { as } = await setup()
    expect((await errorOf(as.stranger.query(api.sites.meta, { site: 'restaurant' }))).code).toBe('FORBIDDEN')
  })

  it('changes.list of another site is FORBIDDEN', async () => {
    const { as } = await setup()
    expect((await errorOf(as.stranger.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage }))).code).toBe('FORBIDDEN')
  })
})

describe('admin bootstrap on sign-in (Phase 5 review)', () => {
  it('an existing user listed in GINKO_ADMIN_EMAILS later becomes admin at the next sign-in', async () => {
    const { t } = await setup()
    t.registerComponent('betterAuth', betterAuthSchema, import.meta.glob(['../convex/betterAuth/**/*.*s', '!../convex/betterAuth/**/*.test.ts']))
    const now = Date.now()
    // Better Auth user row, created before the address was listed (no trigger in this path).
    await t.mutation(components.betterAuth.adapter.create, {
      model: 'user',
      data: { id: 'bc-wirt', name: 'Wirt', email: 'wirt@example.com', emailVerified: true, image: null, createdAt: now, updatedAt: now, bcnSecurityGeneration: 1 },
    })
    const signIn = () => t.mutation(internal.auth.onCreate, { model: 'session', doc: { userId: 'bc-wirt' } })

    await signIn()
    expect(await t.run((ctx) => ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', 'bc-wirt')).unique())).toBeNull()

    vi.stubEnv('GINKO_ADMIN_EMAILS', 'wirt@example.com')
    await signIn()
    await signIn()
    expect(await t.run((ctx) => ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', 'bc-wirt')).collect())).toHaveLength(1)
  })
})

describe('changes.list names who changed', () => {
  // Without names the Verlauf said "Jemand" for every change; the team needs to know who did what.
  it('a member is named by email, a platform admin as kind platform', async () => {
    const { as, entries } = await setup()
    const entry = entries['menu-saibling']!
    await as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.price', entry, baseRev: 1, fields: { price: { amount: 1450 } }, sentence: 'Preis' })
    await as.admin.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev: 2, fields: { price: { amount: 1500 } }, sentence: 'Preis' })
    const { page } = await as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage })
    expect(page.slice(0, 2).map((c) => c.who)).toEqual([{ kind: 'platform' }, { email: 'koch@example.com' }])
  })
})

describe('changes.list who and paging (Phase 9: F08, F09, F16, F17)', () => {
  const save = (s: Awaited<ReturnType<typeof setup>>, who: 'owner' | 'cook' | 'admin', baseRev: number, sentence = 'Preis') => {
    const task = who === 'cook' ? { task: 'menu.price' } : {}
    return s.as[who].mutation(api.entries.save, { site: 'restaurant', opId: opId(), ...task, entry: s.entries['menu-saibling']!, baseRev, fields: { price: { amount: 1400 + baseRev } }, sentence })
  }

  it('a member who left is kind former, only a real admin is kind platform', async () => {
    const s = await setup()
    await save(s, 'cook', 1)
    await save(s, 'admin', 2)
    await s.t.run(async (ctx) => {
      const cook = (await ctx.db.query('memberships').collect()).find((m) => m.user === people.cook)!
      await ctx.db.delete(cook._id)
    })
    const { page } = await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage })
    expect(page.map((c) => c.who)).toEqual([{ kind: 'platform' }, { kind: 'former' }])
  })

  // Wrong behaviour caught (R10, romi-16): the reader's own change came back as their email ("anna@… hat inzwischen
  // Beschreibung geändert" for her own other window), and people had no names, so the history read as a list of addresses.
  it('the reader is self, a colleague has the name they set; staff never get a colleague\'s email, managers do', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.account.setName, { name: '  Maria   Huber ' })
    await save(s, 'owner', 1)
    await save(s, 'cook', 2)
    const whoFor = async (person: 'owner' | 'cook' | 'admin') => (await s.as[person].query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage })).page.map((c) => c.who)
    expect(await whoFor('cook')).toEqual([{ self: true }, { kind: 'member', name: 'Maria Huber' }])
    expect(await whoFor('owner')).toEqual([{ email: 'koch@example.com' }, { self: true }])
    expect(await whoFor('admin')).toEqual([{ email: 'koch@example.com' }, { email: 'wirtin@example.com', name: 'Maria Huber' }])
    expect((await s.as.owner.query(api.members.list, { site: 'restaurant' })).members.map((m) => m.name)).toEqual(['Maria Huber', null])

    // An empty name removes it: the team sees the email again.
    await s.as.owner.mutation(api.account.setName, { name: ' ' })
    expect(await whoFor('admin')).toEqual([{ email: 'koch@example.com' }, { email: 'wirtin@example.com' }])
  })

  it('an invalid cursor is INVALID, not a raw error', async () => {
    const { as } = await setup()
    expect((await errorOf(as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: { numItems: 50, cursor: 'garbage' } }))).code).toBe('INVALID')
  })

  it('a page ends after about 2 MiB, hands out the cursor for the rest, and carries no before/after blobs', async () => {
    const s = await setup()
    // Both legal texts at their maximum length: one change row stores them twice (before, after).
    const text = (k: number) => Array.from({ length: 245 }, (_, i) => `P${k}-${i}`.padEnd(200, 'x')).join('\n\n')
    let rev = 1
    for (let i = 0; i < 15; i++) {
      const saved = await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.entries.legal!, baseRev: rev, fields: { imprint: { de: text(i) }, privacy: { de: text(i) } }, sentence: `Rechtliches ${i}` }) as { rev: number }
      rev = saved.rev
    }
    const seen: string[] = []
    let cursor: string | null = null
    let first: Awaited<ReturnType<typeof listPage>> | undefined
    const listPage = (c: string | null) => s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: { numItems: 50, cursor: c } })
    do {
      const page = await listPage(cursor)
      first ??= page
      seen.push(...page.page.map((c) => c._id))
      cursor = page.isDone ? null : page.continueCursor
    } while (cursor)
    expect(first.page.length).toBeLessThan(15)
    expect(first.isDone).toBe(false)
    expect(first.page[0]).not.toHaveProperty('before')
    expect(first.page[0]).not.toHaveProperty('after')
    expect(seen).toHaveLength(15)
    expect(new Set(seen).size).toBe(15)
  })
})

describe('sites.create and sites.bootstrap input (F05)', () => {
  const create = (s: Awaited<ReturnType<typeof setup>>, args: { slug?: string; name?: string; url?: string }) =>
    s.as.admin.mutation(api.sites.create, { slug: 'neue-seite', name: 'Neue Seite', url: 'https://neu.example', ...args })

  it.each([['a digit first', '1abc'], ['one character', 'a'], ['42 characters', 'x'.repeat(42)], ['upper case', 'Abc'], ['an underscore', 'a_b']])('refuses a slug with %s', async (_name, slug) => {
    const s = await setup()
    expect((await errorOf(create(s, { slug }))).code).toBe('INVALID')
    expect((await errorOf(s.t.mutation(internal.sites.bootstrap, { slug, name: 'Neu', url: 'https://neu.example' }))).code).toBe('INVALID')
  })

  it('refuses a name over 100 characters and an url that is not http or https', async () => {
    const s = await setup()
    expect((await errorOf(create(s, { name: 'x'.repeat(101) }))).code).toBe('INVALID')
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.example', 'kein url']) expect((await errorOf(create(s, { url }))).code).toBe('INVALID')
    // http://localhost is the dev setup only (GINKO_LOCAL=1); site-url.test.ts covers the production refusal.
    vi.stubEnv('GINKO_LOCAL', '1')
    await create(s, { name: 'x'.repeat(100), url: 'http://localhost:3000' })
  })

  it('a longest slug (41 characters) works, and the push key made for it is accepted', async () => {
    const s = await setup()
    const slug = `a${'b'.repeat(40)}`
    await create(s, { slug })
    const { key } = await s.as.admin.mutation(api.release.createPushKey, { site: slug, label: 'ci', scopes: ['release'] })
    expect((await s.t.fetch(`/release/state?site=${slug}`, { headers: { Authorization: `Bearer ${key}` } })).status).toBe(200)
  })
})

describe('invites.create input (F14, F18)', () => {
  it('an address that is already in the team is INVALID, with no invite and no mail', async () => {
    const { t, as } = await setup()
    const call = as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'Koch@Example.com', role: 'staff', grants: [] })
    expect(await errorOf(call)).toMatchObject({ code: 'INVALID', message: 'koch@example.com ist schon im Team.' })
    expect(await t.run((ctx) => ctx.db.query('invites').collect())).toHaveLength(0)
    expect(await t.run((ctx) => ctx.db.query('outbox').collect())).toHaveLength(0)
  })

  it('an address over 254 characters is INVALID, and a nasty one is refused quickly', async () => {
    const { as } = await setup()
    const long = `${'a'.repeat(250)}@b.cd`
    expect((await errorOf(as.owner.mutation(api.invites.create, { site: 'restaurant', email: long, role: 'staff', grants: [] }))).code).toBe('INVALID')
    const started = Date.now()
    const nasty = `a@${'.'.repeat(200_000)}@`
    expect((await errorOf(as.owner.mutation(api.invites.create, { site: 'restaurant', email: nasty, role: 'staff', grants: [] }))).code).toBe('INVALID')
    expect(Date.now() - started).toBeLessThan(500)
  })
})
