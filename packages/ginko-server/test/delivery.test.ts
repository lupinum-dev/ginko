// Delivery and upkeep: the bundle endpoint (SPEC 6), "Sofort von der Seite nehmen" (SPEC 4.4)
// and the daily retention job (SPEC 12). One test per realistic failure.
import { byteSize, entryBytes, parseMarkdown, serializeSchema, type Schema } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import corpus from '../../../contracts/restaurant/data.json' with { type: 'json' }
import saas from '../../../sites/saas/ginko.config.ts'
import { api, internal } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { bundleOf } from '../convex/bundle'
import { splitParts } from '../convex/lib/trees'
import { tick } from './clock'
import { errorOf, opId, people, setup } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-08T10:00:00Z')

/** Adds the saas blog (Markdown bodies, at most `bodyMax` characters) to the restaurant site, with an add task for the cook; returns a post maker. */
async function withBlog(s: Setup, bodyMax?: number) {
  const blog = serializeSchema(saas).bricks.blog!
  blog.route = { de: (blog.route as Record<string, string>).de! } as never
  if (bodyMax !== undefined) (blog.fields.body as { max?: number }).max = bodyMax
  await s.t.run(async (ctx) => {
    const site = (await ctx.db.get(s.site))!
    const schema = site.schema as Schema
    await ctx.db.patch(s.site, { schema: { ...schema, bricks: { ...schema.bricks, blog } } })
    const cook = (await ctx.db.query('memberships').collect()).find((m) => m.user === people.cook && m.site === s.site)!
    await ctx.db.patch(cook._id, { grants: [...cook.grants, 'blog.add'] })
  })
  return (i: number, body: string) => s.as.cook.mutation(api.entries.create, {
    site: 'restaurant', opId: opId(), publish: {}, task: 'blog.add', brick: 'blog',
    data: { title: { de: `Beitrag ${i}` }, date: '2026-10-01', author: 'Koch', description: { de: 'Kurz' }, body: { de: body } },
  }) as Promise<{ entry: string }>
}


