// The agent door (SPEC 16): what a person's assistant can do with their key, and what it must not.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import type { Schema } from '@lupinum/ginko/internal'
import type { Id } from '../convex/_generated/dataModel'
import { suggest } from '../convex/lib/agentTools'
import { errorOf, firstPage, opId, setup, upload, withFacts } from './setup'

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
    const done = await call(s, key, 'task_notices_soldOut', { publish: true })
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
    const first = await call(s, key, 'task_notices_soldOut', { publish: true, request_id: 'retry-1' })
    const again = await call(s, key, 'task_notices_soldOut', { publish: true, request_id: 'retry-1' })
    expect(first.isError).toBe(false)
    expect(again).toEqual(first)
    expect(await notices(s)).toHaveLength(before.length + 1)
  })

  // Wrong behaviour caught: a German field name (a key Convex refuses) failed inside runMutation, and the assistant
  // was told "Try again later", so it retried the same call forever.
  it('a name Convex refuses is named in the answer', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    expect(await call(s, key, 'task_notices_soldOut', { publish: true, 'Überschrift': 'x' })).toEqual({
      text: 'The name “Überschrift” is not allowed: names use ASCII letters, digits and signs and do not start with $.',
      data: undefined,
      isError: true,
    })
  })

  // Wrong behaviour caught: an assistant's change goes online although the person never asked for it (SPEC 15, D60),
  // or the answer claims the website shows it.
  it('without publish a new entry is a draft and a change waits unpublished, and the answers say so', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const before = await notices(s)
    const made = await call(s, key, 'task_notices_soldOut')
    expect(made.text).toContain('Saved as a draft, not on the website yet.')
    const price = await call(s, key, 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 25 })
    expect(price.text).toContain('Not on the website yet')
    expect(await notices(s)).toEqual(before)
    expect((await s.t.run((ctx) => ctx.db.get(s.entries['menu-schnitzel']!)))!.data.price).toEqual({ amount: 2190 })
  })

  it('a price in euros is stored in cents and the change names the key', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const done = await call(s, key, 'task_menu_price', { publish: true, entry: s.entries['menu-schnitzel'], price: 19.9 })
    expect(done.isError).toBe(false)
    const [entry, change] = await s.t.run(async (ctx) => [
      await ctx.db.get(s.entries['menu-schnitzel']!),
      (await ctx.db.query('changes').order('desc').first())!,
    ])
    expect(entry!.data.price).toEqual({ amount: 1990 })
    expect(change).toMatchObject({ via: 'agent', actor: 'u-wirtin' })
    const listed = await s.as.owner.query(api.changes.list, { site: 'restaurant', paginationOpts: firstPage })
    expect(listed.page[0]).toMatchObject({ who: { self: true }, agent: 'Claude Code' })
  })

  // Wrong behaviour caught: from the day of a planned price on, the assistant's new price was stored next to the spent
  // plan, so the website kept showing the planned price while the answer said the new one was live.
  it('a price set on or after the day of a planned price replaces the spent plan', async () => {
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'))
    const s = await setup()
    const done = await call(s, await keyOf(s, 'owner'), 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 23.5, publish: true })
    expect(done.text).toContain('Live on the website in about a minute.')
    const data = (await entryRow(s, s.entries['menu-schnitzel']!))!.data
    expect([data.price, data.nextPrice, data.priceFrom]).toEqual([{ amount: 2350 }, undefined, undefined])
  })

  // Wrong behaviour caught: the door put today over a closure set for tomorrow when the assistant changed only the
  // reason, so the site closed today and tomorrow's closure was gone; the tool also offered today as the default.
  it('"Heute geschlossen" with only a reason keeps a closure set for tomorrow', async () => {
    const s = await setup()
    const hours = (await s.t.run((ctx) => ctx.db.get(s.entries.hours!)))!
    await s.t.run((ctx) => ctx.db.patch(s.entries.hours!, { data: { ...hours.data, closedOn: '2026-10-09' } }))
    const key = await keyOf(s, 'owner')
    const tools = (await rpc(s, key, 'tools/list')).body.result.tools as { name: string; inputSchema: { properties: Record<string, { default?: unknown }> } }[]
    expect(tools.find((t) => t.name === 'task_hours_closedToday')!.inputSchema.properties.closedOn!.default).toBe('2026-10-09')
    expect((await call(s, key, 'task_hours_closedToday', { publish: true, closedNote: 'Wegen einer Hochzeit' })).isError).toBe(false)
    expect((await s.t.run((ctx) => ctx.db.get(s.entries.hours!)))!.data).toMatchObject({ closedOn: '2026-10-09' })
  })

  it('the cook\'s key sees only the menu and lunch tasks and cannot run another task', async () => {
    const s = await setup()
    const key = await keyOf(s, 'cook')
    const tools = (await rpc(s, key, 'tools/list')).body.result.tools as { name: string }[]
    const taskTools = tools.map((t) => t.name).filter((n) => n.startsWith('task_'))
    expect(taskTools.length).toBeGreaterThan(0)
    expect(taskTools.every((n) => n.startsWith('task_menu_') || n.startsWith('task_lunch_'))).toBe(true)
    const before = await notices(s)
    const refused = await call(s, key, 'task_notices_soldOut', { publish: true })
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
  s.as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), entry, baseRev, fields, sentence: 'Test' }) as Promise<{ change: string; rev: number }>
