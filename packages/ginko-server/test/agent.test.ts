// The agent door (SPEC 16): what a person's assistant can do with their key, and what it must not.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Schema } from '@lupinum/ginko/internal'
import type { Id } from '../convex/_generated/dataModel'
import { firstPage, opId, setup, upload } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>
type ToolAnswer = { content: { type: 'text'; text: string }[]; isError: boolean }

let rpcId = 0
async function rpc(s: Setup, key: string, method: string, params?: Record<string, unknown>) {
  const response = await s.t.fetch('/mcp', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
  })
  return { status: response.status, body: (await response.json()) as { result?: any; error?: { message: string } } }
}

async function call(s: Setup, key: string, name: string, args: Record<string, unknown> = {}) {
  const answer = (await rpc(s, key, 'tools/call', { name, arguments: args })).body.result as ToolAnswer
  const data = answer.content[1] ? JSON.parse(answer.content[1].text) : undefined
  return { text: answer.content[0]!.text, data, isError: answer.isError }
}

async function keyOf(s: Setup, person: 'owner' | 'cook') {
  return (await s.as[person].mutation(api.agent.createKey, { site: 'restaurant', label: 'Claude Code' })).key
}

async function notices(s: Setup) {
  const bundle = await (await s.t.fetch('/bundle/restaurant?format=3')).json() as { bricks: { notices: { items: { id: string; data: { text: string } }[] } } }
  return bundle.bricks.notices.items.map((i) => i.data.text)
}

describe('agent door', () => {
  it('the owner sets "Heute ausgebucht" with no arguments; the history says "via agent"; ginko_undo takes it back', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    expect((await rpc(s, key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).body.result.protocolVersion).toBe('2025-06-18')

    const before = await notices(s)
    const done = await call(s, key, 'task_notices_soldOut')
    expect(done.isError).toBe(false)
    expect(await notices(s)).toHaveLength(before.length + 1)

    const history = await call(s, key, 'ginko_history', { limit: 1 })
    expect(history.data[0]).toMatchObject({ kind: 'create', via: 'agent', undoable: true })
    const undone = await call(s, key, 'ginko_undo', { change: history.data[0].change })
    expect(undone.isError).toBe(false)
    expect(await notices(s)).toEqual(before)
    // The answer of the task already names the change to undo, and history stops offering it once undone.
    expect(done.data.change).toBe(history.data[0].change)
    expect((await call(s, key, 'ginko_history', { limit: 2 })).data[1]).toMatchObject({ kind: 'create', undoable: false })
  })

  // Wrong behaviour caught: a host that retries a write after a lost answer makes a second entry.
  it('the same request_id sent twice creates one entry and answers the same', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const before = await notices(s)
    const first = await call(s, key, 'task_notices_soldOut', { request_id: 'retry-1' })
    const again = await call(s, key, 'task_notices_soldOut', { request_id: 'retry-1' })
    expect(first.isError).toBe(false)
    expect(again).toEqual(first)
    expect(await notices(s)).toHaveLength(before.length + 1)
  })

  // Wrong behaviour caught: a German field name (a key Convex refuses) failed inside runMutation, and the assistant
  // was told "Try again later", so it retried the same call forever.
  it('a name Convex refuses is named in the answer', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    expect(await call(s, key, 'task_notices_soldOut', { 'Überschrift': 'x' })).toEqual({
      text: 'The name “Überschrift” is not allowed: names use ASCII letters, digits and signs and do not start with $.',
      data: undefined,
      isError: true,
    })
  })

  it('a price in euros is stored in cents and the change names the key', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const done = await call(s, key, 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 19.9 })
    expect(done.isError).toBe(false)
    const [entry, change] = await s.t.run(async (ctx) => [
      await ctx.db.get(s.entries['menu-schnitzel']!),
      (await ctx.db.query('changes').order('desc').first())!,
    ])
    expect(entry!.data.price).toEqual({ amount: 1990 })
    expect(change).toMatchObject({ via: 'agent', actor: 'u-wirtin' })
    const listed = await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage })
    expect(listed.page[0]).toMatchObject({ who: { email: 'wirtin@example.com' }, agent: 'Claude Code' })
  })

  it('the cook\'s key sees only the menu and lunch tasks and cannot run another task', async () => {
    const s = await setup()
    const key = await keyOf(s, 'cook')
    const tools = (await rpc(s, key, 'tools/list')).body.result.tools as { name: string }[]
    const taskTools = tools.map((t) => t.name).filter((n) => n.startsWith('task_'))
    expect(taskTools.length).toBeGreaterThan(0)
    expect(taskTools.every((n) => n.startsWith('task_menu_') || n.startsWith('task_lunch_'))).toBe(true)
    const before = await notices(s)
    const refused = await call(s, key, 'task_notices_soldOut')
    expect(refused.isError).toBe(true)
    expect(await notices(s)).toEqual(before)
  })

  it('removing needs confirm: true, so an assistant cannot delete by guessing', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const refused = await call(s, key, 'task_menu_remove', { entry: s.entries['menu-schnitzel'] })
    expect(refused).toMatchObject({ isError: true })
    const entry = await s.t.run(async (ctx) => ctx.db.get(s.entries['menu-schnitzel']!))
    expect(entry!.deletedAt).toBeUndefined()
  })

  it('a revoked key, a key of someone who left, and a wrong key all get 401', async () => {
    const s = await setup()
    const revoked = await s.as.owner.mutation(api.agent.createKey, { site: 'restaurant', label: 'alt' })
    await s.as.owner.mutation(api.agent.revokeKey, { site: 'restaurant', key: revoked.id })
    expect((await rpc(s, revoked.key, 'tools/list')).status).toBe(401)

    const cook = await keyOf(s, 'cook')
    await s.t.run(async (ctx) => {
      const member = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', 'u-koch').eq('site', s.site)).unique()
      await ctx.db.delete(member!._id)
    })
    expect((await rpc(s, cook, 'tools/list')).status).toBe(401)
    expect((await rpc(s, `ginko_agent_${'a'.repeat(32)}`, 'tools/list')).status).toBe(401)
  })

  it('the 61st call in a minute is RATE_LIMITED', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    for (let i = 0; i < 60; i++) expect((await rpc(s, key, 'ping')).status).toBe(200)
    expect((await rpc(s, key, 'ping')).status).toBe(429)
  })
})