describe('entries.changeSlug', () => {
  // Wrong behaviour caught: a renamed page's old address turns into a 404 (links and search results break), another
  // entry takes the old address over, or staff move a page.
  it('keeps the old address as a forward, reserved; taking it back makes it current again; staff may not', async () => {
    const s = await setup()
    const post = await withBlog(s)
    const { entry } = await post(1, 'Text')
    const change = (who: 'owner' | 'cook', id: string, slug: string) => s.as[who].mutation(api.entries.changeSlug, { site: 'restaurant', opId: opId(), entry: id, locale: 'de', slug })
    const item = async (id: string) => {
      const bundle = (await (await s.t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as { bricks: { blog: { items: { id: string; urls?: Record<string, string>; oldUrls?: Record<string, string[]> }[] } } }
      return bundle.bricks.blog.items.find((i) => i.id === id)!
    }
    const before = (await item(entry)).urls!.de!
    expect((await errorOf(change('cook', entry, 'anders'))).code).toBe('FORBIDDEN')

    await change('owner', entry, 'neuer-name')
    const renamed = await item(entry)
    expect(renamed.urls!.de).toBe(before.replace(/[^/]+$/, 'neuer-name'))
    expect(renamed.oldUrls).toEqual({ de: [before] })

    const { entry: other } = await post(2, 'Text')
    expect((await errorOf(change('owner', other, before.split('/').pop()!))).code).toBe('INVALID')
    expect((await errorOf(change('owner', entry, 'Kein Slug!'))).code).toBe('INVALID')

    await change('owner', entry, before.split('/').pop()!)
    const back = await item(entry)
    expect(back.urls!.de).toBe(before)
    expect(back.oldUrls).toEqual({ de: [before.replace(/[^/]+$/, 'neuer-name')] })
  })
})

type Bundle = {
  locale: string
  requestedLocale?: string
  bricks: Record<string, { items?: { id: string; data: Record<string, unknown>; fallback: string[] }[] }>
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('GET /bundle/<site>', () => {
  // Wrong behaviour caught: a German typo fix turns the English text German (P5, D6).
  it('an outdated English translation is delivered in English and its leaf is not listed as fallback', async () => {
    const { t, entries } = await setup()
    const response = await t.fetch('/bundle/restaurant?format=3&locale=en')
    expect(response.status).toBe(200)
    const bundle = (await response.json()) as Bundle
    expect(bundle.locale).toBe('en')
    const item = bundle.bricks.menu!.items!.find((i) => i.id === entries['menu-schnitzel'])!
    const name = (corpus.menu as { id: string; data: { name: { en: string } } }[]).find((r) => r.id === 'menu-schnitzel')!.data.name
    expect(item.data.name).toBe(name.en)
    expect(item.fallback).not.toContain('name')
  })

  it('a markdown field stored as a string is delivered as a parsed tree', async () => {
    const { t, as, entries } = await setup()
    await as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), entry: entries.legal!, baseRev: 1, fields: { imprint: { de: '**Hallo**' } }, sentence: 'Impressum' })
    const bundle = (await (await t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as { bricks: { legal: { data: { imprint: { nodes: unknown[] } } } } }
    expect(Array.isArray(bundle.bricks.legal.data.imprint.nodes)).toBe(true)
    expect(JSON.stringify(bundle.bricks.legal.data.imprint.nodes)).toContain('Hallo')
  })

  // The bundle is a query with a 1 s limit. Parsing every stored text per request let staff with an add task
  // fill a collection with valid texts that are slow to parse until the bundle failed for every visitor.
  it('is built from the trees stored at each save', async () => {
    const s = await setup()
    // The saas blog (Markdown bodies up to 20000 characters), added by the cook.
    const post = await withBlog(s)
    // The fastest of three runs after a warm-up: timings in a busy test run only ever get slower.
    const fastest = async (work: () => Promise<unknown>) => {
      await work()
      let best = Infinity
      for (let i = 0; i < 3; i++) {
        const start = performance.now()
        await work()
        best = Math.min(best, performance.now() - start)
      }
      return best
    }
    const build = () => s.t.run(async (ctx) => { await bundleOf(ctx, (await ctx.db.get(s.site))!, 'de') })

    // 10000 empty headings: a valid body that is almost nothing to store or serve, and slow to parse.
    const slow = '#\n'.repeat(10000)
    const before = await fastest(build)
    for (let i = 0; i < 20; i++) await post(i, slow)
    const after = await fastest(build)
    const parse = await fastest(async () => { for (let i = 0; i < 20; i++) await parseMarkdown(slow) })
    // The posts add the reading of their stored trees to the build, a small part of parsing their texts.
    expect(after - before).toBeLessThan(parse / 3)
  }, 60_000)

  // Trees no longer count toward the budget, so they need their own bound: the bundle reads every live entry's trees,
  // and `## a` lines make trees ten times their text. Staff with an add task must not fill a site until the bundle fails.
  it('the site\'s trees are capped: heavily formatted posts end in errors.entryTooComplex', async () => {
    const s = await setup()
    const post = await withBlog(s)
    let made = 0
    let refused: Awaited<ReturnType<typeof errorOf>> | undefined
    for (; made < 40 && !refused; made++) refused = await post(made, '## a\n'.repeat(4000)).then(() => undefined, (error) => errorOf(Promise.reject(error)))
    expect(refused).toMatchObject({ code: 'TOO_LARGE', message: 'Die Texte dieser Seite sind zu stark formatiert, um sie auszuliefern (z. B. sehr viele Überschriften oder Listenpunkte). Vereinfache diesen Text.' })
    expect(made).toBe(34)
    expect((await s.t.run((ctx) => ctx.db.get(s.site)))!.treeBytes).toBeLessThanOrEqual(8 * 1024 * 1024)
  }, 60_000)

  // Wrong behaviour caught: trees stored on the entry row push a large text over Convex's 1 MiB document limit (convex-test does not enforce it).
  it('a 470 KiB entry of formatted paragraphs stores no document over 1 MiB and the bundle serves its last line', async () => {
    const s = await setup()
    const post = await withBlog(s, 500_000)
    // 3800 paragraphs with bold text: almost as many elements as a text may have (20000), and trees larger than the text.
    const { entry } = await post(1, `Absatz mit **fett** und ${'x'.repeat(95)}.\n\n`.repeat(3799) + 'Schluss')
    const docs = await s.t.run(async (ctx) => [
      (await ctx.db.get(entry as Id<'entries'>))!,
      ...(await ctx.db.query('entryTrees').withIndex('by_entry', (q) => q.eq('entry', entry as Id<'entries'>)).collect()),
      ...(await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry as Id<'entries'>)).collect()),
    ])
    expect(docs.length).toBeGreaterThan(3)
    expect(Math.max(...docs.map((doc) => byteSize(doc)))).toBeLessThan(1_048_576)
    const bundle = await s.t.run(async (ctx) => bundleOf(ctx, (await ctx.db.get(s.site))!, 'de'))
    expect(JSON.stringify(bundle.bricks.blog!.items!.find((item) => item.id === entry)!.data.body)).toContain('Schluss')
  }, 60_000)

  // Wrong behaviour caught: a part boundary splits an emoji, and Convex refuses the lone surrogate.
  it('splits trees into parts without cutting a surrogate pair', () => {
    expect(splitParts('a😀b', 2)).toEqual(['a', '😀', 'b'])
  })

  // Wrong behaviour caught: the migration leaves legacy or stale trees, stops after its first batch, or leaves the counters off the sums.
  it('migrateStorage moves every entry\'s trees to entryTrees and sets the site\'s counters to the sums', async () => {
    const s = await setup()
    const entry = s.entries.legal!
    await s.as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { imprint: { de: '**Hallo**' } }, sentence: 'Impressum' })
    const trees = () => s.t.run(async (ctx) => (await ctx.db.query('entryTrees').withIndex('by_entry', (q) => q.eq('entry', entry)).collect()).map((part) => part.json).join(''))
    const saved = await trees()
    const savedAt = (await s.t.run((ctx) => ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry)).first()))!.at
    // A row from before: stale trees on the row itself (as after a parser change), bytes with trees, no newer fields or counters.
    await s.t.run(async (ctx) => {
      for (const part of await ctx.db.query('entryTrees').collect()) await ctx.db.delete(part._id)
      await ctx.db.patch(entry, { trees: '{}', bytes: 99_999, treeBytes: undefined, contentAt: undefined })
      await ctx.db.patch(s.site, { bytes: 1, trashBytes: undefined, treeBytes: undefined })
    })
    vi.useFakeTimers()
    await s.t.mutation(internal.entries.migrateStorage, {})
    await s.t.finishAllScheduledFunctions(vi.runAllTimers)
    const row = (await s.t.run((ctx) => ctx.db.get(entry)))!
    expect(row.trees).toBeUndefined()
    expect(row).toMatchObject({ bytes: entryBytes(row.data, row.prints), treeBytes: new TextEncoder().encode(saved).byteLength, contentAt: savedAt })
    expect(await trees()).toBe(saved)
    // Every site is checked; the fixture's rows (more than one batch) are all migrated.
    const status = []
    let cursor: string | null = null
    for (let done = false; !done;) {
      const page: { sites: unknown[]; cursor: string; isDone: boolean } = await s.t.query(internal.entries.storageStatus, { cursor })
      status.push(...page.sites)
      cursor = page.cursor
      done = page.isDone
    }
    expect(status).toMatchObject([
      { site: 'restaurant', legacyRows: 0, countersMatch: true, overLimit: [] },
      { site: 'andere', legacyRows: 0, countersMatch: true, overLimit: [] },
    ])
  })

  // Wrong behaviour caught: updatedAt comes from change rows, so it falls back to the creation time once retention deleted them.
  it('updatedAt survives the change retention', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const s = await setup()
    const entry = s.entries['menu-saibling']!
    // Saved an hour after it was created; a year later retention deleted the change rows.
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    await s.as.owner.mutation(api.entries.save, { publish: true, site: 'restaurant', opId: opId(), entry, baseRev: 1, fields: { price: { amount: 1500 } } })
    vi.setSystemTime(NOW + 366 * DAY)
    await s.t.run(async (ctx) => { for (const change of await ctx.db.query('changes').collect()) await ctx.db.delete(change._id) })
    const bundle = await s.t.run(async (ctx) => bundleOf(ctx, (await ctx.db.get(s.site))!, 'de'))
    expect(bundle.bricks.menu!.items!.find((item) => item.id === entry)!.updatedAt).toBe('2026-10-08T11:00:00.000Z')
  })

  it('an unknown locale delivers the main language and names the requested one', async () => {
    const { t } = await setup()
    const bundle = (await (await t.fetch('/bundle/restaurant?format=3&locale=xx')).json()) as Bundle
    expect(bundle).toMatchObject({ locale: 'de', requestedLocale: 'xx' })
  })

  it('format 1 (AST v1 texts) is refused with 400 FORMAT_UNSUPPORTED', async () => {
    const { t } = await setup()
    const response = await t.fetch('/bundle/restaurant?format=1&locale=de')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'FORMAT_UNSUPPORTED' })
  })

  it('a minRev with a higher schemaRev alone is STALE (409)', async () => {
    const { t } = await setup()
    const response = await t.fetch('/bundle/restaurant?format=3&locale=de&minRev=2.1')
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'STALE' })
  })

  it('a deleted entry is not in the bundle', async () => {
    const { t, entries } = await setup()
    await t.run((ctx) => ctx.db.patch(entries.weinabend!, { deletedAt: Date.now() }))
    const bundle = (await (await t.fetch('/bundle/restaurant?format=3&locale=de')).json()) as Bundle
    const ids = bundle.bricks.events!.items!.map((i) => i.id)
    expect(ids).not.toContain(entries.weinabend)
    expect(ids).toContain(entries.martinigans)
  })

  it('a stranger who uses up the limit does not block the site, which sends its refresh token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t, site } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.patch(site, { refreshToken: 'site-secret' })
      await ctx.db.insert('rateWindows', { site, window: Math.floor(NOW / 60_000), count: 600 })
    })
    const get = (token?: string) => t.fetch('/bundle/restaurant?format=3&locale=de', token ? { headers: { 'x-ginko-site-token': token } } : {})
    expect((await get()).status).toBe(429)
    expect((await get('wrong-secret')).status).toBe(429)
    expect((await get('site-secret')).status).toBe(200)
  })

  // Wrong behaviour caught: the token the Studio shows is not the one the platform checks, or a replaced token still works.
  it('the site token an owner creates in the Studio admits the site; a new one replaces it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t, as, site } = await setup()
    expect((await as.owner.query(api.sites.meta, { site: 'restaurant' })).site.hasSiteToken).toBe(false)
    const first = (await as.owner.mutation(api.sites.createSiteToken, { site: 'restaurant' })).token
    expect(first).toHaveLength(64)
    expect((await as.owner.query(api.sites.meta, { site: 'restaurant' })).site.hasSiteToken).toBe(true)
    const second = (await as.owner.mutation(api.sites.createSiteToken, { site: 'restaurant' })).token
    await t.run((ctx) => ctx.db.insert('rateWindows', { site, window: Math.floor(NOW / 60_000), count: 600 }))
    const get = (token: string) => t.fetch('/bundle/restaurant?format=3&locale=de', { headers: { 'x-ginko-site-token': token } })
    expect((await get(first)).status).toBe(429)
    expect((await get(second)).status).toBe(200)
  })

  // 601 HTTP requests take ~3 s alone and more under a full parallel run: a longer limit, not a flake.
  it('the 601st request in one minute is RATE_LIMITED (429)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t } = await setup()
    const statuses: number[] = []
    for (let i = 0; i < 601; i++) statuses.push((await t.fetch('/bundle/restaurant?format=3&locale=de')).status)
    expect(statuses.slice(0, 600).every((s) => s === 200)).toBe(true)
    expect(statuses[600]).toBe(429)
  }, 30_000)
})