const entryRow = (s: Setup, id: Id<'entries'>) => s.t.run((ctx) => ctx.db.get(id))
const grantCook = (s: Setup, grants: string[]) => s.t.run(async (ctx) => {
  const member = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', 'u-koch').eq('site', s.site)).unique()
  await ctx.db.patch(member!._id, { grants })
})
const patchSchema = (s: Setup, edit: (schema: Schema) => void) => s.t.run(async (ctx) => {
  const schema = (await ctx.db.get(s.site))!.schema as Schema
  edit(schema)
  await ctx.db.patch(s.site, { schema })
})

describe('agent door: tool catalog', () => {
  it('a staff key lists only the tools it may use: no draft without a create task, no revert or translate without an edit or create task', async () => {
    const s = await setup()
    const cook = await keyOf(s, 'cook')
    const plain = await names(s, cook)
    expect(plain).toContain('ginko_revert')

    // Only "Gericht hinzufügen" is left. Revert and translate stay for the dishes the cook adds.
    await grantCook(s, ['menu.add'])
    const narrow = await names(s, cook)
    expect(narrow).toContain('ginko_draft')
    expect(narrow).toContain('ginko_revert')
    expect(narrow).toContain('ginko_translate')
    expect(await names(s, await keyOf(s, 'owner'))).toContain('ginko_draft')

    // Only "Gericht entfernen": nothing to change.
    await grantCook(s, ['menu.remove'])
    const removeOnly = await names(s, cook)
    expect(removeOnly).not.toContain('ginko_revert')
    expect(removeOnly).not.toContain('ginko_translate')
  })

  // Wrong behaviour caught: the door decides the creator rule on its own (or not at all), so an assistant translates
  // the events of others with the cook's key, or cannot translate the event the cook just added.
  it("a key translates the entries its person created with a create task, never other people's", async () => {
    const s = await setup()
    await grantCook(s, ['events.add'])
    const key = await keyOf(s, 'cook')
    const made = await call(s, key, 'task_events_add', { publish: true, title: 'Weinabend', when: { from: '2026-10-25', to: '2026-10-25' }, description: 'Mit Musik.' })
    expect(made.isError).toBe(false)
    const own = await call(s, key, 'ginko_translate', { publish: true, entry: made.data.entry, locale: 'en', fields: { title: 'Wine evening' } })
    expect(own.isError).toBe(false)
    expect((await entryRow(s, made.data.entry))!.data.title).toEqual({ de: 'Weinabend', en: 'Wine evening' })
    const others = await call(s, key, 'ginko_translate', { publish: true, entry: s.entries.weinabend, locale: 'en', fields: { title: 'Wine evening' } })
    expect(others.isError).toBe(true)
  })

  // Wrong behaviour caught: the host cannot tell a read from a write, or takes an overwrite or undo for an additive change
  // and skips asking (MCP: destructiveHint false means only additive updates); or a write offers no retry key.
  it('marks reads read-only, only create tasks and drafts additive, every other write destructive, and offers request_id on every write', async () => {
    const s = await setup()
    const tools = (await rpc(s, await keyOf(s, 'owner'), 'tools/list')).body.result.tools as { name: string; inputSchema: { properties: Record<string, unknown> }; annotations: Record<string, boolean> }[]
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]))
    const read = { readOnlyHint: true, openWorldHint: false }
    const add = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    const write = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    expect([hints.ginko_overview, hints.ginko_read, hints.ginko_search, hints.ginko_history, hints.ginko_version_at, hints.ginko_proposals]).toEqual(Array(6).fill(read))
    expect([hints.task_notices_soldOut, hints.ginko_draft]).toEqual(Array(2).fill(add))
    expect([hints.ginko_undo, hints.ginko_revert, hints.ginko_translate, hints.task_menu_price, hints.task_menu_remove, hints.ginko_write, hints.ginko_import]).toEqual(Array(7).fill(write))
    expect([hints.ginko_schema, hints.ginko_create]).toEqual([read, add])
    // ginko_upload fetches from outside, and only adds a library file: a retry makes a duplicate the Studio marks, so it takes no request_id.
    expect(hints.ginko_upload).toEqual({ readOnlyHint: false, destructiveHint: false, openWorldHint: true })
    const retryKey = tools.filter((t) => 'request_id' in t.inputSchema.properties).map((t) => t.name)
    expect(retryKey.sort()).toEqual(tools.filter((t) => !t.annotations.readOnlyHint && t.name !== 'ginko_upload').map((t) => t.name).sort())
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

  // Wrong behaviour caught: "show me first" without publish lands as unpublished changes, so nobody is asked (D60).
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
    const refused = await call(s, key, 'ginko_translate', { publish: true, entry, locale: 'de', fields: { name: 'Schnitzel' } })
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('main language')
    expect((await call(s, key, 'ginko_translate', { publish: true, entry, locale: 'en', fields: { price: 3 } })).isError).toBe(true)

    const done = await call(s, key, 'ginko_translate', { publish: true, entry, locale: 'en', fields: { name: 'Veal schnitzel' } })
    expect(done.isError).toBe(false)
    expect((await entryRow(s, entry))!.data.name).toEqual({ de: 'Wiener Schnitzel vom Kalb', en: 'Veal schnitzel' })
    expect((await s.t.run((ctx) => ctx.db.query('changes').order('desc').first()))).toMatchObject({ via: 'agent', fields: ['name'] })
  })

  // Wrong behaviour caught: the assistant reads the outdated English name as missing, or not at all; or it is told
  // to fix the English text of a draft that ginko_read does not even list.
  it('ginko_read in English marks a translation as stale once the German text changed, and still delivers it', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const entry = s.entries['menu-schnitzel']!
    await call(s, key, 'ginko_translate', { publish: true, entry, locale: 'en', fields: { name: 'Veal schnitzel' } })
    expect((await call(s, key, 'ginko_read', { brick: 'menu', locale: 'en' })).data.stale?.[entry]).toBeUndefined()
    await saveOwner(s, entry, { name: { de: 'Schnitzel Wiener Art', en: 'Veal schnitzel' } }, 2)
    const read = await call(s, key, 'ginko_read', { brick: 'menu', locale: 'en' })
    expect(read.data.stale[entry]).toEqual(['name'])
    const item = read.data.items.find((i: { id: string }) => i.id === entry)
    expect([item.data.name, item.fallback]).toEqual(['Veal schnitzel', []])

    // Taken back to a draft, it is off the website: neither its item nor its outdated text is reported.
    const lifeRev = (await s.t.run((ctx) => ctx.db.get(entry)))!.lifeRev
    await s.as.owner.mutation(api.entries.unpublish, { site: 'restaurant', opId: opId(), entry, lifeRev })
    const drafted = await call(s, key, 'ginko_read', { brick: 'menu', locale: 'en' })
    expect(drafted.data.items.map((i: { id: string }) => i.id)).not.toContain(entry)
    expect(drafted.data.stale?.[entry]).toBeUndefined()
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
    await s.as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), entry: s.entries.legal!, baseRev: 1, fields: { imprint: { de: `${'Impressum '.repeat(28_000)}Ende` } } })
    const read = await call(s, key, 'ginko_read', { brick: 'legal' })
    expect(read.isError).toBe(false)
    expect(JSON.stringify(read.data)).toContain('Ende')
  })

  it('ginko_draft creates a draft that is not on the website', async () => {
    const s = await setup()
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
      site: 'restaurant', opId: opId(), publish: {}, brick: 'events',
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

  // Wrong behaviour caught: a preview made for one actor and a revert made by another disagreed. A staff agent reverts
  // through the weekly task, which keeps this week; an owner or admin reverts in full, as the Studio does, week included.
  describe('ginko_version_at and ginko_revert agree per actor', () => {
    const lunchChanges = async () => {
      vi.setSystemTime(new Date('2026-10-16T08:00:00Z'))
      const s = await setup()
      const lunch = s.entries.lunch!
      const first = await s.as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), entry: lunch, baseRev: 1, fields: { note: { de: 'Alt' } } }) as { change: Id<'changes'>; rev: number }
      vi.setSystemTime(new Date('2026-10-17T06:00:00Z'))
      await s.as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), task: 'lunch.lunchWeek', entry: lunch, baseRev: first.rev, fields: { weekOf: '2026-10-19', note: { de: 'Neu' } } })
      return { s, lunch, first }
    }

    it('the cook\'s revert proposal writes exactly the fields of the cook\'s preview, without the week', async () => {
      const { s, lunch, first } = await lunchChanges()
      const cook = await keyOf(s, 'cook')
      const diff = (await call(s, cook, 'ginko_version_at', { entry: lunch, change: first.change })).data.diff as { field: string }[]
      expect(diff.map((d) => d.field)).toEqual(['note'])
      const done = await call(s, cook, 'ginko_revert', { entry: lunch, change: first.change })
      expect(done.isError).toBe(false)
      const proposals = await s.t.run((ctx) => ctx.db.query('proposals').collect())
      expect(proposals.map((p) => Object.keys(p.args.fields as object))).toEqual([diff.map((d) => d.field)])
    })

    it('the owner\'s preview includes the week and the owner\'s revert sets it back', async () => {
      const { s, lunch, first } = await lunchChanges()
      const owner = await keyOf(s, 'owner')
      const diff = (await call(s, owner, 'ginko_version_at', { entry: lunch, change: first.change })).data.diff as { field: string }[]
      expect(diff.map((d) => d.field).sort()).toEqual(['note', 'weekOf'])
      expect((await call(s, owner, 'ginko_revert', { entry: lunch, change: first.change })).isError).toBe(false)
      const data = (await entryRow(s, lunch))!.data
      expect([data.weekOf, data.note]).toEqual(['2026-10-05', { de: 'Alt' }])
    })
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

  // Wrong behaviour caught: the second call withdrew the first proposal, because both went through "Gericht
  // bearbeiten"; the price proposal was gone and nobody was told. A later call on the same field still replaces it.
  it('with review on, two edits of one dish with different fields both wait; the same field again replaces its proposal', async () => {
    const s = await setup()
    await s.t.run((ctx) => ctx.db.patch(s.site, { agentReview: true }))
    const key = await keyOf(s, 'owner')
    const entry = s.entries['menu-saibling']!
    const statuses = async () => (await s.t.run((ctx) => ctx.db.query('proposals').collect())).map((p) => p.status)
    await call(s, key, 'task_menu_edit', { publish: true, entry, price: 25 })
    await call(s, key, 'task_menu_edit', { publish: true, entry, description: 'Mit Erdäpfeln' })
    expect(await statuses()).toEqual(['open', 'open'])
    await call(s, key, 'task_menu_edit', { publish: true, entry, description: 'Mit Petersilerdäpfeln' })
    expect(await statuses()).toEqual(['open', 'withdrawn', 'open'])
  })

  it('ginko_proposals lists only the caller\'s own proposals, even for an owner who could see all', async () => {
    const s = await setup()
    const [owner, cook] = [await keyOf(s, 'owner'), await keyOf(s, 'cook')]
    await call(s, owner, 'task_menu_price', { publish: true, entry: s.entries['menu-schnitzel'], price: 25, propose: true })
    await call(s, cook, 'task_menu_price', { publish: true, entry: s.entries['menu-saibling'], price: 30, propose: true })
    const mine = await call(s, owner, 'ginko_proposals')
    expect(mine.data).toMatchObject([{ status: 'open', brick: 'menu', entry: s.entries['menu-schnitzel'], via: 'agent' }])
    expect(mine.text).toBe('1 proposals wait for approval.')
    expect((await call(s, cook, 'ginko_proposals', { status: 'open' })).data).toMatchObject([{ entry: s.entries['menu-saibling'] }])
    expect((await call(s, owner, 'ginko_proposals', { status: 'applied' })).data).toEqual([])
  })
})