// ---- The tool catalog beyond the task tools: search, drafts, translation, files, links, versions, proposals. ----

const names = async (s: Setup, key: string) => ((await rpc(s, key, 'tools/list')).body.result.tools as { name: string }[]).map((t) => t.name)
const saveOwner = (s: Setup, entry: Id<'entries'>, fields: Record<string, unknown>, baseRev: number) =>
  s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry, baseRev, fields, sentence: 'Test' }) as Promise<{ change: string; rev: number }>
const entryRow = (s: Setup, id: Id<'entries'>) => s.t.run((ctx) => ctx.db.get(id))
const patchSchema = (s: Setup, edit: (schema: Schema) => void) => s.t.run(async (ctx) => {
  const schema = (await ctx.db.get(s.site))!.schema as Schema
  edit(schema)
  await ctx.db.patch(s.site, { schema })
})

describe('agent door: tool catalog', () => {
  it('a staff key lists only the tools it may use: no draft without drafts, no revert or translate without an edit task', async () => {
    const s = await setup()
    const cook = await keyOf(s, 'cook')
    const plain = await names(s, cook)
    expect(plain).toContain('ginko_revert')
    expect(plain).not.toContain('ginko_draft')

    // Only "Gericht hinzufügen" is left, and menu has drafts now.
    await s.t.run(async (ctx) => {
      const member = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', 'u-koch').eq('site', s.site)).unique()
      await ctx.db.patch(member!._id, { grants: ['menu.add'] })
    })
    await patchSchema(s, (schema) => { (schema.bricks.menu as { drafts?: boolean }).drafts = true })
    const narrow = await names(s, cook)
    expect(narrow).toContain('ginko_draft')
    expect(narrow).not.toContain('ginko_revert')
    expect(narrow).not.toContain('ginko_translate')
    expect(await names(s, await keyOf(s, 'owner'))).toContain('ginko_draft')
  })

  // Wrong behaviour caught: the host cannot tell a read from a write, or takes an overwrite or undo for an additive change
  // and skips asking (MCP: destructiveHint false means only additive updates); or a write offers no retry key.
  it('marks reads read-only, only create tasks and drafts additive, every other write destructive, and offers request_id on every write', async () => {
    const s = await setup()
    await patchSchema(s, (schema) => { (schema.bricks.menu as { drafts?: boolean }).drafts = true })
    const tools = (await rpc(s, await keyOf(s, 'owner'), 'tools/list')).body.result.tools as { name: string; inputSchema: { properties: Record<string, unknown> }; annotations: Record<string, boolean> }[]
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]))
    const read = { readOnlyHint: true, openWorldHint: false }
    const add = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    const write = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    expect([hints.ginko_overview, hints.ginko_read, hints.ginko_search, hints.ginko_history, hints.ginko_version_at, hints.ginko_proposals]).toEqual(Array(6).fill(read))
    expect([hints.task_notices_soldOut, hints.ginko_draft]).toEqual(Array(2).fill(add))
    expect([hints.ginko_undo, hints.ginko_revert, hints.ginko_translate, hints.task_menu_price, hints.task_menu_remove]).toEqual(Array(5).fill(write))
    const retryKey = tools.filter((t) => 'request_id' in t.inputSchema.properties).map((t) => t.name)
    expect(retryKey.sort()).toEqual(tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name).sort())
  })

  it('ginko_search finds a dish by a word spelled without its umlaut and shows a snippet', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const found = await call(s, key, 'ginko_search', { query: 'KUERBISCREMESUPPE' })
    expect(found.isError).toBe(false)
    expect(found.data).toHaveLength(1)
    expect(found.data[0]).toMatchObject({ brick: 'lunch', entry: s.entries.lunch })
    expect(found.data[0].snippet).toContain('Kürbiscremesuppe mit Kernöl')
    expect((await call(s, key, 'ginko_search', { query: 'Kuerbiscremesuppe', brick: 'events' })).data).toEqual([])
  })

  it('propose: true makes an owner\'s task call a proposal and writes nothing', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const entry = s.entries['menu-schnitzel']!
    const changes = (await s.t.run((ctx) => ctx.db.query('changes').collect())).length
    const done = await call(s, key, 'task_menu_price', { entry, price: 25, propose: true })
    expect(done).toMatchObject({ isError: false, text: 'Proposed, waiting for approval.' })
    expect((await entryRow(s, entry))!.data.price).toEqual({ amount: 2190 })
    expect(await s.t.run((ctx) => ctx.db.query('changes').collect())).toHaveLength(changes)
    expect(await s.t.run((ctx) => ctx.db.query('proposals').collect())).toMatchObject([{ status: 'open', via: 'agent', author: 'u-wirtin' }])
    expect((await rpc(s, key, 'tools/list')).body.result.tools.find((t: { name: string }) => t.name === 'task_menu_price').inputSchema.properties.propose.type).toBe('boolean')
  })

  it('ginko_translate refuses the main language and saves a foreign one without touching the main text', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const entry = s.entries['menu-schnitzel']!
    const refused = await call(s, key, 'ginko_translate', { entry, locale: 'de', fields: { name: 'Schnitzel' } })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('main language')
    expect((await call(s, key, 'ginko_translate', { entry, locale: 'en', fields: { price: 3 } })).isError).toBe(true)

    const done = await call(s, key, 'ginko_translate', { entry, locale: 'en', fields: { name: 'Veal schnitzel' } })
    expect(done.isError).toBe(false)
    expect((await entryRow(s, entry))!.data.name).toEqual({ de: 'Wiener Schnitzel vom Kalb', en: 'Veal schnitzel' })
    expect((await s.t.run((ctx) => ctx.db.query('changes').order('desc').first()))).toMatchObject({ via: 'agent', fields: ['name'] })
  })

  it('ginko_read in English marks a translation as stale once the German text changed', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const entry = s.entries['menu-schnitzel']!
    await call(s, key, 'ginko_translate', { entry, locale: 'en', fields: { name: 'Veal schnitzel' } })
    expect((await call(s, key, 'ginko_read', { brick: 'menu', locale: 'en' })).data.stale?.[entry]).toBeUndefined()
    await saveOwner(s, entry, { name: { de: 'Schnitzel Wiener Art', en: 'Veal schnitzel' } }, 2)
    const read = await call(s, key, 'ginko_read', { brick: 'menu', locale: 'en' })
    expect(read.data.stale[entry]).toEqual(['name'])
  })

  // Wrong behaviour caught: an answer limit below the entry limit, so the assistant cannot read an entry the Studio saved.
  it('ginko_read returns a legal text of 280 KB, which the Studio can save', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    await s.t.run(async (ctx) => {
      const site = (await ctx.db.get(s.site))!
      const schema = site.schema as { bricks: { legal: { fields: { imprint: { max?: number } } } } }
      schema.bricks.legal.fields.imprint.max = 300_000
      await ctx.db.patch(s.site, { schema })
    })
    await s.as.owner.mutation(api.entries.save, { site: 'restaurant', opId: opId(), entry: s.entries.legal!, baseRev: 1, fields: { imprint: { de: `${'Impressum '.repeat(28_000)}Ende` } } })
    const read = await call(s, key, 'ginko_read', { brick: 'legal' })
    expect(read.isError).toBe(false)
    expect(JSON.stringify(read.data)).toContain('Ende')
  })

  it('ginko_draft creates a draft that is not on the website', async () => {
    const s = await setup()
    await patchSchema(s, (schema) => { (schema.bricks.events as { drafts?: boolean }).drafts = true })
    const key = await keyOf(s, 'owner')
    const done = await call(s, key, 'ginko_draft', { brick: 'events', fields: { title: 'Erntedank', when: { from: '2026-11-20', to: '2026-11-20' }, description: 'Mit Musik.' } })
    expect(done.isError).toBe(false)
    expect(await entryRow(s, done.data.entry)).toMatchObject({ state: 'draft', data: { title: { de: 'Erntedank' } } })
    const bundle = await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json() as { bricks: { events: { items: { id: string }[] } } }
    expect(bundle.bricks.events.items.map((i) => i.id)).not.toContain(done.data.entry)
  })

  it('ginko_file_usage names the entry that shows the image', async () => {
    const s = await setup()
    const file = await upload(s, { type: 'image/jpeg', content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]), name: 'foto.jpg', ready: false })
    await s.t.run(async (ctx) => ctx.db.patch(file, { status: 'ready', processedId: (await ctx.db.get(file))!.storageId }))
    const created = await s.as.owner.mutation(api.entries.create, {
      site: 'restaurant', opId: opId(), brick: 'events',
      data: { title: { de: 'Weinabend' }, when: { from: '2026-11-01', to: '2026-11-02' }, description: { de: 'hi' }, image: { file, alt: { de: 'Wein' } } },
    }) as { entry: Id<'entries'> }
    const usage = await call(s, await keyOf(s, 'owner'), 'ginko_file_usage', { file })
    expect(usage.isError).toBe(false)
    expect(usage.data.usedIn).toEqual([{ entry: created.entry, brick: 'events', label: 'Weinabend', paths: ['image'], missingAlt: true }])
  })

  it('ginko_check_links reports a broken internal link and an unsafe one, with entry and field', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const legal = s.entries.legal!
    expect((await call(s, key, 'ginko_check_links')).data).toEqual([])
    await saveOwner(s, legal, { imprint: { de: 'Siehe [Karte](/gibt-es-nicht) und [Start](/).' } }, 1)
    await s.t.run(async (ctx) => {
      const row = (await ctx.db.get(legal))!
      await ctx.db.patch(legal, { data: { ...row.data, privacy: { de: '[Böse](javascript:void)' } } })
    })
    const links = (await call(s, key, 'ginko_check_links', { brick: 'legal' })).data
    expect(links).toMatchObject([
      { entry: legal, brick: 'legal', field: 'imprint', link: '/gibt-es-nicht', severity: 'error' },
      { entry: legal, brick: 'legal', field: 'privacy', link: 'javascript:void', severity: 'error' },
    ])
    expect((await call(s, key, 'ginko_check_links', { brick: 'menu' })).data).toEqual([])
  })

  it('with review on, ginko_revert becomes a proposal and the overview says so', async () => {
    const s = await setup()
    const entry = s.entries['menu-schnitzel']!
    const first = await saveOwner(s, entry, { price: { amount: 2300 } }, 1)
    await saveOwner(s, entry, { price: { amount: 2500 } }, first.rev)
    await s.t.run((ctx) => ctx.db.patch(s.site, { agentReview: true }))
    const key = await keyOf(s, 'owner')
    expect((await call(s, key, 'ginko_overview')).data.hint).toBe('Changes made with this key wait for approval.')

    // Wrong behaviour caught: the agent saw the old values but not what ginko_revert would change, as the Studio does.
    const version = await call(s, key, 'ginko_version_at', { entry, change: first.change })
    expect(version.data).toMatchObject({ fields: ['price'], data: { price: { amount: 2300 } }, diff: [{ field: 'price', before: { amount: 2500 }, after: { amount: 2300 } }] })
    const done = await call(s, key, 'ginko_revert', { entry, change: first.change })
    expect(done).toMatchObject({ isError: false, text: 'Proposed, waiting for approval.' })
    expect((await entryRow(s, entry))!.data.price).toEqual({ amount: 2500 })
  })

  it('with review on, ginko_undo cannot take back a live save past the review', async () => {
    const s = await setup()
    const entry = s.entries['menu-schnitzel']!
    const saved = await saveOwner(s, entry, { price: { amount: 2500 } }, 1)
    await s.t.run((ctx) => ctx.db.patch(s.site, { agentReview: true }))
    const undone = await call(s, await keyOf(s, 'owner'), 'ginko_undo', { change: saved.change })
    expect(undone).toMatchObject({ isError: true, text: expect.stringContaining('ginko_revert') })
    expect((await entryRow(s, entry))!.data.price).toEqual({ amount: 2500 })
  })

  it('ginko_proposals lists only the caller\'s own proposals, even for an owner who could see all', async () => {
    const s = await setup()
    const [owner, cook] = [await keyOf(s, 'owner'), await keyOf(s, 'cook')]
    await call(s, owner, 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 25, propose: true })
    await call(s, cook, 'task_menu_price', { entry: s.entries['menu-saibling'], price: 30, propose: true })
    const mine = await call(s, owner, 'ginko_proposals')
    expect(mine.data).toMatchObject([{ status: 'open', brick: 'menu', entry: s.entries['menu-schnitzel'], via: 'agent' }])
    expect(mine.text).toBe('1 proposals wait for approval.')
    expect((await call(s, cook, 'ginko_proposals', { status: 'open' })).data).toMatchObject([{ entry: s.entries['menu-saibling'] }])
    expect((await call(s, owner, 'ginko_proposals', { status: 'applied' })).data).toEqual([])
  })
})

