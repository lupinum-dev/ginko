// Break-it probes of the platform backend: who may call what, and which values the server accepts.
// Each test tries a forbidden action and expects a refusal. A failing test here is a real gap, not a flaky check.
import type { Json } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import type { FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { errorOf, firstPage, opId, publicFunctions, setup } from './setup'

type S = Awaited<ReturnType<typeof setup>>

beforeEach(() => {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
})
afterEach(() => vi.unstubAllEnvs())

/** 'ok' when the call resolved, else the error code (or 'uncoded' for an error without ConvexError data). */
async function outcome(call: Promise<unknown>): Promise<string> {
  try {
    await call
    return 'ok'
  } catch (error) {
    const data = (error as { data?: unknown }).data
    return data && typeof data === 'object' && 'code' in data ? String((data as { code: unknown }).code) : `uncoded: ${String((error as Error).message).slice(0, 120)}`
  }
}
const REFUSED = ['FORBIDDEN', 'NOT_FOUND']

const rows = (s: S, table: 'entries' | 'memberships' | 'invites' | 'changes' | 'proposals' | 'agentKeys' | 'pushKeys' | 'uploads' | 'folders' | 'sites') =>
  s.t.run((ctx) => ctx.db.query(table).collect())

/** The token of the newest invite mail to `email`. */
async function tokenMailedTo(s: S, email: string): Promise<string> {
  const mails = await s.t.run((ctx) => ctx.db.query('outbox').withIndex('by_to', (q) => q.eq('to', email)).collect())
  const link = mails.at(-1)?.text.match(/https:\/\/ginko\.test\/invite\/([A-Za-z0-9_-]+)/)
  if (!link) throw new Error(`no invite mail to ${email}`)
  return link[1]!
}

const as = (s: S, subject: string, email?: string) => s.t.withIdentity({ subject, ...(email ? { email } : {}) })

// ---------------------------------------------------------------------------------------------
// 1. No identity, forged identity
// ---------------------------------------------------------------------------------------------

type Call = { fn: string; kind: 'query' | 'mutation' | 'action'; args: (s: S) => Record<string, unknown> }
const SITE = { site: 'restaurant' }
const publicCalls: Call[] = [
  { fn: 'account.settings', kind: 'query', args: () => ({}) },
  { fn: 'account.setRemindByMail', kind: 'mutation', args: () => ({ on: false }) },
  { fn: 'account.sawLocale', kind: 'mutation', args: () => ({ locale: 'de' }) },
  { fn: 'account.setLocale', kind: 'mutation', args: () => ({ locale: 'de' }) },
  { fn: 'account.setName', kind: 'mutation', args: () => ({ name: 'Anna' }) },
  { fn: 'account.deleteAccount', kind: 'mutation', args: () => ({}) },
  { fn: 'agent.createKey', kind: 'mutation', args: () => ({ ...SITE, label: 'x' }) },
  { fn: 'agent.keys', kind: 'query', args: () => SITE },
  { fn: 'agent.revokeKey', kind: 'mutation', args: () => ({ ...SITE, key: 'x' }) },
  { fn: 'agent.setKeyReview', kind: 'mutation', args: () => ({ ...SITE, key: 'x', review: false }) },
  { fn: 'backup.download', kind: 'query', args: () => SITE },
  { fn: 'changes.list', kind: 'query', args: () => ({ ...SITE, paginationOpts: firstPage }) },
  { fn: 'changes.get', kind: 'query', args: () => ({ ...SITE, change: 'x' }) },
  { fn: 'entries.save', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], baseRev: 1, fields: { price: { amount: 1 } } }) },
  { fn: 'entries.undo', kind: 'mutation', args: () => ({ ...SITE, opId: opId(), change: 'x' }) },
  { fn: 'entries.versionAt', kind: 'query', args: (s) => ({ ...SITE, entry: s.entries['menu-saibling'], change: 'x' }) },
  { fn: 'entries.revert', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], change: 'x' }) },
  { fn: 'entries.create', kind: 'mutation', args: () => ({ ...SITE, opId: opId(), brick: 'notices', data: { text: { de: 'x' } } }) },
  { fn: 'entries.duplicate', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'] }) },
  { fn: 'entries.remove', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], lifeRev: 1 }) },
  { fn: 'entries.restore', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], lifeRev: 1 }) },
  { fn: 'entries.purge', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], lifeRev: 1 }) },
  { fn: 'entries.publish', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], lifeRev: 1 }) },
  { fn: 'entries.unpublish', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-saibling'], lifeRev: 1 }) },
  { fn: 'entries.move', kind: 'mutation', args: (s) => ({ ...SITE, opId: opId(), entry: s.entries['menu-frittaten'], direction: 'up' }) },
  { fn: 'entries.removed', kind: 'query', args: () => ({ ...SITE, brick: 'menu' }) },
  { fn: 'entries.usedBy', kind: 'query', args: (s) => ({ ...SITE, entry: s.entries['menu-saibling'] }) },
  { fn: 'entries.trashOverflow', kind: 'query', args: (s) => ({ ...SITE, entry: s.entries['menu-saibling'] }) },
  { fn: 'entries.trash', kind: 'query', args: () => ({ ...SITE, paginationOpts: firstPage }) },
  { fn: 'entries.whyNotPublic', kind: 'query', args: (s) => ({ ...SITE, entry: s.entries['menu-saibling'] }) },
  { fn: 'entries.list', kind: 'query', args: () => ({ ...SITE, brick: 'menu' }) },
  { fn: 'entries.get', kind: 'query', args: (s) => ({ ...SITE, entry: s.entries['menu-saibling'] }) },
  { fn: 'entries.single', kind: 'query', args: () => ({ ...SITE, brick: 'hours' }) },
  { fn: 'entries.titles', kind: 'query', args: () => ({ ...SITE, brick: 'menu' }) },
  { fn: 'entries.ofBricks', kind: 'query', args: () => ({ ...SITE, bricks: ['menu'] }) },
  { fn: 'files.list', kind: 'query', args: () => ({ ...SITE, view: 'all' }) },
  { fn: 'files.info', kind: 'query', args: () => ({ ...SITE, file: 'x' }) },
  { fn: 'files.counts', kind: 'query', args: () => SITE },
  { fn: 'files.folders', kind: 'query', args: () => SITE },
  { fn: 'files.createFolder', kind: 'mutation', args: () => ({ ...SITE, name: 'x' }) },
  { fn: 'files.renameFolder', kind: 'mutation', args: () => ({ ...SITE, folder: 'x', name: 'y' }) },
  { fn: 'files.moveFolder', kind: 'mutation', args: () => ({ ...SITE, folder: 'x', parent: null }) },
  { fn: 'files.deleteFolder', kind: 'mutation', args: () => ({ ...SITE, folder: 'x' }) },
  { fn: 'files.move', kind: 'mutation', args: () => ({ ...SITE, files: ['x'], folder: null }) },
  { fn: 'files.rename', kind: 'mutation', args: () => ({ ...SITE, file: 'x', name: 'y.pdf' }) },
  { fn: 'files.setFocus', kind: 'mutation', args: () => ({ ...SITE, file: 'x', focus: null }) },
  { fn: 'files.setAlt', kind: 'mutation', args: () => ({ ...SITE, file: 'x', locale: 'de', text: 'x' }) },
  { fn: 'files.keep', kind: 'mutation', args: () => ({ ...SITE, files: ['x'] }) },
  { fn: 'files.trash', kind: 'mutation', args: () => ({ ...SITE, files: ['x'] }) },
  { fn: 'files.restore', kind: 'mutation', args: () => ({ ...SITE, files: ['x'] }) },
  { fn: 'files.replace', kind: 'mutation', args: () => ({ ...SITE, file: 'x', upload: 'y' }) },
  { fn: 'invites.create', kind: 'mutation', args: () => ({ ...SITE, email: 'a@example.com', role: 'staff', grants: [] }) },
  { fn: 'invites.accept', kind: 'mutation', args: () => ({ token: 'x' }) },
  { fn: 'invites.mine', kind: 'query', args: () => ({}) },
  { fn: 'invites.acceptMine', kind: 'mutation', args: () => ({ invite: 'x' }) },
  { fn: 'invites.revoke', kind: 'mutation', args: () => ({ ...SITE, invite: 'x' }) },
  { fn: 'members.list', kind: 'query', args: () => SITE },
  { fn: 'members.setGrants', kind: 'mutation', args: () => ({ ...SITE, member: 'x', grants: [] }) },
  { fn: 'members.remove', kind: 'mutation', args: () => ({ ...SITE, member: 'x' }) },
  { fn: 'proposals.approve', kind: 'mutation', args: () => ({ proposal: 'x' }) },
  { fn: 'proposals.reject', kind: 'mutation', args: () => ({ proposal: 'x', reason: 'x' }) },
  { fn: 'proposals.withdraw', kind: 'mutation', args: () => ({ proposal: 'x' }) },
  { fn: 'proposals.list', kind: 'query', args: () => ({ ...SITE, paginationOpts: firstPage }) },
  { fn: 'proposals.mine', kind: 'query', args: () => SITE },
  { fn: 'proposals.ownFor', kind: 'query', args: (s) => ({ ...SITE, entry: s.entries['menu-saibling'] }) },
  { fn: 'proposals.count', kind: 'query', args: () => SITE },
  { fn: 'proposals.get', kind: 'query', args: () => ({ ...SITE, proposal: 'x' }) },
  { fn: 'proposals.releases', kind: 'query', args: () => SITE },
  { fn: 'proposals.createRelease', kind: 'mutation', args: () => ({ ...SITE, name: 'x' }) },
  { fn: 'proposals.addToRelease', kind: 'mutation', args: () => ({ release: 'x', proposal: 'y' }) },
  { fn: 'proposals.removeFromRelease', kind: 'mutation', args: () => ({ release: 'x', proposal: 'y' }) },
  { fn: 'proposals.approveRelease', kind: 'mutation', args: () => ({ release: 'x' }) },
  { fn: 'release.createPushKey', kind: 'mutation', args: () => ({ ...SITE, label: 'x', scopes: ['release'] }) },
  { fn: 'release.revokePushKey', kind: 'mutation', args: () => ({ ...SITE, key: 'x' }) },
  { fn: 'search.studio', kind: 'query', args: () => ({ ...SITE, query: 'Saibling' }) },
  { fn: 'sites.mine', kind: 'query', args: () => ({}) },
  { fn: 'sites.deletion', kind: 'query', args: () => SITE },
  { fn: 'sites.startDeletion', kind: 'mutation', args: () => ({ ...SITE, confirm: 'restaurant' }) },
  { fn: 'sites.cancelDeletion', kind: 'mutation', args: () => SITE },
  { fn: 'sites.meta', kind: 'query', args: () => SITE },
  { fn: 'sites.setAgentReview', kind: 'mutation', args: () => ({ ...SITE, review: false }) },
  { fn: 'sites.create', kind: 'mutation', args: () => ({ slug: 'neu-seite', name: 'Neu', url: 'https://example.com' }) },
  { fn: 'sites.translationStatus', kind: 'query', args: () => SITE },
  { fn: 'tasks.prefill', kind: 'query', args: () => ({ ...SITE, task: 'menu.edit' }) },
  { fn: 'uploads.prepare', kind: 'mutation', args: () => SITE },
  { fn: 'uploads.get', kind: 'query', args: () => ({ ...SITE, upload: 'x' }) },
  { fn: 'uploads.urls', kind: 'query', args: () => ({ ...SITE, ids: [] }) },
  { fn: 'views.save', kind: 'mutation', args: () => ({ ...SITE, brick: 'menu', name: 'x', query: {} }) },
  { fn: 'views.remove', kind: 'mutation', args: () => ({ ...SITE, id: 'x' }) },
  { fn: 'views.list', kind: 'query', args: () => ({ ...SITE, brick: 'menu' }) },
  { fn: 'refresh.urgentRefresh', kind: 'action', args: () => ({ ...SITE, opId: opId() }) },
]

function ref(fn: string) {
  const [mod, name] = fn.split('.') as [keyof typeof api, string]
  return (api[mod] as unknown as Record<string, FunctionReference<'query' | 'mutation' | 'action'>>)[name]!
}
async function run(client: S['t'], c: Call, s: S) {
  const r = ref(c.fn)
  return c.kind === 'query' ? client.query(r, c.args(s)) : c.kind === 'mutation' ? client.mutation(r, c.args(s)) : client.action(r, c.args(s))
}