describe('agent door: builder tools (owners and admins)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const schnitzel = (s: Setup) => entryRow(s, s.entries['menu-schnitzel']!)

  it('lists the builder tools for an owner and none for staff, whose call is refused', async () => {
    const s = await setup()
    const builder = ['ginko_schema', 'ginko_write', 'ginko_create', 'ginko_import', 'ginko_upload']
    expect(await names(s, await keyOf(s, 'owner'))).toEqual(expect.arrayContaining(builder))
    const cook = await keyOf(s, 'cook')
    expect((await names(s, cook)).filter((n) => builder.includes(n))).toEqual([])
    const refused = await call(s, cook, 'ginko_write', { publish: true, brick: 'menu', entry: s.entries['menu-schnitzel'], fields: { description: 'x' } })
    expect(refused).toMatchObject({ isError: true, text: 'The tool “ginko_write” does not exist or is not one of your tasks.' })
    expect((await call(s, cook, 'ginko_schema')).isError).toBe(true)
  })

  it('ginko_schema describes every field in the form ginko_write takes', async () => {
    const s = await setup()
    const [menu] = (await call(s, await keyOf(s, 'owner'), 'ginko_schema', { brick: 'menu' })).data
    expect(menu).toMatchObject({ brick: 'menu', kind: 'collection' })
    expect(menu.input.properties.price.type).toBe('number')
    expect(menu.input.properties.name.type).toBe('string')
    expect(menu.input.required).toContain('name')
  })

  // Wrong behaviour caught: an owner's assistant could only change the fields some task happens to cover.
  it('ginko_write changes any field in euros and names the entry in the Studio', async () => {
    const s = await setup()
    const done = await call(s, await keyOf(s, 'owner'), 'ginko_write', { brick: 'menu', entry: s.entries['menu-schnitzel'], fields: { price: 21.5, description: 'Mit Preiselbeeren' }, publish: true })
    expect(done.isError).toBe(false)
    expect((await schnitzel(s))!.data).toMatchObject({ price: { amount: 2150 }, description: { de: 'Mit Preiselbeeren' } })
    expect(done.text).toContain('To undo: ginko_undo with change')
    if (process.env.SITE_URL) expect(done.data.studio).toBe(`${process.env.SITE_URL.replace(/\/$/, '')}/s/restaurant/all/menu/${s.entries['menu-schnitzel']}`)
  })

  // Wrong behaviour caught: the assistant guesses field names ("preis") and retries the same wrong call.
  it.each([
    ['ginko_write', { brick: 'menu', entry: 'x', fields: { preis: 3 } }, '“preis” is not a field of “menu”. Did you mean “price”?'],
    ['ginko_write', { brick: 'menu', entry: 'x', fields: { descripton: 'x' } }, '“descripton” is not a field of “menu”. Did you mean “description”?'],
    ['ginko_create', { brick: 'notice', fields: { text: 'x' } }, 'There is no brick “notice”. Did you mean “notices”?'],
    ['ginko_create', { brick: 'menu', fields: { zzz: 1 } }, '“zzz” is not a field of “menu”. The fields are listed in ginko_schema.'],
    // Inside a list row too: the row's unknown name was dropped and the save reported success.
    ['ginko_write', { brick: 'lunch', fields: { days: [{ day: 'mon', gericht: 'Suppe' }] } }, '“days[0].gericht” is not a field of “lunch”. Did you mean “dish”?'],
  ])('%s %j names the closest key', async (tool, args, text) => {
    const s = await setup()
    expect(await call(s, await keyOf(s, 'owner'), tool, args)).toMatchObject({ isError: true, text })
  })

  it('ginko_create with publish makes a live entry', async () => {
    const s = await setup()
    const before = await notices(s)
    const done = await call(s, await keyOf(s, 'owner'), 'ginko_create', { brick: 'notices', fields: { text: 'Neue Karte ab Montag', until: '2099-01-01' }, publish: true })
    expect(done.isError).toBe(false)
    const after = await notices(s)
    expect(after).toHaveLength(before.length + 1)
    expect(after).toContain('Neue Karte ab Montag')
  })

  // Wrong behaviour caught: half an import saved (item 1 fails after item 0 was written), or a dry run that writes.
  it('ginko_import checks with dry_run, saves all or nothing, and names the failing item', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const before = { notices: await notices(s), schnitzel: (await schnitzel(s))!.data }
    const items = [
      { brick: 'menu', entry: s.entries['menu-schnitzel'], fields: { description: 'Neu' }, publish: true },
      { brick: 'notices', fields: { text: 'Ruhetag am Montag', until: '2099-01-01' }, publish: true },
    ]
    const dry = await call(s, key, 'ginko_import', { items, dry_run: true })
    expect(dry).toMatchObject({ isError: false, text: 'Dry run: all 2 items would be saved. Nothing was saved.' })
    expect(dry.data.map((r: { op: string }) => r.op)).toEqual(['write', 'create'])
    expect({ notices: await notices(s), schnitzel: (await schnitzel(s))!.data }).toEqual(before)

    const broken = await call(s, key, 'ginko_import', { items: [items[0], { brick: 'notices', fields: { txt: 'x' } }] })
    expect(broken).toMatchObject({ isError: true, text: 'items[1]: “txt” is not a field of “notices”. Did you mean “text”? Nothing of this import was saved.' })
    expect((await schnitzel(s))!.data).toEqual(before.schnitzel)

    const saved = await call(s, key, 'ginko_import', { items })
    expect(saved).toMatchObject({ isError: false, text: 'Saved 2 items (1 new, 1 changed). Each one is in ginko_history and can be undone there.' })
    // The main text changes; the English one stays and counts as outdated, as after a save in the Studio.
    expect((await schnitzel(s))!.data.description).toMatchObject({ de: 'Neu' })
    expect(await notices(s)).toContain('Ruhetag am Montag')
  })

  // Wrong behaviour caught: with review on, the import said "Saved" while nothing was on the website yet.
  it('ginko_import with review on says the items wait for approval, in the dry run too', async () => {
    const s = await setup()
    await s.t.run((ctx) => ctx.db.patch(s.site, { agentReview: true }))
    const key = await keyOf(s, 'owner')
    const items = [{ brick: 'menu', entry: s.entries['menu-schnitzel'], fields: { description: 'Neu' }, publish: true }, { brick: 'notices', fields: { text: 'Ruhetag', until: '2099-01-01' }, publish: true }]
    expect((await call(s, key, 'ginko_import', { items, dry_run: true })).text).toBe('Dry run: all 2 items would become proposals that wait for approval. Nothing was saved.')
    const done = await call(s, key, 'ginko_import', { items })
    expect(done.text).toBe('2 items became proposals that wait for approval; nothing of them is on the website yet (ginko_proposals lists them).')
    expect(await notices(s)).not.toContain('Ruhetag')
  })

  it('ginko_upload without url hands out a one-time address that takes a file once', async () => {
    const s = await setup()
    const done = await call(s, await keyOf(s, 'owner'), 'ginko_upload', { name: 'karte.pdf' })
    expect(done.isError).toBe(false)
    const path = (done.data.upload_url as string).slice((done.data.upload_url as string).indexOf('/upload?'))
    const post = () => s.t.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 karte' })
    const first = await post()
    expect(first.status).toBe(200)
    expect((await post()).status).toBe(403)
  })

  it('ginko_upload with url stores a public image and refuses an internal address before fetching', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const fetchMock = vi.fn(async () => new Response(png, { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const done = await call(s, key, 'ginko_upload', { url: 'https://images.example.com/team/foto.png' })
    expect(done).toMatchObject({ isError: false, data: { name: 'foto.png', image_field: { alt: '' } } })
    expect(await s.t.run((ctx) => ctx.db.get(done.data.file as Id<'uploads'>))).toMatchObject({ name: 'foto.png', mime: 'image/png', uploader: 'u-wirtin' })

    fetchMock.mockClear()
    const internalAddress = await call(s, key, 'ginko_upload', { url: 'https://169.254.169.254/latest/meta-data' })
    expect(internalAddress).toMatchObject({ isError: true, text: 'Only public https addresses can be fetched.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Wrong behaviour caught: a file host that answers application/octet-stream was refused, and a failed fetch cost a
  // ticket of the person's upload quota or ended in a generic error.
  it('ginko_upload takes the type from the name for a generic answer and counts nothing for a failed fetch', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const fetchMock = vi.fn(async () => new Response(png, { headers: { 'content-type': 'application/octet-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const s = await setup()
    const key = await keyOf(s, 'owner')
    const done = await call(s, key, 'ginko_upload', { url: 'https://files.example.com/download?id=7', name: 'fotos/team.png' })
    expect(done).toMatchObject({ isError: false, data: { name: 'team.png' } })
    expect(await s.t.run((ctx) => ctx.db.get(done.data.file as Id<'uploads'>))).toMatchObject({ mime: 'image/png' })

    const counted = async () => (await s.t.run((ctx) => ctx.db.query('rateWindows').collect())).filter((r) => r.kind === 'upload').reduce((sum, r) => sum + r.count, 0)
    const before = await counted()
    expect(before).toBe(1)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const failed = await call(s, key, 'ginko_upload', { url: 'https://files.example.com/gone.png' })
    expect(failed).toMatchObject({ isError: true })
    expect(failed.text).toContain('network error')
    expect(await counted()).toBe(before)
  })

  // Wrong behaviour caught: a file name with a quote ended the shell word of the curl line the assistant runs.
  it('ginko_upload without url quotes the local path for the shell and stores only the file name', async () => {
    const s = await setup()
    const done = await call(s, await keyOf(s, 'owner'), 'ginko_upload', { name: "Bilder/Romi's Praxis.jpg" })
    expect(done.data.curl).toContain("--data-binary @'Bilder/Romi'\\''s Praxis.jpg'")
    expect(done.data.curl).toContain("-H 'Content-Type: image/jpeg'")
    expect(done.data.upload_url).toContain(`name=${encodeURIComponent("Romi's Praxis.jpg")}`)
  })

  // Wrong behaviour caught: a body without Content-Length was read whole into memory, however large.
  it('ginko_upload stops reading a streamed image at the size limit and stores nothing', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    chunk.set([0x89, 0x50, 0x4e, 0x47])
    let sent = 0
    const endless = new ReadableStream<Uint8Array>({ pull(controller) { sent++; controller.enqueue(chunk) } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(endless, { headers: { 'content-type': 'image/png' } })))
    const s = await setup()
    const done = await call(s, await keyOf(s, 'owner'), 'ginko_upload', { url: 'https://images.example.com/huge.png' })
    expect(done.isError).toBe(true)
    expect(done.text).toContain('too large')
    expect(sent).toBeLessThan(100)
    expect(await s.t.run((ctx) => ctx.db.query('uploads').collect())).toHaveLength(0)
  })
})

describe('agent door: facts', () => {
  const PHONE = 'Telefon: +43 662 000 000'
  /** withFacts, with the imprint a `page` text: only such a text can quote a fact. */
  const note = (where: string) => `Note: these texts copy values the site keeps as facts: “+43 662 000 000” in ${where} → :fact{name="contact.phone"}. Quote the fact instead, so the text stays right when the value changes.`

  // Wrong behaviour caught: the assistant did not know which values the site keeps as facts, so it typed them into texts.
  it('ginko_overview lists every fact with its quote and what the website shows, for any member', async () => {
    const s = await setup()
    await withFacts(s)
    expect((await call(s, await keyOf(s, 'cook'), 'ginko_overview')).data.facts).toEqual([
      { quote: ':fact{name="contact.phone"}', label: 'Telefon', shows: '+43 662 000 000' },
      { quote: ':fact{name="contact.email"}', label: 'E-Mail', shows: 'office@gasthaus-linde.example' },
    ])
  })

  // Wrong behaviour caught: a text written through the door kept a copy of the phone number, which went stale on the next change.
  it('a write that copies a fact value says which fact to quote; a quote gets no note', async () => {
    const s = await setup()
    await withFacts(s)
    const key = await keyOf(s, 'owner')
    // A `basic` text cannot hold a fact, so the assistant is not told to quote one there.
    expect((await call(s, key, 'ginko_write', { publish: true, brick: 'legal', fields: { privacy: PHONE } })).text).not.toContain('Note:')
    const copied = await call(s, key, 'ginko_write', { publish: true, brick: 'legal', fields: { imprint: PHONE } })
    expect(copied.isError).toBe(false)
    expect(copied.text).toContain(note('imprint'))
    // A quote, or the value shown as code, is no copy.
    const quoted = await call(s, key, 'ginko_write', { publish: true, brick: 'legal', fields: { imprint: 'Telefon: :fact{name="contact.phone"}, als Text `+43 662 000 000`' } })
    expect(quoted.text).not.toContain('Note:')
  })

  it('ginko_import names the item that copies a fact value, in the dry run too', async () => {
    const s = await setup()
    await withFacts(s)
    const key = await keyOf(s, 'owner')
    const items = [{ brick: 'notices', fields: { text: 'Ruhetag', until: '2099-01-01' }, publish: true }, { brick: 'legal', fields: { imprint: PHONE }, publish: true }]
    expect((await call(s, key, 'ginko_import', { items, dry_run: true })).text).toBe(`Dry run: all 2 items would be saved. Nothing was saved. ${note('items[1] imprint')}`)
    expect((await call(s, key, 'ginko_import', { items })).text).toContain(note('items[1] imprint'))
  })
})

describe('suggest', () => {
  const fields = [{ key: 'price', label: 'Preis pro Sitzung' }, { key: 'nextPrice', label: 'Neuer Preis' }, { key: 'validUntil', label: 'Preis gültig bis' }, { key: 'minutes', label: 'Dauer einer Sitzung' }]
  // Wrong behaviour caught: several labels contain the word, so the assistant got no hint, or a single wrong one (found on rolfing).
  it.each([
    ['preis', ['price', 'validUntil', 'nextPrice']],
    ['Minutes', ['minutes']],
    ['dauer', ['minutes']],
    ['nextprise', ['nextPrice']],
    ['xyz', []],
  ])('%s → %j', (word, keys) => {
    expect(suggest(word, fields)).toEqual(keys)
  })
})

describe('agent door: local:dev key', () => {
  afterEach(() => vi.unstubAllEnvs())
  const key = 'ginko_agent_' + 'a'.repeat(32)
  const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('')

  // Wrong behaviour caught: the .mcp.json key that local:dev writes is refused, or a deployment that is not local hands out keys.
  it('registers the key of .mcp.json for the local admin once, and only on a local backend', async () => {
    const s = await setup()
    const args = { site: 'restaurant', email: 'Admin@example.com', hash: await hash(key) }
    expect(await errorOf(s.t.mutation(internal.agent.devKey, args))).toMatchObject({ code: 'FORBIDDEN' })
    vi.stubEnv('GINKO_LOCAL', '1')
    expect(await s.t.mutation(internal.agent.devKey, { ...args, email: 'nobody@example.com' })).toEqual({ ok: false, reason: 'signin' })
    expect(await s.t.mutation(internal.agent.devKey, args)).toEqual({ ok: true })
    expect(await s.t.mutation(internal.agent.devKey, args)).toEqual({ ok: true })
    expect((await call(s, key, 'ginko_overview')).data).toMatchObject({ site: 'restaurant', role: 'admin' })
    expect(await s.t.run((ctx) => ctx.db.query('agentKeys').collect())).toHaveLength(1)

    // Wrong behaviour caught: local:dev brought a revoked key back to life by deleting and inserting it again.
    await s.t.run(async (ctx) => { for (const row of await ctx.db.query('agentKeys').collect()) await ctx.db.patch(row._id, { revokedAt: 1 }) })
    expect(await s.t.mutation(internal.agent.devKey, args)).toEqual({ ok: false, reason: 'taken' })
    expect(await s.t.run((ctx) => ctx.db.query('agentKeys').collect())).toMatchObject([{ revokedAt: 1 }])
  })
})

describe('agent door: English for the model', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('ginko_history words a row with msg in English and keeps the German sentence of a row from before msg', async () => {
    const s = await setup()
    const key = await keyOf(s, 'owner')
    await call(s, key, 'task_menu_price', { publish: true, entry: s.entries['menu-schnitzel'], price: 19.9 })
    await call(s, key, 'task_menu_price', { publish: true, entry: s.entries['menu-schnitzel'], price: 20.5 })
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
    await call(s, await keyOf(s, 'owner'), 'task_menu_price', { entry: s.entries['menu-schnitzel'], price: 25, propose: true, publish: true })
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