describe('agent door: English for the model', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('ginko_history words a row with msg in English and keeps the German sentence of a row from before msg', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    await call(s, key, 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 19.9 })
    await call(s, key, 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 20.5 })
    const [newest, older] = (await call(s, key, 'ginko_history', { limit: 2 })).data as { change: string; sentence: string }[]
    expect(newest!.sentence).toBe('Price changed in “Wiener Schnitzel vom Kalb”')
    // A legacy row has the German sentence only; the model gets it as it is.
    await s.t.run((ctx) => ctx.db.patch(older!.change as Id<'changes'>, { msg: undefined, sentence: 'Preis von „Wiener Schnitzel vom Kalb“ geändert' }))
    const history = (await call(s, key, 'ginko_history', { limit: 2 })).data as { sentence: string }[]
    expect(history.map((h) => h.sentence)).toEqual(['Price changed in “Wiener Schnitzel vom Kalb”', 'Preis von „Wiener Schnitzel vom Kalb“ geändert'])
  })

  it('the digest mail lists a proposal in the language of its recipient', async () => {
    vi.stubEnv('GINKO_MAIL', 'outbox')
    vi.stubEnv('SITE_URL', 'https://ginko.test')
    const s = await setup()
    await s.t.run((ctx) => ctx.db.insert('userSettings', { user: 'u-wirtin', remindByMail: false, locale: 'en' }))
    await call(s, await keyOf(s, 'owner'), 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 25, propose: true })
    await s.t.mutation(internal.proposals.sendDigest, { site: s.site })
    const [mail] = await s.t.run((ctx) => ctx.db.query('outbox').collect())
    expect(mail!.text).toContain('Price changed in “Wiener Schnitzel vom Kalb”')
    expect(mail!.text).not.toContain('geändert')
  })
})