/** Answers for the site's URLs. Every test stubs the platform's outgoing fetch, nothing else. */
function stubFetch(answer: (path: string, call: number) => Response) {
  const calls = new Map<string, number>()
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    const call = (calls.get(path) ?? 0) + 1
    calls.set(path, call)
    expect(init?.redirect).toBe('manual')
    return answer(path, call)
  })
  vi.stubGlobal('fetch', mock)
  return { mock, callsFor: (path: string) => calls.get(path) ?? 0 }
}

const proof = (rev: string) => new Response(null, { status: 200, headers: { 'x-ginko-rev': rev } })

/** Runs the action while the test moves the fake clock, so the 5 s retry waits pass. */
async function runWithClock<T>(call: Promise<T>): Promise<T> {
  let done = false
  void call.finally(() => (done = true))
  while (!done) await vi.advanceTimersByTimeAsync(5_000)
  return call
}

describe('urgentRefresh', () => {
  it('re-renders the sitemap and the detail page of a deleted event, with both headers', async () => {
    const { t, as, site, entries } = await setup()
    await t.run((ctx) => ctx.db.patch(site, { refreshToken: 'token-test' }))
    await t.run((ctx) => ctx.db.patch(entries.weinabend!, { deletedAt: Date.now() }))
    const fetched = stubFetch(() => proof('1.1'))

    const result = (await as.owner.action(api.refresh.urgentRefresh, { site: 'restaurant', opId: opId() })) as {
      results: { path: string; status: number; rev: string; ok: boolean }[]
    }

    expect(fetched.callsFor('/veranstaltungen/weinabend-ebner')).toBe(1)
    expect(fetched.callsFor('/en/events/wine-evening-ebner')).toBe(1)
    expect(fetched.callsFor('/sitemap.xml')).toBe(1)
    const init = fetched.mock.mock.calls[0]![1] as RequestInit
    expect(init.headers).toMatchObject({ 'x-prerender-revalidate': 'token-test', 'x-ginko-min-rev': '1.1' })
    expect(result.results.every((r) => r.ok)).toBe(true)
  })

  it('retries a path that answers 503 and accepts the proof of the second answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { t, as, site } = await setup()
    await t.run((ctx) => ctx.db.patch(site, { refreshToken: 'token-test' }))
    const fetched = stubFetch((path, call) => (path === '/speisekarte' && call === 1 ? new Response(null, { status: 503 }) : proof('1.1')))

    const result = (await runWithClock(as.owner.action(api.refresh.urgentRefresh, { site: 'restaurant', opId: opId() }))) as {
      results: { path: string; status: number; rev: string; ok: boolean }[]
    }

    expect(fetched.callsFor('/speisekarte')).toBe(2)
    expect(result.results.find((r) => r.path === '/speisekarte')).toMatchObject({ status: 200, rev: '1.1', ok: true })
  })

  it('a path whose proof stays below the minimum is reported as failed after three retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { t, as, site } = await setup()
    await t.run((ctx) => ctx.db.patch(site, { refreshToken: 'token-test' }))
    const fetched = stubFetch((path) => (path === '/en' ? proof('1.0') : proof('1.1')))

    const result = (await runWithClock(as.owner.action(api.refresh.urgentRefresh, { site: 'restaurant', opId: opId() }))) as {
      results: { path: string; status: number; rev: string; ok: boolean }[]
    }

    expect(fetched.callsFor('/en')).toBe(4)
    expect(result.results.find((r) => r.path === '/en')).toEqual({ path: '/en', status: 200, rev: '1.0', ok: false })
    expect(result.results.filter((r) => !r.ok)).toHaveLength(1)
  })

  it('staff cannot refresh the site, even with the grants of the cook', async () => {
    const { t, as, site } = await setup()
    await t.run((ctx) => ctx.db.patch(site, { refreshToken: 'token-test' }))
    const fetched = stubFetch(() => proof('1.1'))

    const error = await errorOf(as.cook.action(api.refresh.urgentRefresh, { site: 'restaurant', opId: opId() }))

    expect(error.code).toBe('FORBIDDEN')
    expect(fetched.mock).not.toHaveBeenCalled()
  })
})