describe('1. no identity and forged identity', () => {
  it('every public query, mutation and action refuses a caller without identity, changing nothing', async () => {
    const s = await setup()
    const before = JSON.stringify([await rows(s, 'entries'), await rows(s, 'memberships'), await rows(s, 'invites'), await rows(s, 'sites')])
    const open: string[] = []
    for (const c of publicCalls) if ((await outcome(run(s.t, c, s))) === 'ok') open.push(c.fn)
    expect(open).toEqual([])
    expect(JSON.stringify([await rows(s, 'entries'), await rows(s, 'memberships'), await rows(s, 'invites'), await rows(s, 'sites')])).toBe(before)
  })

  // The list above purges a live entry, which fails anyway; here the entry really is removed, so only access stops it.
  it('entries.purge refuses a caller without identity, and the removed entry stays', async () => {
    const s = await setup()
    const entry = s.entries['menu-saibling']!
    await s.as.owner.mutation(api.entries.remove, { ...SITE, opId: opId(), entry, lifeRev: 1 })
    expect(await outcome(s.t.mutation(api.entries.purge, { ...SITE, opId: opId(), entry, lifeRev: 2 }))).toBe('FORBIDDEN')
    expect(await s.t.run((ctx) => ctx.db.get(entry))).toMatchObject({ lifeRev: 2 })
  })

  // Wrong behaviour caught: a new public function ships without a no-identity probe, because nobody added it to the list.
  it('the list names every public query, mutation and action, or says why it answers without identity', async () => {
    const open: Record<string, string> = {
      'mail.signInAvailable': 'the sign-in page asks it before anyone is signed in; it says only whether mail is set up',
      'invites.peek': 'the invite page asks it before the invitee is signed in; only the holder of the unguessable link gets an answer',
    }
    expect([...new Set([...publicCalls.map((c) => c.fn), ...Object.keys(open)])].sort()).toEqual(await publicFunctions())
  })

  it('an identity with a made-up session id gets no access (owner subject, session that does not exist)', async () => {
    const s = await setup()
    const forged = s.t.withIdentity({ subject: 'u-wirtin', sid: 'does-not-exist', email: 'wirtin@example.com' })
    const open: string[] = []
    for (const c of publicCalls) if ((await outcome(run(forged, c, s))) === 'ok') open.push(c.fn)
    expect(open).toEqual([])
  })

  it("an identity that names the owner but carries the cook's live session id gets no access as the owner", async () => {
    // The session row belongs to u-koch. A token whose subject disagrees with its session must not act as either.
    const s = await setup()
    const mixed = s.t.withIdentity({ subject: 'u-wirtin', sid: 's-u-koch', email: 'wirtin@example.com' })
    expect(await outcome(mixed.query(api.members.list, { site: 'restaurant' }))).not.toBe('ok')
  })

  it('an identity with a subject that has no account is refused even when the session id is real', async () => {
    const s = await setup()
    const ghost = s.t.withIdentity({ subject: 'u-ghost', sid: 's-u-wirtin', email: 'wirtin@example.com' })
    expect(await outcome(ghost.query(api.sites.meta, SITE))).not.toBe('ok')
  })

  it('a signed-in person who is no member of any site sees no site and no account data of others', async () => {
    const s = await setup()
    const nobody = as(s, 'u-neu', 'neu@example.com')
    expect(await nobody.query(api.sites.mine, {})).toEqual([])
    expect(await outcome(nobody.query(api.sites.meta, SITE))).toBe('FORBIDDEN')
    expect(await outcome(nobody.query(api.sites.meta, { site: 'does-not-exist' }))).toBe('FORBIDDEN')
  })
})

// ---------------------------------------------------------------------------------------------
// MCP helpers (the agent door)
// ---------------------------------------------------------------------------------------------

type ToolAnswer = { content: { type: 'text'; text: string }[]; isError: boolean }
let rpcId = 0
async function rpc(s: S, key: string, method: string, params?: Record<string, unknown>) {
  const response = await s.t.fetch('/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
  })
  return { status: response.status, body: (await response.json()) as { result?: any; error?: { message: string } } }
}
async function call(s: S, key: string, name: string, args: Record<string, unknown> = {}) {
  const answer = (await rpc(s, key, 'tools/call', { name, arguments: args })).body.result as ToolAnswer
  const data = answer.content[1] ? JSON.parse(answer.content[1].text) : undefined
  return { text: answer.content[0]!.text, data, isError: answer.isError }
}
const keyOf = async (s: S, person: 'owner' | 'cook' | 'stranger', site = 'restaurant') => (await s.as[person].mutation(api.agent.createKey, { site, label: 'Claude Code' })).key

/** Every menu task needs approval, so a cook's save becomes a proposal. */
async function needApproval(s: S, brick = 'menu') {
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    for (const task of schema.bricks[brick]!.tasks ?? []) (task as { needsApproval?: boolean }).needsApproval = true
    await ctx.db.patch(s.site, { schema })
  })
}
async function enableDrafts(s: S, bricks = ['events', 'notices']) {
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    for (const key of bricks) (schema.bricks[key] as { drafts?: boolean }).drafts = true
    await ctx.db.patch(s.site, { schema })
  })
}
const saibling = (s: S) => s.entries['menu-saibling']!
const saveMenu = (s: S, who: keyof S['as'], over: Record<string, unknown>) =>
  s.as[who].mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: saibling(s), baseRev: 1, fields: { price: { amount: 1450 } }, ...over } as never)

// ---------------------------------------------------------------------------------------------
// 2. Staff outside their grants
// ---------------------------------------------------------------------------------------------

describe('2. staff (the cook) outside the grants', () => {
  it.each([
    ['price task writing the name', { task: 'menu.price', fields: { name: { de: 'Gehackt' } } }],
    ['price task writing price and name together', { task: 'menu.price', fields: { price: { amount: 1 }, name: { de: 'Gehackt' } } }],
    ['no task at all', { task: undefined }],
    ['a task of another brick (lunch.lunchWeek) on a menu entry', { task: 'lunch.lunchWeek' }],
    ['a create task used to edit', { task: 'menu.add' }],
    ['a remove task used to edit', { task: 'menu.remove' }],
    ['a task that does not exist', { task: 'menu.superuser' }],
    ['a task ref with an extra segment', { task: 'menu.price.x' }],
    ['an empty task', { task: '' }],
    // "Preis ab …" became part of "Preis ändern"; an old tab or agent that still sends it is refused.
    ['a task that was merged away (menu.priceFrom)', { task: 'menu.priceFrom', fields: { nextPrice: { amount: 2000 } } }],
  ])('entries.save refuses %s', async (_label, over) => {
    const s = await setup()
    const code = await outcome(saveMenu(s, 'cook', { task: 'menu.price', ...over }))
    expect(code).toBe('FORBIDDEN')
    expect((await rows(s, 'changes')).length).toBe(0)
  })

  it('entries.save refuses a granted task of another brick on a notice entry', async () => {
    const s = await setup()
    const notice = s.entries['notice-ausgebucht']!
    const code = await outcome(s.as.cook.mutation(api.entries.save, { site: 'restaurant', opId: opId(), task: 'menu.edit', entry: notice, baseRev: 1, fields: { text: { de: 'x' } } }))
    expect(code).toBe('FORBIDDEN')
  })

  it('entries.create / duplicate / remove / restore / move refuse a cook without the matching task', async () => {
    const s = await setup()
    const notice = s.entries['notice-ausgebucht']!
    const results = {
      createNotice: await outcome(s.as.cook.mutation(api.entries.create, { site: 'restaurant', opId: opId(), task: 'menu.add', brick: 'notices', data: { text: { de: 'x' } } })),
      createNoTask: await outcome(s.as.cook.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'menu', data: { category: 'starters', name: { de: 'x' }, price: { amount: 1 }, allergens: [], veg: 'none' } })),
      duplicateNotice: await outcome(s.as.cook.mutation(api.entries.duplicate, { site: 'restaurant', opId: opId(), task: 'menu.add', entry: notice })),
      removeNotice: await outcome(s.as.cook.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), task: 'menu.remove', entry: notice, lifeRev: 1 })),
      removeWithEditTask: await outcome(s.as.cook.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), task: 'menu.edit', entry: saibling(s), lifeRev: 1 })),
      reorder: await outcome(s.as.cook.mutation(api.entries.move, { site: 'restaurant', opId: opId(), entry: s.entries['menu-frittaten']!, direction: 'up' })),
    }
    expect(results).toEqual({ createNotice: 'FORBIDDEN', createNoTask: 'FORBIDDEN', duplicateNotice: 'FORBIDDEN', removeNotice: 'FORBIDDEN', removeWithEditTask: 'FORBIDDEN', reorder: 'FORBIDDEN' })
    expect((await rows(s, 'entries')).filter((e) => !e.deletedAt).length).toBe(Object.keys(s.entries).length)
  })

  it('entries.restore refuses a cook without the remove task of the brick', async () => {
    const s = await setup()
    const notice = s.entries['notice-ausgebucht']!
    await s.as.owner.mutation(api.entries.remove, { site: 'restaurant', opId: opId(), entry: notice, lifeRev: 1 })
    expect(await outcome(s.as.cook.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), task: 'menu.remove', entry: notice, lifeRev: 2 }))).toBe('FORBIDDEN')
    expect(await outcome(s.as.cook.mutation(api.entries.restore, { site: 'restaurant', opId: opId(), entry: notice, lifeRev: 2 }))).toBe('FORBIDDEN')
  })

  it('publish and unpublish refuse a cook with no create/edit task of the brick, also with only a remove task', async () => {
    const s = await setup()
    await enableDrafts(s)
    const draft = (await s.as.owner.mutation(api.entries.create, { site: 'restaurant', opId: opId(), brick: 'events', data: { title: { de: 'Fest' }, when: { from: '2026-12-01', to: '2026-12-01' }, description: { de: 'x' } } })) as { entry: string; state: string }
    expect(draft.state).toBe('draft')
    const call1 = (task?: string) => outcome(s.as.cook.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), ...(task ? { task } : {}), entry: draft.entry, lifeRev: 1 }))
    expect(await call1()).toBe('FORBIDDEN')
    expect(await call1('events.add')).toBe('FORBIDDEN')
    // The cook gets only the remove task of events: still no right to publish.
    await s.t.run(async (ctx) => {
      const m = (await ctx.db.query('memberships').collect()).find((x) => x.user === 'u-koch')!
      await ctx.db.patch(m._id, { grants: [...m.grants, 'events.remove'] })
    })
    expect(await call1('events.remove')).toBe('FORBIDDEN')
    expect(await call1()).toBe('FORBIDDEN')
    // A published event cannot be taken off by the same cook either.
    await s.as.owner.mutation(api.entries.publish, { site: 'restaurant', opId: opId(), entry: draft.entry, lifeRev: 1 })
    expect(await outcome(s.as.cook.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), task: 'events.remove', entry: draft.entry, lifeRev: 2 }))).toBe('FORBIDDEN')
    expect(((await s.t.run((ctx) => ctx.db.get(draft.entry as Id<'entries'>)))!).state).toBe('live')
  })

  it('a cook cannot change the team, the keys or the site settings', async () => {
    const s = await setup()
    const member = (await rows(s, 'memberships')).find((m) => m.user === 'u-koch')!
    const owner = (await rows(s, 'memberships')).find((m) => m.user === 'u-wirtin')!
    const attempts = {
      invite: await outcome(s.as.cook.mutation(api.invites.create, { ...SITE, email: 'x@example.com', role: 'staff', grants: [] })),
      inviteOwner: await outcome(s.as.cook.mutation(api.invites.create, { ...SITE, email: 'x@example.com', role: 'owner', grants: [] })),
      list: await outcome(s.as.cook.query(api.members.list, SITE)),
      grantSelf: await outcome(s.as.cook.mutation(api.members.setGrants, { ...SITE, member: member._id, grants: ['notices.add', 'menu.edit'] })),
      removeOwner: await outcome(s.as.cook.mutation(api.members.remove, { ...SITE, member: owner._id })),
      pushKey: await outcome(s.as.cook.mutation(api.release.createPushKey, { ...SITE, label: 'x', scopes: ['release'] })),
      siteReview: await outcome(s.as.cook.mutation(api.sites.setAgentReview, { ...SITE, review: false })),
      deleteSite: await outcome(s.as.cook.mutation(api.sites.startDeletion, { ...SITE, confirm: 'restaurant' })),
      createSite: await outcome(s.as.cook.mutation(api.sites.create, { slug: 'meins', name: 'Meins', url: 'https://example.com' })),
      release: await outcome(s.as.cook.mutation(api.proposals.createRelease, { ...SITE, name: 'x' })),
      releases: await outcome(s.as.cook.query(api.proposals.releases, SITE)),
      folder: await outcome(s.as.cook.mutation(api.files.createFolder, { ...SITE, name: 'x' })),
      refresh: await outcome(s.t.withIdentity({ subject: 'u-koch', email: 'koch@example.com' }).action(api.refresh.urgentRefresh, { ...SITE, opId: opId() })),
    }
    expect(attempts).toEqual(Object.fromEntries(Object.keys(attempts).map((k) => [k, 'FORBIDDEN'])))
    const after = (await rows(s, 'memberships')).find((m) => m.user === 'u-koch')!
    expect(after.grants).toEqual(member.grants)
    expect(after.role).toBe('staff')
    expect(await rows(s, 'invites')).toHaveLength(0)
  })

  it('a cook cannot decide proposals (approve, reject, add to a release), not even their own', async () => {
    const s = await setup()
    await needApproval(s)
    const proposal = (await saveMenu(s, 'cook', { task: 'menu.price' })) as { proposal: string }
    expect(proposal.proposal).toBeTruthy()
    const attempts = [
      await outcome(s.as.cook.mutation(api.proposals.approve, { proposal: proposal.proposal })),
      await outcome(s.as.cook.mutation(api.proposals.reject, { proposal: proposal.proposal, reason: 'ok' })),
    ]
    expect(attempts).toEqual(['FORBIDDEN', 'FORBIDDEN'])
    expect((await rows(s, 'proposals'))[0]!.status).toBe('open')
    expect((await s.t.run((ctx) => ctx.db.get(saibling(s))))!.data.price).toEqual({ amount: 1350 })
  })

  it('a cook sees only their own proposals and cannot withdraw those of others', async () => {
    const s = await setup()
    await needApproval(s)
    // The owner's agent proposes a price change: the author is the owner.
    const key = await keyOf(s, 'owner')
    const proposed = await call(s, key, 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 20, propose: true })
    expect(proposed.isError).toBe(false)
    const id = (await rows(s, 'proposals'))[0]!._id
    expect(await outcome(s.as.cook.query(api.proposals.get, { ...SITE, proposal: id }))).toBe('NOT_FOUND')
    expect(await outcome(s.as.cook.mutation(api.proposals.withdraw, { proposal: id }))).toBe('FORBIDDEN')
    expect((await s.as.cook.query(api.proposals.list, { ...SITE, paginationOpts: firstPage })).page).toEqual([])
  })

  it('staff cannot take review off their own agent key, only owners and admins can', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.sites.setAgentReview, { ...SITE, review: true })
    const own = await s.as.cook.mutation(api.agent.createKey, { ...SITE, label: 'mine' })
    expect(await outcome(s.as.cook.mutation(api.agent.setKeyReview, { ...SITE, key: own.id, review: false }))).toBe('FORBIDDEN')
    expect(await outcome(s.as.cook.mutation(api.agent.setKeyReview, { ...SITE, key: own.id, review: null }))).toBe('FORBIDDEN')
    const ownerKey = await s.as.owner.mutation(api.agent.createKey, { ...SITE, label: 'wirtin' })
    expect(await outcome(s.as.cook.mutation(api.agent.revokeKey, { ...SITE, key: ownerKey.id }))).toBe('NOT_FOUND')
    expect(await outcome(s.as.cook.mutation(api.agent.setKeyReview, { ...SITE, key: ownerKey.id, review: true }))).toBe('NOT_FOUND')
    const view = await s.as.cook.query(api.agent.keys, SITE)
    expect(view.map((k) => [k.label, k.reviewEffective])).toEqual([['mine', true]])
  })

  it("the cook's agent key offers and runs only the cook's tasks", async () => {
    const s = await setup()
    const key = await keyOf(s, 'cook')
    const names = ((await rpc(s, key, 'tools/list')).body.result.tools as { name: string }[]).map((t) => t.name)
    expect(names).toContain('task_menu_price')
    expect(names.filter((n) => n.startsWith('task_') && !/^task_(menu_(edit|price|add|remove)|lunch_lunchWeek)$/.test(n))).toEqual([])
    const forbidden = await call(s, key, 'task_notices_add', { text: 'Hallo' })
    expect(forbidden.isError).toBe(true)
    const notOffered = await call(s, key, 'task_menu_priceFrom', { entry: saibling(s), nextPrice: 5 })
    expect(notOffered.isError).toBe(true)
    // An owner-only change of a brick the cook has no task for cannot be undone with the cook's key.
    await s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: s.entries['contact']!, baseRev: 1, fields: { city: 'Wien' } })
    const change = (await rows(s, 'changes')).at(-1)!._id
    expect((await call(s, key, 'ginko_undo', { change })).isError).toBe(true)
    expect((await s.t.run((ctx) => ctx.db.get(s.entries['contact']!)))!.data.city).toBe('Wien')
  })

  it('a cook whose task needs approval cannot undo or restore past the approval', async () => {
    const s = await setup()
    await needApproval(s)
    const proposal = (await saveMenu(s, 'cook', { task: 'menu.price' })) as { proposal: string }
    const approved = (await s.as.owner.mutation(api.proposals.approve, { proposal: proposal.proposal })) as { change: string }
    expect(approved.change).toBeTruthy()
    expect(await outcome(s.as.cook.mutation(api.entries.undo, { ...SITE, opId: opId(), task: 'menu.price', change: approved.change }))).toBe('FORBIDDEN')
    expect((await s.t.run((ctx) => ctx.db.get(saibling(s))))!.data.price).toEqual({ amount: 1450 })
    await s.as.owner.mutation(api.entries.remove, { ...SITE, opId: opId(), entry: saibling(s), lifeRev: 1 })
    expect(await outcome(s.as.cook.mutation(api.entries.restore, { ...SITE, opId: opId(), task: 'menu.remove', entry: saibling(s), lifeRev: 2 }))).toBe('FORBIDDEN')
  })
})