describe('sites.create: site settings', () => {
  const create = (s: Setup, args: Record<string, unknown>) => s.as.admin.mutation(api.sites.create, { slug: 'neue-seite', name: 'Neue Seite', url: 'https://neu.example', ...args })
  const code = async (call: Promise<unknown>) => ((await call.catch((e: { data?: { code?: string } }) => e)) as { data?: { code?: string } }).data?.code

  it('refuses an invalid currency, language or time zone and creates nothing', async () => {
    const s = await setup()
    expect(await code(create(s, { currency: 'EURO' }))).toBe('INVALID')
    expect(await code(create(s, { locales: ['de', 'DE'] }))).toBe('INVALID')
    expect(await code(create(s, { timeZone: 'Mars/Olympus' }))).toBe('INVALID')
    expect(await s.t.run((ctx) => ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', 'neue-seite')).unique())).toBeNull()
  })

  it('takes timeZone, locales and currency, and keeps the defaults without them', async () => {
    const s = await setup()
    await create(s, { slug: 'schweiz', timeZone: 'Europe/Zurich', locales: ['en', 'de'], currency: 'CHF' })
    await create(s, { slug: 'standard' })
    const schemaOf = async (slug: string) => (await s.t.run((ctx) => ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()))!.schema as Schema
    expect(await schemaOf('schweiz')).toMatchObject({ timeZone: 'Europe/Zurich', locales: ['en', 'de'], currency: 'CHF' })
    expect(await schemaOf('standard')).toMatchObject({ timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR' })
  })
})