describe('refresh.record (Phase 5 review)', () => {
  it('two recordings of one opId keep one ops row and both answer with the first result', async () => {
    const { t, as } = await setup()
    const first = { results: [{ path: '/', status: 200, rev: '1.1', ok: true }], limited: false }
    const args = { site: 'restaurant', opId: opId(), hash: 'hash-test' }
    expect(await as.owner.mutation(internal.refresh.record, { ...args, result: first })).toEqual(first)
    expect(await as.owner.mutation(internal.refresh.record, { ...args, result: { results: [], limited: true } })).toEqual(first)
    expect(await t.run((ctx) => ctx.db.query('ops').collect())).toHaveLength(1)
  })

  it('sets lastRefreshAt only when every page confirmed; a partly failed refresh leaves it as it was', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { as } = await setup()
    const ok = { path: '/', status: 200, rev: '1.1', ok: true }
    const failed = { path: '/menu', status: 500, rev: '1.0', ok: false }
    const lastRefreshAt = async () => (await as.owner.query(api.sites.meta, { site: 'restaurant' })).site.lastRefreshAt
    await as.owner.mutation(internal.refresh.record, { site: 'restaurant', opId: opId(), hash: 'hash-partly', result: { results: [ok, failed], limited: false } })
    expect(await lastRefreshAt()).toBeNull()
    const refreshedAt = tick()
    await as.owner.mutation(internal.refresh.record, { site: 'restaurant', opId: opId(), hash: 'hash-full', result: { results: [ok], limited: false } })
    expect(await lastRefreshAt()).toBe(refreshedAt)
    vi.setSystemTime(NOW + 60 * 60 * 1000)
    await as.owner.mutation(internal.refresh.record, { site: 'restaurant', opId: opId(), hash: 'hash-partly-again', result: { results: [ok, failed], limited: false } })
    expect(await lastRefreshAt()).toBe(refreshedAt)
  })
})