describe('2b. positive control: the probes above can tell allowed from refused', () => {
  it('the cook may change a price with the price task and the owner may do anything', async () => {
    const s = await setup()
    expect(await outcome(saveMenu(s, 'cook', { task: 'menu.price' }))).toBe('ok')
    expect(await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: saibling(s), baseRev: 2, fields: { name: { de: 'Saibling neu' } } }))).toBe('ok')
  })
})

// ---------------------------------------------------------------------------------------------
// 3. An owner of site B (the stranger) against site A (restaurant)
// ---------------------------------------------------------------------------------------------

async function fixtures(s: S) {
  const entry = saibling(s)
  const save = (await s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: s.entries['menu-frittaten'], baseRev: 1, fields: { price: { amount: 1111 } } })) as { change: string }
  const folder = await s.as.owner.mutation(api.files.createFolder, { ...SITE, name: 'GEHEIM-ORDNER' })
  const ticket = (await s.as.owner.mutation(api.uploads.prepare, SITE)).ticket
  const upload = await s.t.fetch(`/upload?ticket=${ticket}&name=karte.pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 geheim' })
  const file = ((await upload.json()) as { upload: string }).upload
  await s.t.run((ctx) => ctx.db.patch(file as Id<'uploads'>, { status: 'ready', processedId: undefined }))
  const member = (await rows(s, 'memberships')).find((m) => m.user === 'u-koch')!._id
  await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'geheim@example.com', role: 'staff', grants: [] })
  const invite = (await rows(s, 'invites'))[0]!._id
  const pushKey = await s.as.owner.mutation(api.release.createPushKey, { ...SITE, label: 'ci', scopes: ['release', 'export', 'pull', 'check'] })
  const agentKey = await s.as.owner.mutation(api.agent.createKey, { ...SITE, label: 'ownerkey' })
  const view = (await s.as.owner.mutation(api.views.save, { ...SITE, brick: 'menu', name: 'GEHEIM-VIEW', query: {} })) as { id: string }
  return { entry, change: save.change, folder: folder as string, file, member: member as string, invite: invite as string, pushKey, agentKey, view: view.id }
}
type Fx = Awaited<ReturnType<typeof fixtures>>
type CrossCall = { fn: string; kind: 'query' | 'mutation'; args: (site: string, f: Fx) => Record<string, unknown> }
const o = () => opId()
const cross: CrossCall[] = [
  { fn: 'sites.meta', kind: 'query', args: (site) => ({ site }) },
  { fn: 'entries.list', kind: 'query', args: (site) => ({ site, brick: 'menu', search: 'Saibling' }) },
  { fn: 'entries.get', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.single', kind: 'query', args: (site) => ({ site, brick: 'hours' }) },
  { fn: 'entries.titles', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  { fn: 'entries.ofBricks', kind: 'query', args: (site) => ({ site, bricks: ['menu', 'hours'] }) },
  { fn: 'search.studio', kind: 'query', args: (site) => ({ site, query: 'Saibling' }) },
  { fn: 'changes.list', kind: 'query', args: (site, f) => ({ site, paginationOpts: firstPage, entry: f.entry }) },
  { fn: 'changes.list', kind: 'query', args: (site) => ({ site, paginationOpts: firstPage, by: 'me' }) },
  { fn: 'changes.get', kind: 'query', args: (site, f) => ({ site, change: f.change }) },
  { fn: 'entries.versionAt', kind: 'query', args: (site, f) => ({ site, entry: f.entry, change: f.change }) },
  { fn: 'entries.revert', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, change: f.change }) },
  { fn: 'entries.save', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, baseRev: 1, fields: { price: { amount: 1 } } }) },
  { fn: 'entries.undo', kind: 'mutation', args: (site, f) => ({ site, opId: o(), change: f.change }) },
  { fn: 'entries.remove', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.purge', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.duplicate', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry }) },
  { fn: 'entries.publish', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, lifeRev: 1 }) },
  { fn: 'entries.move', kind: 'mutation', args: (site, f) => ({ site, opId: o(), entry: f.entry, direction: 'down' }) },
  { fn: 'entries.whyNotPublic', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.removed', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  { fn: 'entries.usedBy', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.trashOverflow', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'entries.trash', kind: 'query', args: (site) => ({ site, paginationOpts: firstPage }) },
  { fn: 'tasks.prefill', kind: 'query', args: (site, f) => ({ site, task: 'menu.edit', entry: f.entry }) },
  { fn: 'files.list', kind: 'query', args: (site, f) => ({ site, view: 'all', folder: f.folder }) },
  { fn: 'files.list', kind: 'query', args: (site) => ({ site, view: 'all' }) },
  { fn: 'files.info', kind: 'query', args: (site, f) => ({ site, file: f.file }) },
  { fn: 'files.counts', kind: 'query', args: (site) => ({ site }) },
  { fn: 'files.folders', kind: 'query', args: (site) => ({ site }) },
  { fn: 'files.createFolder', kind: 'mutation', args: (site, f) => ({ site, name: 'x', parent: f.folder }) },
  { fn: 'files.renameFolder', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder, name: 'pwned' }) },
  { fn: 'files.deleteFolder', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder }) },
  { fn: 'files.move', kind: 'mutation', args: (site, f) => ({ site, files: [f.file], folder: f.folder }) },
  { fn: 'files.rename', kind: 'mutation', args: (site, f) => ({ site, file: f.file, name: 'pwned.pdf' }) },
  { fn: 'files.setAlt', kind: 'mutation', args: (site, f) => ({ site, file: f.file, locale: 'de', text: 'pwned' }) },
  { fn: 'files.trash', kind: 'mutation', args: (site, f) => ({ site, files: [f.file] }) },
  { fn: 'files.replace', kind: 'mutation', args: (site, f) => ({ site, file: f.file, upload: f.file }) },
  { fn: 'uploads.prepare', kind: 'mutation', args: (site, f) => ({ site, folder: f.folder }) },
  { fn: 'uploads.get', kind: 'query', args: (site, f) => ({ site, upload: f.file }) },
  { fn: 'members.list', kind: 'query', args: (site) => ({ site }) },
  { fn: 'members.setGrants', kind: 'mutation', args: (site, f) => ({ site, member: f.member, grants: [] }) },
  { fn: 'members.remove', kind: 'mutation', args: (site, f) => ({ site, member: f.member }) },
  { fn: 'invites.revoke', kind: 'mutation', args: (site, f) => ({ site, invite: f.invite }) },
  { fn: 'agent.keys', kind: 'query', args: (site) => ({ site }) },
  { fn: 'agent.revokeKey', kind: 'mutation', args: (site, f) => ({ site, key: f.agentKey.id }) },
  { fn: 'agent.setKeyReview', kind: 'mutation', args: (site, f) => ({ site, key: f.agentKey.id, review: false }) },
  { fn: 'release.revokePushKey', kind: 'mutation', args: (site, f) => ({ site, key: f.pushKey.id }) },
  { fn: 'views.list', kind: 'query', args: (site) => ({ site, brick: 'menu' }) },
  { fn: 'views.save', kind: 'mutation', args: (site, f) => ({ site, id: f.view, brick: 'menu', name: 'pwned', query: {} }) },
  { fn: 'views.remove', kind: 'mutation', args: (site, f) => ({ site, id: f.view }) },
  { fn: 'proposals.list', kind: 'query', args: (site) => ({ site, paginationOpts: firstPage }) },
  { fn: 'proposals.mine', kind: 'query', args: (site) => ({ site }) },
  { fn: 'proposals.ownFor', kind: 'query', args: (site, f) => ({ site, entry: f.entry }) },
  { fn: 'proposals.releases', kind: 'query', args: (site) => ({ site }) },
  { fn: 'sites.translationStatus', kind: 'query', args: (site) => ({ site }) },
]
const SECRETS = ['GEHEIM', 'Saibling', 'Frittaten', 'koch@example.com', 'wirtin@example.com', 'geheim@example.com']

describe('3. owner of site B against site A', () => {
  it('every call naming site A is refused, and nothing of A changes', async () => {
    const s = await setup()
    const f = await fixtures(s)
    const snap = async () => JSON.stringify([await rows(s, 'entries'), await rows(s, 'memberships'), await rows(s, 'invites'), await rows(s, 'agentKeys'), await rows(s, 'pushKeys'), await rows(s, 'folders'), await rows(s, 'uploads'), await rows(s, 'changes')])
    const before = await snap()
    const notRefused: string[] = []
    for (const c of cross) {
      const r = ref(c.fn)
      const args = c.args('restaurant', f)
      const result = await outcome(c.kind === 'query' ? s.as.stranger.query(r, args) : s.as.stranger.mutation(r, args))
      if (!REFUSED.includes(result)) notRefused.push(`${c.fn}: ${result}`)
    }
    expect(notRefused).toEqual([])
    expect(await snap()).toBe(before)
  })

  it("calls naming B's own site but carrying A's ids leak nothing and change nothing of A", async () => {
    const s = await setup()
    const f = await fixtures(s)
    const snap = async () => JSON.stringify([await rows(s, 'entries'), await rows(s, 'memberships'), await rows(s, 'invites'), await rows(s, 'agentKeys'), await rows(s, 'pushKeys'), await rows(s, 'folders'), await rows(s, 'uploads'), await rows(s, 'changes')])
    const before = await snap()
    const leaks: string[] = []
    const accepted: string[] = []
    for (const c of cross) {
      const r = ref(c.fn)
      const args = c.args('andere', f)
      try {
        const result = c.kind === 'query' ? await s.as.stranger.query(r, args) : await s.as.stranger.mutation(r, args)
        // Only B's own empty data may come back: not A's strings or ids.
        const text = JSON.stringify(result)
        const hit = [...SECRETS, f.entry, f.file, f.folder, f.change, f.member].filter((x) => text.includes(x))
        if (hit.length) leaks.push(`${c.fn}: ${hit.join(',')}`)
        if (c.kind === 'mutation') accepted.push(c.fn)
      } catch { /* refused */ }
    }
    expect(leaks).toEqual([])
    // A write that takes A's id and succeeds on B's site would mean the id was not checked against the site.
    expect(accepted.filter((fn) => !['uploads.prepare', 'files.createFolder'].includes(fn))).toEqual([])
    expect(accepted).toEqual([])
    expect(await snap()).toBe(before)
  })

  it("B's owner cannot reach A through HTTP: export, release state, release, bundle of a deleted site", async () => {
    const s = await setup()
    const own = (await s.as.stranger.mutation(api.release.createPushKey, { site: 'andere', label: 'ci', scopes: ['release', 'export', 'pull', 'check'] })).key
    const auth = { authorization: `Bearer ${own}` }
    const status = async (p: string, init: RequestInit = {}) => (await s.t.fetch(p, { ...init, headers: { ...auth, ...(init.headers ?? {}) } })).status
    expect(await status('/export?site=restaurant')).toBe(403)
    expect(await status('/release/state?site=restaurant')).toBe(403)
    expect(await status('/export')).toBe(400)
    const site = (await s.t.run((ctx) => ctx.db.get(s.site)))!
    const body = { site: 'restaurant', commit: 'abc1234', expectedSchemaRev: 1, expectedContentRev: 1, schema: site.schema, writes: [] }
    expect(await status('/release', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })).toBe(403)
    // A release without a site name goes to B (the key's site) and must refuse A's schema.
    const { site: _drop, ...noSite } = body
    expect(await status('/release', { method: 'POST', body: JSON.stringify(noSite), headers: { 'content-type': 'application/json' } })).toBe(400)
    expect((await rows(s, 'sites')).find((x) => x._id === s.site)!.schemaRev).toBe(1)
    // A write naming an entry of A through B's key is not found.
    // The seeded site B carries the restaurant's config; give it its own name so the release reaches the write check.
    const other = await s.t.run(async (ctx) => { const row = (await ctx.db.get(s.other))!; await ctx.db.patch(s.other, { schema: { ...(row.schema as object), site: 'andere' } }); return (await ctx.db.get(s.other))! })
    const writeA = { commit: 'abc9999', expectedSchemaRev: 1, expectedContentRev: 1, schema: other.schema, writes: [{ entry: saibling(s), fields: { x: 1 } }] }
    expect(await status('/release', { method: 'POST', body: JSON.stringify(writeA), headers: { 'content-type': 'application/json' } })).toBe(404)
  })

  it('an agent key of B cannot be used against A: tools see only B, and A ids are not found', async () => {
    const s = await setup()
    const key = await keyOf(s, 'stranger', 'andere')
    const overview = await call(s, key, 'ginko_overview')
    expect(overview.data.site).toBe('andere')
    for (const [tool, args] of [
      ['ginko_version_at', { entry: saibling(s), change: 'x' }],
      ['ginko_file_usage', { file: saibling(s) }],
      ['ginko_undo', { change: 'x' }],
    ] as const) expect((await call(s, key, tool, args)).isError).toBe(true)
    const search = await call(s, key, 'ginko_search', { query: 'Saibling' })
    expect(search.data).toEqual([])
    expect(JSON.stringify(await call(s, key, 'ginko_history', { limit: 50 }))).not.toContain('Gasthaus')
  })
})

// ---------------------------------------------------------------------------------------------
// 4. Invitations and the last owner
// ---------------------------------------------------------------------------------------------

const memberOfUser = async (s: S, user: string) => (await rows(s, 'memberships')).find((m) => m.user === user && m.site === s.site)

describe('4a. invitations', () => {
  it('an invite meant for another address is refused and stays open', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: [] })
    const token = await tokenMailedTo(s, 'neu@example.com')
    const wrong = as(s, 'u-anders', 'anders@example.com')
    expect(await outcome(wrong.mutation(api.invites.accept, { token }))).toBe('FORBIDDEN')
    expect(await memberOfUser(s, 'u-anders')).toBeUndefined()
    // peek tells a wrong person only that it is not for them, and never the invited address.
    const seen = await wrong.query(api.invites.peek, { token })
    expect(seen).toMatchObject({ forYou: false })
    expect(JSON.stringify(seen)).not.toContain('neu@example.com')
    expect((await rows(s, 'invites'))[0]!.acceptedAt).toBeUndefined()
  })

  it("an e-mail claim in the token cannot stand in for the account's own address (live user row decides)", async () => {
    // u-anders signed in with anders@example.com. A token that claims neu@example.com must not accept neu's invite.
    const s = await setup()
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: [] })
    const token = await tokenMailedTo(s, 'neu@example.com')
    const claimed = s.t.withIdentity({ subject: 'u-anders', email: 'neu@example.com' })
    expect(await outcome(claimed.mutation(api.invites.accept, { token }))).toBe('FORBIDDEN')
    expect(await memberOfUser(s, 'u-anders')).toBeUndefined()
  })

  it('an accepted invite cannot be used again, also not after the member was removed', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const token = await tokenMailedTo(s, 'neu@example.com')
    const neu = as(s, 'u-neu', 'neu@example.com')
    expect(await neu.mutation(api.invites.accept, { token })).toMatchObject({ already: false })
    const m = await memberOfUser(s, 'u-neu')
    expect(m).toMatchObject({ role: 'staff', grants: ['menu.price'] })
    await s.as.owner.mutation(api.members.remove, { ...SITE, member: m!._id })
    expect(await outcome(neu.mutation(api.invites.accept, { token }))).toBe('NOT_FOUND')
    const id = (await rows(s, 'invites'))[0]!._id
    expect(await outcome(neu.mutation(api.invites.acceptMine, { invite: id }))).toBe('NOT_FOUND')
    expect(await outcome(as(s, 'u-anders', 'anders@example.com').mutation(api.invites.accept, { token }))).toBe('NOT_FOUND')
    expect(await neu.query(api.invites.peek, { token })).toBeNull()
    expect(await memberOfUser(s, 'u-neu')).toBeUndefined()
    // An accepted invite cannot be revoked into thin air either.
    expect(await outcome(s.as.owner.mutation(api.invites.revoke, { ...SITE, invite: id }))).toBe('NOT_FOUND')
  })

  it('an expired invite cannot be accepted, peeked, listed, and gets no sign-in code', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: [] })
    const token = await tokenMailedTo(s, 'neu@example.com')
    const id = (await rows(s, 'invites'))[0]!._id
    await s.t.run((ctx) => ctx.db.patch(id, { expiresAt: Date.now() - 1 }))
    const neu = as(s, 'u-neu', 'neu@example.com')
    expect(await outcome(neu.mutation(api.invites.accept, { token }))).toBe('NOT_FOUND')
    expect(await outcome(neu.mutation(api.invites.acceptMine, { invite: id }))).toBe('NOT_FOUND')
    expect(await neu.query(api.invites.peek, { token })).toBeNull()
    expect(await neu.query(api.invites.mine, {})).toEqual([])
    expect(await memberOfUser(s, 'u-neu')).toBeUndefined()
  })

  it('a replaced or revoked invite link no longer works', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: [] })
    const first = await tokenMailedTo(s, 'neu@example.com')
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const neu = as(s, 'u-neu', 'neu@example.com')
    expect(await outcome(neu.mutation(api.invites.accept, { token: first }))).toBe('NOT_FOUND')
    const second = await tokenMailedTo(s, 'neu@example.com')
    await s.as.owner.mutation(api.invites.revoke, { ...SITE, invite: (await rows(s, 'invites'))[0]!._id })
    expect(await outcome(neu.mutation(api.invites.accept, { token: second }))).toBe('NOT_FOUND')
    expect(await memberOfUser(s, 'u-neu')).toBeUndefined()
  })

  it('the plain token is never stored', async () => {
    const s = await setup()
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: [] })
    const token = await tokenMailedTo(s, 'neu@example.com')
    expect(JSON.stringify(await rows(s, 'invites'))).not.toContain(token)
  })

  it.each([
    ['an owner invites an owner', 'owner', { role: 'owner', grants: [], email: 'x@example.com' }, 'FORBIDDEN'],
    ['an admin invites an owner with grants', 'admin', { role: 'owner', grants: ['menu.price'], email: 'x@example.com' }, 'INVALID'],
    ['an invite with a grant that does not exist', 'owner', { role: 'staff', grants: ['menu.nope'], email: 'x@example.com' }, 'INVALID'],
    ['an invite with a grant of a brick that does not exist', 'owner', { role: 'staff', grants: ['__proto__.edit'], email: 'x@example.com' }, 'INVALID'],
    ['an invite for a member already on the team', 'owner', { role: 'staff', grants: [], email: 'KOCH@example.com ' }, 'INVALID'],
    ['an address without a domain dot', 'owner', { role: 'staff', grants: [], email: 'a@b' }, 'INVALID'],
    ['an address with a space', 'owner', { role: 'staff', grants: [], email: 'a b@example.com' }, 'INVALID'],
    ['an address longer than 254 characters', 'owner', { role: 'staff', grants: [], email: `${'a'.repeat(250)}@example.com` }, 'INVALID'],
    ['two addresses in one field', 'owner', { role: 'staff', grants: [], email: 'a@example.com,b@example.com' }, 'INVALID'],
  ] as const)('invites.create refuses %s', async (_label, who, args, code) => {
    const s = await setup()
    expect(await outcome(s.as[who].mutation(api.invites.create, { ...SITE, ...args, grants: [...args.grants] }))).toBe(code)
    expect(await rows(s, 'invites')).toHaveLength(0)
  })

  it('an owner cannot revoke the pending owner invite of an admin', async () => {
    const s = await setup()
    await s.as.admin.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'owner', grants: [] })
    const id = (await rows(s, 'invites'))[0]!._id
    expect(await outcome(s.as.owner.mutation(api.invites.revoke, { ...SITE, invite: id }))).toBe('FORBIDDEN')
    expect(await rows(s, 'invites')).toHaveLength(1)
  })
})

describe('4b. the last owner', () => {
  it('members.remove refuses to remove the only owner, as owner and as admin', async () => {
    const s = await setup()
    const owner = (await memberOfUser(s, 'u-wirtin'))!
    expect(await outcome(s.as.owner.mutation(api.members.remove, { ...SITE, member: owner._id }))).toBe('INVALID')
    expect(await outcome(s.as.admin.mutation(api.members.remove, { ...SITE, member: owner._id }))).toBe('INVALID')
    expect(await memberOfUser(s, 'u-wirtin')).toBeDefined()
  })

  it('with two owners, one can go and the other then cannot', async () => {
    const s = await setup()
    await s.as.admin.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'owner', grants: [] })
    await as(s, 'u-neu', 'neu@example.com').mutation(api.invites.accept, { token: await tokenMailedTo(s, 'neu@example.com') })
    const [first, second] = [(await memberOfUser(s, 'u-wirtin'))!, (await memberOfUser(s, 'u-neu'))!]
    expect(await outcome(s.as.owner.mutation(api.members.remove, { ...SITE, member: second._id }))).toBe('ok')
    expect(await outcome(s.as.owner.mutation(api.members.remove, { ...SITE, member: first._id }))).toBe('INVALID')
    expect((await rows(s, 'memberships')).filter((m) => m.site === s.site && m.role === 'owner')).toHaveLength(1)
  })

  it('deleting the account of the last owner is refused until a second owner exists', async () => {
    const s = await setup()
    expect(await outcome(s.as.owner.mutation(api.account.deleteAccount, {}))).toBe('INVALID')
    expect(await memberOfUser(s, 'u-wirtin')).toBeDefined()
    await s.as.admin.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'owner', grants: [] })
    const neu = as(s, 'u-neu', 'neu@example.com')
    await neu.mutation(api.invites.accept, { token: await tokenMailedTo(s, 'neu@example.com') })
    expect(await outcome(s.as.owner.mutation(api.account.deleteAccount, {}))).toBe('ok')
    expect(await outcome(neu.mutation(api.account.deleteAccount, {}))).toBe('INVALID')
    expect((await rows(s, 'memberships')).filter((m) => m.site === s.site && m.role === 'owner')).toHaveLength(1)
  })

  it('members.setGrants cannot change an owner and no function changes a role', async () => {
    const s = await setup()
    const owner = (await memberOfUser(s, 'u-wirtin'))!
    expect(await outcome(s.as.admin.mutation(api.members.setGrants, { ...SITE, member: owner._id, grants: ['menu.edit'] }))).toBe('INVALID')
    const cook = (await memberOfUser(s, 'u-koch'))!
    // A role smuggled into the arguments is rejected by the argument validator.
    expect(await outcome(s.as.owner.mutation(api.members.setGrants, { ...SITE, member: cook._id, grants: [], role: 'owner' } as never))).not.toBe('ok')
    expect((await memberOfUser(s, 'u-koch'))!.role).toBe('staff')
  })
})

// ---------------------------------------------------------------------------------------------
// 5. Agent keys under review
// ---------------------------------------------------------------------------------------------

async function reviewSetup() {
  const s = await setup()
  await s.as.owner.mutation(api.sites.setAgentReview, { ...SITE, review: true })
  const key = await keyOf(s, 'owner')
  const price = async () => (await s.t.run((ctx) => ctx.db.get(saibling(s))))!.data.price
  const changes = async () => (await rows(s, 'changes')).length
  return { ...s, key, price, changes }
}

describe('5. agent key with review on cannot change live content directly', () => {
  it('ginko_undo of a live save is refused', async () => {
    const s = await reviewSetup()
    const saved = (await s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: saibling(s), baseRev: 1, fields: { price: { amount: 1450 } } })) as { change: string }
    const before = await s.changes()
    const undone = await call(s, s.key, 'ginko_undo', { change: saved.change })
    expect(undone.isError).toBe(true)
    expect(await s.price()).toEqual({ amount: 1450 })
    expect(await s.changes()).toBe(before)
  })

  it('ginko_undo of a live create does not remove the entry, it can only propose', async () => {
    const s = await reviewSetup()
    const created = (await s.as.owner.mutation(api.entries.create, { ...SITE, opId: opId(), brick: 'notices', data: { text: { de: 'Heute Ruhetag' } } })) as { entry: Id<'entries'> }
    const change = (await rows(s, 'changes')).find((c) => c.kind === 'create')!._id
    const contentRev = (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
    await call(s, s.key, 'ginko_undo', { change })
    const entry = (await s.t.run((ctx) => ctx.db.get(created.entry)))!
    expect(entry.deletedAt).toBeUndefined()
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev).toBe(contentRev)
  })

  it('ginko_revert, ginko_translate, tasks and removes become proposals, also with propose: false', async () => {
    const s = await reviewSetup()
    const saved = (await s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: saibling(s), baseRev: 1, fields: { price: { amount: 1450 } } })) as { change: string }
    const before = await s.changes()
    const answers = [
      await call(s, s.key, 'ginko_revert', { entry: saibling(s), change: saved.change }),
      await call(s, s.key, 'ginko_translate', { entry: saibling(s), locale: 'en', fields: { name: 'Char' } }),
      await call(s, s.key, 'task_menu_price', { entry: saibling(s), price: 99, propose: false }),
      await call(s, s.key, 'task_menu_remove', { entry: saibling(s), confirm: true, propose: false }),
      await call(s, s.key, 'task_notices_add', { text: 'Neu', propose: false }),
    ]
    expect(answers.map((a) => a.isError)).toEqual([false, false, false, false, false])
    expect(answers.slice(2).map((a) => a.text)).toEqual(Array(3).fill('Proposed, waiting for approval.'))
    expect(await s.price()).toEqual({ amount: 1450 })
    expect(await s.changes()).toBe(before)
    expect((await s.t.run((ctx) => ctx.db.get(saibling(s))))!.deletedAt).toBeUndefined()
    expect((await rows(s, 'proposals')).length).toBeGreaterThanOrEqual(3)
  })

  it('smuggled arguments (review, task, opId, approvedBy) are refused', async () => {
    const s = await reviewSetup()
    for (const extra of [{ review: false }, { task: 'menu.price' }, { opId: 'x' }, { approvedBy: 'u-wirtin' }, { forceProposal: false }, { site: 'andere' }]) {
      expect((await call(s, s.key, 'task_menu_price', { entry: saibling(s), price: 7, ...extra })).isError).toBe(true)
    }
    expect(await s.price()).toEqual({ amount: 1350 })
  })

  it('the door offers no tool that publishes, schedules, releases, restores or reorders', async () => {
    const s = await reviewSetup()
    const names = ((await rpc(s, s.key, 'tools/list')).body.result.tools as { name: string }[]).map((t) => t.name)
    expect(names.filter((n) => /publish|schedule|release|restore|reorder|member|invite|key|approve/i.test(n))).toEqual([])
    expect((await call(s, s.key, 'ginko_publish', { entry: saibling(s) })).isError).toBe(true)
    expect((await call(s, s.key, 'ginko_approve', { proposal: 'x' })).isError).toBe(true)
  })

  it('ginko_draft makes a draft that is not in the public bundle', async () => {
    const s = await reviewSetup()
    await enableDrafts(s, ['notices'])
    const rev = (await s.t.run((ctx) => ctx.db.get(s.site)))!.contentRev
    const made = await call(s, s.key, 'ginko_draft', { brick: 'notices', fields: { text: 'Entwurf' } })
    expect(made.isError).toBe(false)
    const bundle = (await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as { contentRev: number; bricks: { notices: { items: { data: { text: string } }[] } } }
    expect(bundle.bricks.notices.items.map((i) => i.data.text)).not.toContain('Entwurf')
    expect(bundle.contentRev).toBe(rev)
  })

  it('a key stops working when its person leaves the site, when it is revoked, and after 60 calls a minute', async () => {
    const s = await setup()
    await s.as.admin.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'staff', grants: ['menu.price'] })
    const neu = as(s, 'u-neu', 'neu@example.com')
    await neu.mutation(api.invites.accept, { token: await tokenMailedTo(s, 'neu@example.com') })
    const key = (await neu.mutation(api.agent.createKey, { ...SITE, label: 'k' })).key
    expect((await rpc(s, key, 'tools/list')).status).toBe(200)
    await s.as.owner.mutation(api.members.remove, { ...SITE, member: (await memberOfUser(s, 'u-neu'))!._id })
    expect((await rpc(s, key, 'tools/list')).status).toBe(401)

    const owner = await keyOf(s, 'owner')
    let last = 200
    for (let i = 0; i < 61; i++) last = (await rpc(s, owner, 'ping')).status
    expect(last).toBe(429)
    const second = await s.as.owner.mutation(api.agent.createKey, { ...SITE, label: 'two' })
    await s.as.owner.mutation(api.agent.revokeKey, { ...SITE, key: second.id })
    expect((await rpc(s, second.key, 'ping')).status).toBe(401)
  })

  it('/mcp refuses a missing, malformed or foreign key, an oversize body and GET', async () => {
    const s = await setup()
    const post = (headers: Record<string, string>, body = '{"jsonrpc":"2.0","id":1,"method":"ping"}') => s.t.fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })
    expect((await post({})).status).toBe(401)
    expect((await post({ authorization: 'Bearer ginko_agent_' + 'a'.repeat(32) })).status).toBe(401)
    expect((await post({ authorization: 'bearer ' + await keyOf(s, 'owner') })).status).toBe(401)
    // A push key is not an agent key.
    const push = (await s.as.owner.mutation(api.release.createPushKey, { ...SITE, label: 'ci', scopes: ['release'] })).key
    expect((await post({ authorization: `Bearer ${push}` })).status).toBe(401)
    const key = await keyOf(s, 'owner')
    expect((await post({ authorization: `Bearer ${key}` }, 'x'.repeat(600 * 1024))).status).toBe(413)
    expect((await s.t.fetch('/mcp', { method: 'GET', headers: { authorization: `Bearer ${key}` } })).status).toBe(405)
  })
})

// ---------------------------------------------------------------------------------------------
// 6. Push keys
// ---------------------------------------------------------------------------------------------

describe('6. push keys', () => {
  type Scope = 'release' | 'pull' | 'check' | 'export'
  const keyWith = async (s: S, scopes: Scope[]) => (await s.as.owner.mutation(api.release.createPushKey, { ...SITE, label: 'k', scopes })).key
  const hit = (s: S, token: string | undefined, path: string, init: RequestInit = {}) =>
    s.t.fetch(path, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } })
  const validRelease = async (s: S) => ({ commit: crypto.randomUUID().replaceAll('-', ''), expectedSchemaRev: 1, expectedContentRev: 1, schema: (await s.t.run((ctx) => ctx.db.get(s.site)))!.schema, writes: [] as unknown[] })
  const postRelease = async (s: S, token: string | undefined, body?: unknown) => hit(s, token, '/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body ?? await validRelease(s)) })

  it.each([
    ['check', 200, 200, 403, 403],
    ['release', 200, 200, 403, 403],
    ['pull', 403, 403, 200, 403],
    ['export', 403, 403, 200, 403],
  ] as [Scope, number, number, number, number][])('a key with only scope %s: state %i, release %i, export %i', async (scope, state, _rel, exp) => {
    const s = await setup()
    const token = await keyWith(s, [scope])
    expect((await hit(s, token, '/release/state?site=restaurant')).status).toBe(state)
    // A release is accepted only with scope release; the others are told no before the body is read.
    const posted = (await postRelease(s, token)).status
    expect(posted).toBe(scope === 'release' ? 200 : 403)
    expect((await hit(s, token, '/export?site=restaurant')).status).toBe(exp)
  })

  it('a revoked, unknown, malformed or missing key is 401 on every route, and the key of another site is 403', async () => {
    const s = await setup()
    const live = (await s.as.owner.mutation(api.release.createPushKey, { ...SITE, label: 'k', scopes: ['release', 'export', 'check'] }))
    const other = (await s.as.stranger.mutation(api.release.createPushKey, { site: 'andere', label: 'k', scopes: ['release', 'export', 'check'] })).key
    await s.as.owner.mutation(api.release.revokePushKey, { ...SITE, key: live.id })
    const forged = live.key.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))
    for (const token of [live.key, forged, 'ginko_restaurant_short', 'Bearer', '', undefined]) {
      expect((await hit(s, token, '/release/state?site=restaurant')).status).toBe(401)
      expect((await hit(s, token, '/export?site=restaurant')).status).toBe(401)
      expect((await postRelease(s, token)).status).toBe(401)
    }
    // Another site's valid key is not a key for this site.
    expect((await hit(s, other, '/release/state?site=restaurant')).status).toBe(403)
    expect((await hit(s, other, '/export?site=restaurant')).status).toBe(403)
    // The site name in the key text is not what authorizes it: a restaurant-looking token with the secret of B's key is unknown.
    const spoof = other.replace('ginko_andere_', 'ginko_restaurant_')
    expect((await hit(s, spoof, '/export?site=restaurant')).status).toBe(401)
    expect((await hit(s, live.key.toUpperCase(), '/export?site=restaurant')).status).toBe(401)
  })

  it('a site that is being deleted answers its keys as unknown', async () => {
    const s = await setup()
    const token = await keyWith(s, ['release', 'export'])
    vi.useFakeTimers()
    await s.as.owner.mutation(api.sites.startDeletion, { ...SITE, confirm: 'restaurant' })
    expect((await hit(s, token, '/export?site=restaurant')).status).toBe(401)
    vi.useRealTimers()
  })

  it('a malformed release is refused with 400/413 and changes nothing', async () => {
    const s = await setup()
    const token = await keyWith(s, ['release'])
    const base = await validRelease(s)
    const cases: [string, unknown, number][] = [
      ['not JSON', 'not json', 400],
      ['an array', [], 400],
      ['writes is not a list', { ...base, writes: {} }, 400],
      ['revision is NaN-like', { ...base, expectedSchemaRev: 1.5 }, 400],
      ['a $-key deep in the schema', { ...base, schema: { ...(base.schema as object), $evil: 1 } }, 400],
      ['a negative revision', { ...base, expectedSchemaRev: -1 }, 400],
      ['a revision above the site', { ...base, expectedSchemaRev: 99 }, 409],
      ['a body above 8 MiB', 'x'.repeat(9 * 1024 * 1024), 413],
    ]
    for (const [label, body, status] of cases) expect([label, (await postRelease(s, token, body)).status]).toEqual([label, status])
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.schemaRev).toBe(1)
  })

  it.each([
    'http://localhost:3000', 'http://127.0.0.1', 'http://[::1]/', 'http://169.254.169.254/latest', 'http://10.0.0.5', 'http://192.168.1.1',
    'http://2130706433', 'http://0x7f.0.0.1', 'http://0177.0.0.1', 'https://user:pw@evil.example', 'file:///etc/passwd', 'ftp://example.com',
    'http://[::ffff:127.0.0.1]', 'http://metadata.google.internal', 'http://127.1', 'http://0.0.0.0', 'http://localhost.', 'http://foo.localhost',
  ])('a release that moves the site to %s is refused (the refresh token is sent there)', async (url) => {
    const s = await setup()
    const token = await keyWith(s, ['release'])
    const body = await validRelease(s)
    ;(body.schema as { url: string }).url = url
    const res = await postRelease(s, token, body)
    expect(res.status).toBe(400)
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.url).toBe('https://ginko-demo-restaurant.vercel.app')
  })

  it('a push key outlives its maker, is listed with its maker and last use, and stops after revoke', async () => {
    // Push keys are CI secrets of the site (decided): removing the person who made one does not end it.
    // The Team page lists every live key with who made it, so an owner can revoke it on purpose.
    const s = await setup()
    await s.as.admin.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'owner', grants: [] })
    const neu = as(s, 'u-neu', 'neu@example.com')
    await neu.mutation(api.invites.accept, { token: await tokenMailedTo(s, 'neu@example.com') })
    const made = await neu.mutation(api.release.createPushKey, { ...SITE, label: 'ci', scopes: ['export'] })
    const member = (await memberOfUser(s, 'u-neu'))!._id
    const keys = async () => (await s.as.owner.query(api.members.list, SITE)).keys
    expect(await keys()).toEqual([{ id: made.id, label: 'ci', scopes: ['export'], by: { email: 'neu@example.com' }, member, createdAt: expect.any(Number), lastUsedAt: null }])

    expect((await hit(s, made.key, '/export?site=restaurant')).status).toBe(200)
    expect(typeof (await keys())[0]!.lastUsedAt).toBe('number')

    await s.as.owner.mutation(api.members.remove, { ...SITE, member })
    expect((await hit(s, made.key, '/export?site=restaurant')).status).toBe(200)
    expect(await keys()).toMatchObject([{ label: 'ci', by: { kind: 'former' }, member: null }])

    await s.as.owner.mutation(api.release.revokePushKey, { ...SITE, key: made.id })
    expect((await hit(s, made.key, '/export?site=restaurant')).status).toBe(401)
    expect(await keys()).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// 7. Values the server must refuse (public save / create / publish / files / views)
// ---------------------------------------------------------------------------------------------

// A refusal with a code, or one by Convex's own argument checks (wrong type at the function boundary, `$` in a field name).
// A direct entries.save keeps Convex's uncoded message for such names: the client serializes the arguments, so no server
// code runs. Only the JSON boundaries (agent door, release route, import batch) name the key (lib/input.ts badKey).
const REFUSAL = /^(INVALID|TOO_LARGE|uncoded: (Validator error|Field name \$))/
const json = (text: string): Json => JSON.parse(text) as Json
const nest = (depth: number): Json => { let v: Json = 1; for (let i = 0; i < depth; i++) v = { a: v }; return v }

async function saveFields(s: S, fields: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: saibling(s), baseRev: 1, fields, ...over } as never))
}
const unchanged = async (s: S, entry = saibling(s)) => (await s.t.run((ctx) => ctx.db.get(entry)))!.rev

describe('7a. entries.save refuses wrong types, unknown fields and values over the limit', () => {
  it.each([
    ['price NaN', { price: { amount: NaN } }],
    ['price Infinity', { price: { amount: Infinity } }],
    ['price negative', { price: { amount: -1 } }],
    ['price -0.5 cents', { price: { amount: -0.5 } }],
    ['price fraction', { price: { amount: 12.5 } }],
    ['price 2^53', { price: { amount: 2 ** 53 } }],
    ['price 1e15 (huge)', { price: { amount: 1e15 } }],
    ['price 1e300', { price: { amount: 1e300 } }],
    ['price as string', { price: { amount: '1350' } }],
    ['price as bare number', { price: 1350 }],
    ['price as string', { price: '13,50' }],
    ['price with an extra key', { price: { amount: 5, currency: 'USD' } }],
    ['price as list', { price: [1] }],
    ['price as boolean', { price: true }],
    ['price null (required)', { price: null }],
    ['name as number', { name: 123 }],
    ['name as boolean', { name: true }],
    ['name as list', { name: ['x'] }],
    ['name as an object', { name: { de: { nested: 'x' } } }],
    ['name text a number per language', { name: { de: 123 } }],
    ['name 121 characters', { name: { de: 'x'.repeat(121) } }],
    ['name 2 MB of text', { name: { de: 'x'.repeat(2_000_000) } }],
    ['name in a language the site does not have', { name: { de: 'ok', fr: 'non' } }],
    ['name without the main language', { name: { en: 'only english' } }],
    ['name empty', { name: { de: '' } }],
    ['name null (required)', { name: null }],
    ['name with a C0 control character', { name: { de: 'a\u0007b' } }],
    ['category outside the options', { category: 'nope' }],
    ['category as list', { category: ['starters'] }],
    ['category as number', { category: 5 }],
    ['allergens outside the options', { allergens: ['ZZ'] }],
    ['allergens as string', { allergens: 'A' }],
    ['allergens with numbers', { allergens: [1] }],
    ['allergens twice the same', { allergens: ['A', 'A'] }],
    ['allergens 5000 entries', { allergens: Array(5000).fill('A') }],
    ['veg outside the options', { veg: 'carnivore' }],
    ['description 501 characters', { description: { de: 'x'.repeat(501) } }],
    ['priceFrom impossible date', { priceFrom: '2026-02-30' }],
    ['priceFrom month 13', { priceFrom: '2026-13-01' }],
    ['priceFrom a word', { priceFrom: 'tomorrow' }],
    ['priceFrom a number', { priceFrom: 20261001 }],
    ['nextPrice negative', { nextPrice: { amount: -5 } }],
    ['unknown field', { bogus: 1 }],
    ['unknown field with $', { $set: { name: 'x' } }],
    ['unknown field constructor', { constructor: 1 }],
    ['unknown field toString', { toString: 1 }],
    ['empty field name', { '': 1 }],
    ['value nested 14 levels deep', { price: nest(14) }],
    ['20 000 unknown fields', Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => [`k${i}`, 1]))],
  ])('%s', async (_label, fields) => {
    const s = await setup()
    expect(await saveFields(s, fields)).toMatch(REFUSAL)
    expect(await unchanged(s)).toBe(1)
  })

  it('a __proto__ field name (own key from JSON) changes nothing and pollutes nothing', async () => {
    const s = await setup()
    // convex-test turns the key into the prototype of the argument, so the call may be a no-op instead of a refusal.
    expect(['ok', 'INVALID']).toContain(await saveFields(s, json('{"__proto__": {"admin": true}}')))
    expect(await unchanged(s)).toBe(1)
    expect(({} as { admin?: boolean }).admin).toBeUndefined()
  })

  it('an optional text cleared with { de: null } is removed or refused, never stored as a null inside the text', async () => {
    const s = await setup()
    const code = await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: saibling(s), baseRev: 1, fields: { description: { de: null } } }))
    const stored = (await s.t.run((ctx) => ctx.db.get(saibling(s))))!.data.description
    expect([code, JSON.stringify(stored ?? null)]).not.toEqual(['ok', '{"de":null}'])
  })

  it.each([
    ['baseRev NaN', { baseRev: NaN }],
    ['baseRev Infinity', { baseRev: Infinity }],
    ['baseRev -1', { baseRev: -1 }],
    ['baseRev 1.5', { baseRev: 1.5 }],
    ['baseRev 2^53', { baseRev: 2 ** 53 }],
    ['baseRev 99 (above the real revision)', { baseRev: 99 }],
    ['opId empty', { opId: '' }],
    ['opId 65 characters', { opId: 'a'.repeat(65) }],
    ['opId with a space', { opId: 'a b' }],
    ['opId with a slash', { opId: '../x' }],
    ['locale not on the site', { locale: 'xx' }],
    ['locale given with a slug-like path', { locale: 'de/../en' }],
    ['confirm without a foreign locale', { confirm: ['name'] }],
    ['confirm of an unknown field', { locale: 'en', confirm: ['bogus'] }],
  ])('%s', async (_label, over) => {
    const s = await setup()
    const code = await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: saibling(s), baseRev: 1, fields: { price: { amount: 100 } }, ...over } as never))
    expect(code).toMatch(/^(INVALID|CHANGED_SINCE|FORBIDDEN)$/)
    expect(await unchanged(s)).toBe(1)
  })

  it('an opId reused with other content is refused and the first result stands', async () => {
    const s = await setup()
    const id = opId()
    await s.as.owner.mutation(api.entries.save, { ...SITE, opId: id, entry: saibling(s), baseRev: 1, fields: { price: { amount: 100 } } })
    expect(await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: id, entry: saibling(s), baseRev: 1, fields: { price: { amount: 999 } } }))).toBe('OP_REUSED')
    expect((await s.t.run((ctx) => ctx.db.get(saibling(s))))!.data.price).toEqual({ amount: 100 })
  })

  it('a text for a field that takes no translation must be a string; an object is refused (contact.street)', async () => {
    const s = await setup()
    const contact = s.entries['contact']!
    for (const fields of [{ street: { de: 'x' } }, { street: 5 }, { street: 'x'.repeat(81) }, { email: 'not-an-email' }, { email: 'a@b' }, { phone: 'call me' }, { postalCode: 'x'.repeat(11) }]) {
      expect([JSON.stringify(fields), await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: contact, baseRev: 1, fields }))]).toEqual([JSON.stringify(fields), expect.stringMatching(REFUSAL)])
    }
    expect(await unchanged(s, contact)).toBe(1)
  })

  it('a markdown field given an object, a list or a number is refused (legal.imprint, events.description)', async () => {
    const s = await setup()
    const legal = s.entries['legal']!
    const event = s.entries['weinabend']!
    const bad: unknown[] = [{ de: { type: 'doc', content: [] } }, { de: ['a'] }, { de: 5 }, ['a'], 5, { de: { type: 'doc' }, en: 'ok' }]
    for (const value of bad) {
      for (const [entry, field] of [[legal, 'imprint'], [event, 'description']] as const) {
        const code = await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry, baseRev: 1, fields: { [field]: value } }))
        expect([field, JSON.stringify(value), code]).toEqual([field, JSON.stringify(value), expect.stringMatching(REFUSAL)])
      }
    }
    expect(await unchanged(s, legal)).toBe(1)
    expect(await unchanged(s, event)).toBe(1)
  })

  it('markdown: 5001 characters in events.description and 3 MB in legal.imprint are refused', async () => {
    const s = await setup()
    expect(await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: s.entries['weinabend']!, baseRev: 1, fields: { description: { de: 'x'.repeat(5001) } } }))).toMatch(REFUSAL)
    expect(await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: s.entries['legal']!, baseRev: 1, fields: { imprint: { de: 'x '.repeat(1_500_000) } } }))).toMatch(REFUSAL)
    expect(await unchanged(s, s.entries['legal']!)).toBe(1)
  })

  it.each([
    ['a javascript: link', '[klick](javascript:alert(1))'],
    ['a javascript: link with entities', '[klick](&#106;avascript:alert(1))'],
    ['a data: link', '[klick](data:text/html;base64,PHNjcmlwdD4=)'],
    ['a vbscript: link', '[klick](vbscript:x)'],
    ['a javascript: image', '![x](javascript:alert(1))'],
    ['an uppercase JaVaScRiPt: link', '[klick](JaVaScRiPt:alert(1))'],
    ['a link with a tab inside the scheme', '[klick](java\tscript:alert(1))'],
  ])('markdown with %s never reaches the website as a link', async (_label, markdown) => {
    // The text may be stored as typed (the parser treats an unsafe target as plain text); what the website receives must hold no live script link.
    const s = await setup()
    const code = await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: s.entries['legal']!, baseRev: 1, fields: { imprint: { de: markdown } } }))
    if (code !== 'ok') return expect(code).toMatch(REFUSAL)
    const bundle = (await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as { bricks: { legal: { data: { imprint: unknown } } } }
    const served = JSON.stringify(bundle.bricks.legal.data.imprint)
    expect(served).not.toMatch(/"(href|src)":\s*"\s*(javascript|data|vbscript):/i)
    expect(served).not.toMatch(/\["(a|img)"/)
  })

  it('event fields: booking link, start time, reversed date range, slug', async () => {
    const s = await setup()
    const event = s.entries['weinabend']!
    const attempts: Record<string, unknown>[] = [
      { booking: 'javascript:alert(1)' }, { booking: 'ftp://x.example' }, { booking: 'not a url' }, { start: '25:00' }, { start: '9:5' },
      { when: { from: '2026-12-02', to: '2026-12-01' } }, { when: { from: 'x', to: 'y' } }, { when: '2026-12-01' },
      { slug: { de: 'a/b', en: 'x' } }, { slug: { de: '../../admin' } },
    ]
    for (const fields of attempts) {
      const code = await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: event, baseRev: 1, fields } as never))
      expect([JSON.stringify(fields), code]).toEqual([JSON.stringify(fields), expect.stringMatching(REFUSAL)])
    }
    expect(await unchanged(s, event)).toBe(1)
  })
})

describe('7b. entries.create refuses wrong values and keeps slugs clean', () => {
  const event = (over: Record<string, unknown> = {}) => ({ title: { de: 'Fest' }, when: { from: '2027-01-02', to: '2027-01-02' }, description: { de: 'x' }, ...over })
  const create = (s: S, data: Record<string, unknown>, brick = 'events', extra: Record<string, unknown> = {}) =>
    s.as.owner.mutation(api.entries.create, { ...SITE, opId: opId(), brick, data, ...extra } as never)

  it('a slug sent with the data is ignored or refused: no stored slug contains "/", "." or a space', async () => {
    const s = await setup()
    for (const data of [event({ slug: { de: 'a/b', en: '../x' } }), event({ title: { de: 'Wein/Abend ../ ?# %2F \\ Fest', en: '../../etc/passwd' } }), event({ title: { de: '/' } })]) {
      const code = await outcome(create(s, data))
      expect(['ok', 'INVALID']).toContain(code)
    }
    const slugs = await s.t.run((ctx) => ctx.db.query('slugs').collect())
    expect(slugs.filter((x) => /[/\\.\s?#%]/.test(x.slug) || x.slug === '')).toEqual([])
    const stored = (await rows(s, 'entries')).filter((e) => e.brick === 'events').flatMap((e) => Object.values((e.data.slug ?? {}) as Record<string, string>))
    expect(stored.filter((slug) => /[/\\.\s?#%]/.test(slug) || slug === '')).toEqual([])
  })

  it.each([
    ['unknown field', event({ bogus: 1 }), 'events'],
    ['missing required title', { when: { from: '2027-01-02', to: '2027-01-02' }, description: { de: 'x' } }, 'events'],
    ['title as number', event({ title: 5 }), 'events'],
    ['title over 120', event({ title: { de: 'x'.repeat(121) } }), 'events'],
    ['markdown as object', event({ description: { de: { type: 'doc' } } }), 'events'],
    ['price NaN', event({ price: { amount: NaN } }), 'events'],
    ['a single brick', { street: 'x', city: 'y', phone: '1' }, 'contact'],
    ['a brick that does not exist', {}, 'nope'],
    ['a brick named __proto__', {}, '__proto__'],
    ['a brick named constructor', {}, 'constructor'],
    ['title with NUL', event({ title: { de: 'a\u0000b' } }), 'events'],
    ['notice text of 141 characters', { text: { de: 'x'.repeat(141) } }, 'notices'],
    ['notice until impossible', { text: { de: 'x' }, until: '2026-02-31' }, 'notices'],
  ])('%s', async (_label, data, brick) => {
    const s = await setup()
    const before = (await rows(s, 'entries')).length
    expect(await outcome(create(s, data as Record<string, unknown>, brick))).toMatch(REFUSAL)
    expect((await rows(s, 'entries')).length).toBe(before)
  })

  it.each([
    ['publish.at NaN', { publish: { at: NaN } }],
    ['publish.at Infinity', { publish: { at: Infinity } }],
    ['publish.at in the past', { publish: { at: 1000 } }],
    ['publish.at two years ahead', { publish: { at: Date.now() + 2 * 365 * 24 * 3600 * 1000 } }],
    ['publish.at a fraction', { publish: { at: Date.now() + 5000.5 } }],
  ])('%s on a drafts collection', async (_label, extra) => {
    const s = await setup()
    await enableDrafts(s)
    const before = (await rows(s, 'entries')).length
    expect(await outcome(create(s, event(), 'events', extra))).toMatch(REFUSAL)
    expect((await rows(s, 'entries')).length).toBe(before)
  })

  it('a collection stops at its maximum (events: 30)', async () => {
    const s = await setup()
    const existing = (await rows(s, 'entries')).filter((e) => e.brick === 'events' && !e.deletedAt).length
    let refused = ''
    for (let i = 0; i < 40 && !refused; i++) {
      const code = await outcome(create(s, event({ title: { de: `Fest ${i}` }, when: { from: '2027-03-01', to: '2027-03-01' } })))
      if (code !== 'ok') refused = code
      else expect(i + existing).toBeLessThan(30)
    }
    expect(refused).toMatch(REFUSAL)
    expect((await rows(s, 'entries')).filter((e) => e.brick === 'events' && !e.deletedAt).length).toBeLessThanOrEqual(30)
  })

  it('a list over its maximum or with a repeated row id is refused (gallery: 24 images)', async () => {
    const s = await setup()
    const gallery = s.entries['gallery']!
    // The corpus rows point at made-up file ids; start the gallery empty.
    await s.t.run((ctx) => ctx.db.patch(gallery, { data: { images: [] } }))
    const files = await Promise.all([0, 1].map(() => readyImage(s, 'restaurant')))
    const row = (i: number, file: string) => ({ _id: `row${String(i).padStart(7, '0')}`, image: { file, alt: { de: 'Bild' } } })
    const tooMany = Array.from({ length: 25 }, (_, i) => row(i, files[0]!))
    const dupIds = [row(1, files[0]!), row(1, files[1]!)]
    for (const images of [tooMany, dupIds, [{ image: { file: files[0], alt: { de: 'Bild' } } }], [5], 'x', [{ _id: 'a'.repeat(5000), image: { file: files[0], alt: { de: 'Bild' } } }]]) {
      expect([typeof images, await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: gallery, baseRev: 1, fields: { images } }))]).toEqual([typeof images, expect.stringMatching(REFUSAL)])
    }
    expect(await unchanged(s, gallery)).toBe(1)
    // The control: two good rows work.
    expect(await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: gallery, baseRev: 1, fields: { images: [row(1, files[0]!), row(2, files[1]!)] } }))).toBe('ok')
  })
})

/** A ready image upload of `site`, stored as the upload pipeline leaves it. */
async function readyImage(s: S, site: 'restaurant' | 'andere', over: { mime?: string; status?: 'ready' | 'processing'; trashedAt?: number } = {}) {
  return s.t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['x'], { type: over.mime ?? 'image/webp' }))
    return ctx.db.insert('uploads', {
      site: site === 'restaurant' ? s.site : s.other, uploader: 'u-wirtin', storageId, name: 'bild.webp', size: 1, mime: over.mime ?? 'image/webp',
      width: 10, height: 10, status: over.status ?? 'ready', attempts: 0, ...(over.trashedAt ? { trashedAt: over.trashedAt } : {}),
    })
  }) as Promise<string>
}

describe('7c. references to files and entries of another site, brick or state', () => {
  it('an image field refuses an upload of another site, a PDF, a trashed or unfinished upload, and an unknown id', async () => {
    const s = await setup()
    const seo = s.entries['seo']!
    const own = await readyImage(s, 'restaurant')
    const theirs = await readyImage(s, 'andere')
    const pdf = await readyImage(s, 'restaurant', { mime: 'application/pdf' })
    const trashed = await readyImage(s, 'restaurant', { trashedAt: Date.now() })
    const pending = await readyImage(s, 'restaurant', { status: 'processing' })
    const alt = { de: 'Bild' }
    const bad: [string, unknown][] = [
      ['upload of another site', { file: theirs, alt }], ['a pdf', { file: pdf, alt }], ['trashed', { file: trashed, alt }], ['not ready', { file: pending, alt }],
      ['unknown id', { file: 'nope', alt }], ['entry id as file', { file: s.entries['menu-saibling'], alt }], ['no file key', { alt }], ['file as number', { file: 5, alt }],
      ['alt of 10 000 characters', { file: own, alt: { de: 'x'.repeat(10_000) } }], ['alt in an unknown language', { file: own, alt: { fr: 'x' } }],
    ]
    for (const [label, image] of bad) {
      expect([label, await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: seo, baseRev: 1, fields: { image } }))]).toEqual([label, expect.stringMatching(REFUSAL)])
    }
    expect(await unchanged(s, seo)).toBe(1)
    expect(await outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: seo, baseRev: 1, fields: { image: { file: own, alt } } }))).toBe('ok')
  })

  it('a ref field refuses an entry of another site, another brick, a removed entry and an unknown id', async () => {
    const s = await setup()
    // The restaurant has no ref field; add one to notices that points at menu entries.
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const schema = site.schema as Schema
      ;(schema.bricks.notices!.fields as Record<string, unknown>).related = { type: 'ref', label: 'Gericht', to: 'menu', optional: true }
      ;(schema.bricks.notices!.fields as Record<string, unknown>).relatedMany = { type: 'ref', label: 'Gerichte', to: 'menu', multiple: true, max: 2, optional: true }
      await ctx.db.patch(s.site, { schema })
    })
    const foreign = await s.t.run(async (ctx) => ctx.db.insert('entries', { site: s.other, brick: 'menu', kind: 'item', order: 1, data: {}, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 2 }))
    const removed = s.entries['menu-frittaten']!
    await s.as.owner.mutation(api.entries.remove, { ...SITE, opId: opId(), entry: removed, lifeRev: 1 })
    const notice = s.entries['notice-ausgebucht']!
    const save = (fields: Record<string, unknown>) => outcome(s.as.owner.mutation(api.entries.save, { ...SITE, opId: opId(), entry: notice, baseRev: 1, fields } as never))
    const bad: [string, Record<string, unknown>][] = [
      ['entry of another site', { related: foreign }], ['entry of another brick', { related: s.entries['hours']! }], ['a removed entry', { related: removed }],
      ['an unknown id', { related: 'nope' }], ['a number', { related: 5 }], ['a list for a single ref', { related: [s.entries['menu-saibling']] }],
      ['a list with a foreign id', { relatedMany: [s.entries['menu-saibling'], foreign] }], ['the same id twice', { relatedMany: [s.entries['menu-saibling'], s.entries['menu-saibling']] }],
      ['too many', { relatedMany: [s.entries['menu-saibling'], s.entries['menu-schnitzel'], s.entries['menu-frittaten']] }], ['empty string', { related: '' }],
    ]
    for (const [label, fields] of bad) expect([label, await save(fields)]).toEqual([label, expect.stringMatching(REFUSAL)])
    expect(await unchanged(s, notice)).toBe(1)
    expect(await save({ related: s.entries['menu-saibling'] })).toBe('ok')
  })

  it('entries.create refuses a ref to another site as well', async () => {
    const s = await setup()
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const schema = site.schema as Schema
      ;(schema.bricks.notices!.fields as Record<string, unknown>).related = { type: 'ref', label: 'Gericht', to: 'menu', optional: true }
      await ctx.db.patch(s.site, { schema })
    })
    const foreign = await s.t.run(async (ctx) => ctx.db.insert('entries', { site: s.other, brick: 'menu', kind: 'item', order: 1, data: {}, rev: 1, fieldRevs: {}, lifeRev: 1, prints: {}, bytes: 2 }))
    expect(await outcome(s.as.owner.mutation(api.entries.create, { ...SITE, opId: opId(), brick: 'notices', data: { text: { de: 'x' }, related: foreign } }))).toMatch(REFUSAL)
  })

  it('structural arguments: lifeRev and publish time are checked as numbers', async () => {
    const s = await setup()
    await enableDrafts(s)
    const draft = (await s.as.owner.mutation(api.entries.create, { ...SITE, opId: opId(), brick: 'events', data: { title: { de: 'Fest' }, when: { from: '2027-01-02', to: '2027-01-02' }, description: { de: 'x' } } })) as { entry: string }
    const menu = s.entries['menu-saibling']!
    const bad = [NaN, Infinity, -1, 1.5, 2 ** 53]
    const results: string[] = []
    for (const n of bad) {
      results.push(await outcome(s.as.owner.mutation(api.entries.remove, { ...SITE, opId: opId(), entry: menu, lifeRev: n })))
      results.push(await outcome(s.as.owner.mutation(api.entries.restore, { ...SITE, opId: opId(), entry: menu, lifeRev: n })))
      results.push(await outcome(s.as.owner.mutation(api.entries.publish, { ...SITE, opId: opId(), entry: draft.entry, lifeRev: n })))
      results.push(await outcome(s.as.owner.mutation(api.entries.unpublish, { ...SITE, opId: opId(), entry: draft.entry, lifeRev: n })))
    }
    for (const at of [NaN, Infinity, -5, 1000, 1.5, Date.now() + 5 * 365 * 24 * 3600 * 1000, Date.now() + 5000.5]) {
      results.push(await outcome(s.as.owner.mutation(api.entries.publish, { ...SITE, opId: opId(), entry: draft.entry, lifeRev: 1, at })))
    }
    expect(results.filter((r) => !REFUSAL.test(r))).toEqual([])
    expect(((await s.t.run((ctx) => ctx.db.get(draft.entry as Id<'entries'>)))!).state).toBe('draft')
  })
})

describe('7d. files, views and other names', () => {
  async function aFile(s: S) {
    const ticket = (await s.as.owner.mutation(api.uploads.prepare, SITE)).ticket
    const response = await s.t.fetch(`/upload?ticket=${ticket}&name=karte.pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 x' })
    const file = ((await response.json()) as { upload: string }).upload
    await s.t.run((ctx) => ctx.db.patch(file as Id<'uploads'>, { status: 'ready' }))
    return file
  }

  it.each([
    ['empty', ''], ['only spaces', '   '], ['a path', '../../etc/passwd.pdf'], ['with a slash', 'a/b.pdf'], ['201 characters', `${'a'.repeat(200)}.pdf`],
    ['NUL character', 'a\u0000b.pdf'], ['a 1 MB name', 'a'.repeat(1_000_000)], ['reserved dots', '..'],
  ])('files.rename refuses a name that is %s', async (_label, name) => {
    const s = await setup()
    const file = await aFile(s)
    const code = await outcome(s.as.owner.mutation(api.files.rename, { ...SITE, file, name }))
    if (code === 'ok') {
      // Accepted: the stored name must carry no path separator or control character.
      const stored = (await s.t.run((ctx) => ctx.db.get(file as Id<'uploads'>)))!.name
      expect(stored).not.toMatch(/[/\\\u0000-\u001f]/)
      expect(stored.length).toBeGreaterThan(0)
      expect(stored.length).toBeLessThanOrEqual(200)
    } else {
      expect(code).toMatch(REFUSAL)
    }
  })

  it.each([['empty', ''], ['a slash', 'a/b'], ['81 characters', 'a'.repeat(81)], ['dots', '..'], ['NUL', 'a\u0000b'], ['1 MB', 'a'.repeat(1_000_000)]])('files.createFolder refuses a name with %s', async (_label, name) => {
    const s = await setup()
    const code = await outcome(s.as.owner.mutation(api.files.createFolder, { ...SITE, name }))
    if (code === 'ok') {
      const stored = (await rows(s, 'folders'))[0]!.name
      expect(stored).not.toMatch(/[/\\\u0000-\u001f]/)
      expect(stored.length).toBeLessThanOrEqual(80)
    } else expect(code).toMatch(REFUSAL)
  })

  it('files.setAlt refuses a language the site does not have and a text of 100 000 characters', async () => {
    const s = await setup()
    const file = await aFile(s)
    expect(await outcome(s.as.owner.mutation(api.files.setAlt, { ...SITE, file, locale: 'xx', text: 'x' }))).toMatch(REFUSAL)
    expect(await outcome(s.as.owner.mutation(api.files.setAlt, { ...SITE, file, locale: 'de', text: 'x'.repeat(100_000) }))).toMatch(REFUSAL)
    expect(await outcome(s.as.owner.mutation(api.files.setAlt, { ...SITE, file, locale: '__proto__', text: 'x' }))).toMatch(REFUSAL)
  })

  it('files.setFocus refuses a focus point outside the picture and NaN', async () => {
    const s = await setup()
    const image = await readyImage(s, 'restaurant')
    for (const focus of [{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }, { x: NaN, y: 0.5 }, { x: 0.5, y: Infinity }, { x: '0.5', y: 0.5 }, { x: 0.5 }, 5]) {
      expect([JSON.stringify(focus), await outcome(s.as.owner.mutation(api.files.setFocus, { ...SITE, file: image, focus } as never))]).toEqual([JSON.stringify(focus), expect.stringMatching(REFUSAL)])
    }
  })

  it('views.save refuses a query with unknown keys, fields of another brick, a nested bomb and a huge filter', async () => {
    const s = await setup()
    const save = (query: unknown, name = 'v', brick = 'menu') => outcome(s.as.owner.mutation(api.views.save, { ...SITE, brick, name, query } as never))
    const results = [
      await save('x'), await save([]), await save({ sql: 'drop' }), await save({ filters: { bogus: 1 } }), await save({ filters: { name: 'x'.repeat(10_000) } }),
      await save({ filters: { price: nest(2000) } }), await save({ sort: { field: 'bogus', dir: 'asc' } }), await save({ sort: { field: 'price', dir: 'up' } }),
      await save({ text: 'x'.repeat(201) }), await save({}, ''), await save({}, 'x'.repeat(61)), await save({}, 'v', 'contact'), await save({}, 'v', '__proto__'),
    ]
    expect(results.filter((r) => !REFUSAL.test(r))).toEqual([])
    expect(await rows(s, 'sites')).toHaveLength(2)
  })

  it('search.studio and uploads.urls bound their input', async () => {
    const s = await setup()
    const long = await s.as.owner.query(api.search.studio, { ...SITE, query: 'a'.repeat(1_000_000), limit: 1e9 })
    expect(long.entries.length).toBeLessThanOrEqual(50)
    expect((await s.as.owner.query(api.search.studio, { ...SITE, query: 'x', limit: NaN })).entries.length).toBeLessThanOrEqual(50)
    expect(await outcome(s.as.owner.query(api.uploads.urls, { ...SITE, ids: Array(201).fill('x') }))).toMatch(REFUSAL)
  })

  it('agent.createKey and release.createPushKey refuse labels that are empty or 61 characters, and a push key with no scope', async () => {
    const s = await setup()
    for (const label of ['', '   ', 'x'.repeat(61)]) {
      expect(await outcome(s.as.owner.mutation(api.agent.createKey, { ...SITE, label }))).toMatch(REFUSAL)
      expect(await outcome(s.as.owner.mutation(api.release.createPushKey, { ...SITE, label, scopes: ['release'] }))).toMatch(REFUSAL)
    }
    expect(await outcome(s.as.owner.mutation(api.release.createPushKey, { ...SITE, label: 'x', scopes: [] }))).toMatch(REFUSAL)
    expect(await rows(s, 'pushKeys')).toHaveLength(0)
  })

  it('agent keys are limited to 10 per person and site', async () => {
    const s = await setup()
    const codes: string[] = []
    for (let i = 0; i < 12; i++) codes.push(await outcome(s.as.owner.mutation(api.agent.createKey, { ...SITE, label: `k${i}` })))
    expect(codes.filter((c) => c === 'ok')).toHaveLength(10)
  })

  it('sites.create (admin) refuses a bad address, name, URL, locale, currency and time zone', async () => {
    const s = await setup()
    const base = { slug: 'neue-seite', name: 'Neue Seite', url: 'https://example.com' }
    const bad: Record<string, unknown>[] = [
      { slug: 'A' }, { slug: 'a' }, { slug: 'a/b' }, { slug: 'restaurant' }, { slug: '../x' }, { slug: 'x'.repeat(50) }, { name: '' }, { name: 'x'.repeat(101) },
      { url: 'javascript:alert(1)' }, { url: 'http://localhost' }, { url: 'http://169.254.169.254' }, { url: 'not a url' },
      { locales: [] }, { locales: ['de', 'de'] }, { locales: ['d'] }, { locales: ['not a locale'] }, { locales: ['de/../en'] }, { currency: 'ZZZ' }, { timeZone: 'Mars/Base' },
    ]
    for (const over of bad) expect([JSON.stringify(over), await outcome(s.as.admin.mutation(api.sites.create, { ...base, ...over } as never))]).toEqual([JSON.stringify(over), expect.stringMatching(/^(INVALID|SLUG_TAKEN)$/)])
    expect((await rows(s, 'sites')).length).toBe(2)
  })
})