describe('retention (daily)', () => {
  // Wrong behaviour caught: sign-in codes stay readable in the outbox for ever.
  it('removes outbox mail older than a day and keeps a newer one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.insert('outbox', { to: 'a@example.test', subject: 'Code', text: '123456', at: NOW - DAY - 1 })
      await ctx.db.insert('outbox', { to: 'b@example.test', subject: 'Code', text: '654321', at: NOW - 60_000 })
    })
    await t.mutation(internal.retention.daily, {})
    expect((await t.run((ctx) => ctx.db.query('outbox').collect())).map((m) => m.to)).toEqual(['b@example.test'])
  })

  it('hard-deletes an entry deleted 31 days ago with its slug rows, and keeps one deleted 29 days ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t, entries } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.patch(entries.weinabend!, { deletedAt: NOW - 31 * DAY })
      await ctx.db.patch(entries.martinigans!, { deletedAt: NOW - 29 * DAY })
    })

    await t.mutation(internal.retention.daily, {})

    const [gone, kept, slugsOfGone, slugsOfKept] = await t.run(async (ctx) => [
      await ctx.db.get(entries.weinabend!),
      await ctx.db.get(entries.martinigans!),
      await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entries.weinabend!)).collect(),
      await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entries.martinigans!)).collect(),
    ] as const)
    expect(gone).toBeNull()
    expect(slugsOfGone).toHaveLength(0)
    expect(kept).not.toBeNull()
    expect(slugsOfKept.length).toBeGreaterThan(0)
  })

  it('removes an expired notice invisible for 31 days and keeps one invisible for 29 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t, entries } = await setup()
    // Site time zone Europe/Vienna: today is 2026-10-08. 2026-09-07 is 31 days back, 2026-09-09 is 29 days back.
    await t.run(async (ctx) => {
      await ctx.db.patch(entries['notice-urlaub']!, { data: { text: { de: 'Betriebsurlaub.' }, until: '2026-09-07' } })
      await ctx.db.patch(entries['notice-weinabend']!, { data: { text: { de: 'Weinabend.' }, until: '2026-09-09' } })
    })

    const now = tick()
    await t.mutation(internal.retention.daily, {})

    const [removed, kept, change] = await t.run(async (ctx) => [
      await ctx.db.get(entries['notice-urlaub']!),
      await ctx.db.get(entries['notice-weinabend']!),
      await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entries['notice-urlaub']!)).first(),
    ] as const)
    expect(removed).toMatchObject({ deletedAt: now, lifeRev: 2 })
    expect(kept?.deletedAt).toBeUndefined()
    expect(change).toMatchObject({ kind: 'remove', actor: 'system' })
  })

  it('keeps entryCount and bytes = live entries and trashBytes = removed ones through soft and hard delete', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { t, entries, site } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.patch(entries['notice-urlaub']!, { data: { text: { de: 'Betriebsurlaub.' }, until: '2026-09-07' } })
    })
    await t.mutation(internal.retention.daily, {})
    // 31 days later the soft-deleted notice is hard-deleted.
    vi.setSystemTime(NOW + 31 * 24 * 60 * 60 * 1000)
    await t.mutation(internal.retention.daily, {})
    const [counters, rows] = await t.run(async (ctx) => [await ctx.db.get(site), await ctx.db.query('entries').collect()] as const)
    expect(rows.filter((r) => !r.deletedAt).length).toBeGreaterThan(10)
    expect(rows.some((r) => r._id === entries['notice-urlaub'])).toBe(false)
    expect(counters!.entryCount).toBe(rows.filter((r) => !r.deletedAt).length)
    expect(counters!.bytes).toBe(rows.filter((r) => !r.deletedAt).reduce((n, r) => n + r.bytes, 0))
    expect(counters!.trashBytes).toBe(rows.filter((r) => r.deletedAt).reduce((n, r) => n + r.bytes, 0))
  })
})