// ---------------------------------------------------------------------------------------------
// 8. Sign-in rules
// ---------------------------------------------------------------------------------------------

describe('8. sign-in: who gets an account and a code', () => {
  it('mayJoin is true only for an admin address or an open invite', async () => {
    const s = await setup()
    vi.stubEnv('GINKO_ADMIN_EMAILS', ' Chef@Example.com , zweite@example.com ')
    const may = async (email: string) => s.t.query(internal.invites.mayJoin, { email })
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'gast@example.com', role: 'staff', grants: [] })
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'alt@example.com', role: 'staff', grants: [] })
    const old = (await rows(s, 'invites')).find((i) => i.email === 'alt@example.com')!
    await s.t.run((ctx) => ctx.db.patch(old._id, { expiresAt: Date.now() - 1 }))
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'benutzt@example.com', role: 'staff', grants: [] })
    await as(s, 'u-neu', 'benutzt@example.com').mutation(api.invites.accept, { token: await tokenMailedTo(s, 'benutzt@example.com') }).catch(() => undefined)
    const used = (await rows(s, 'invites')).find((i) => i.email === 'benutzt@example.com')!
    await s.t.run((ctx) => ctx.db.patch(used._id, { acceptedAt: Date.now() }))
    const got = {
      invited: await may('gast@example.com'), invitedUpper: await may(' GAST@Example.com '), expired: await may('alt@example.com'), accepted: await may('benutzt@example.com'),
      stranger: await may('fremd@example.com'), plusAlias: await may('gast+x@example.com'), twoAddresses: await may('gast@example.com,evil@example.com'),
      newline: await may('gast@example.com\nbcc: evil@example.com'), domainOnly: await may('@example.com'), empty: await may(''),
      admin: await may('chef@example.com'), adminUpper: await may('ZWEITE@EXAMPLE.COM'), sqlish: await may("x' OR '1'='1"),
    }
    expect(got).toEqual({
      invited: true, invitedUpper: true, expired: false, accepted: false, stranger: false, plusAlias: false, twoAddresses: false,
      newline: false, domainOnly: false, empty: false, admin: true, adminUpper: true, sqlish: false,
    })
  })

  it('without GINKO_ADMIN_EMAILS an empty list does not admit an empty address', async () => {
    const s = await setup()
    vi.stubEnv('GINKO_ADMIN_EMAILS', ',, ,')
    expect(await s.t.query(internal.invites.mayJoin, { email: '' })).toBe(false)
    expect(await s.t.query(internal.invites.mayJoin, { email: '  ' })).toBe(false)
  })

  it('queueCode sends a code only to a known account, an admin address or an open invite, and to exactly that address', async () => {
    const s = await setup()
    vi.stubEnv('GINKO_ADMIN_EMAILS', 'chef@example.com')
    await s.as.owner.mutation(api.invites.create, { ...SITE, email: 'gast@example.com', role: 'staff', grants: [] })
    const targets = ['gast@example.com', 'chef@example.com', 'wirtin@example.com', 'fremd-ohne-einladung@example.com', 'gast+x@example.com', 'gast@example.com,evil@example.com', 'gast@example.com\nbcc: evil@example.com', 'GAST@example.com ']
    for (const to of targets) await s.t.mutation(internal.mail.queueCode, { to, otp: '123456' })
    const codes = (await rows2(s)).filter((m) => m.subject === 'Dein Anmeldecode').map((m) => m.to).sort()
    expect(codes).toEqual(['chef@example.com', 'gast@example.com', 'gast@example.com', 'wirtin@example.com'])
  })

  it('a deleted account loses the right to a code, and an account with no invite and no admin listing gets none', async () => {
    const s = await setup()
    await s.as.admin.mutation(api.invites.create, { ...SITE, email: 'neu@example.com', role: 'owner', grants: [] })
    await as(s, 'u-neu', 'neu@example.com').mutation(api.invites.accept, { token: await tokenMailedTo(s, 'neu@example.com') })
    await as(s, 'u-neu', 'neu@example.com').mutation(api.account.deleteAccount, {})
    const before = (await rows2(s)).length
    await s.t.mutation(internal.mail.queueCode, { to: 'neu@example.com', otp: '123456' })
    expect((await rows2(s)).length).toBe(before)
  })

  it('the code settings: 6 digits, 5 minutes, 3 wrong codes (allowedAttempts), sign-up only through the invite/admin gate', async () => {
    // The Better Auth HTTP routes need request metadata that convex-test does not provide, so the settings are pinned from source.
    // Better Auth 1.7.6 (email-otp/routes.mjs atomicVerifyOTP): usedAttempts >= allowedAttempts -> TOO_MANY_ATTEMPTS, i.e. 3 wrong
    // guesses are answered "invalid"; from the 4th try on the code is locked, also for the right code.
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../convex/auth.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/emailOTP:\s*\{\s*otpLength:\s*6,\s*expiresIn:\s*5\s*\*\s*60,\s*allowedAttempts:\s*3\s*\}/)
    expect(source).toMatch(/beforeUserCreate[\s\S]*internal\.invites\.mayJoin[\s\S]*allowed:\s*false/)
    const mail = readFileSync(new URL('../convex/mail.ts', import.meta.url), 'utf8')
    expect(mail).toMatch(/known\s*&&\s*!\(await ctx\.runQuery\(internal\.invites\.mayJoin/)
    expect(mail).toMatch(/CODE_LIFETIME_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000\b/)
  })
})

const rows2 = (s: S) => s.t.run((ctx) => ctx.db.query('outbox').collect())
