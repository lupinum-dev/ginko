// The CLI's release and check (packages/ginko/src/cli) against the platform's HTTP routes and the
// release mutation: the CLI's fetch is routed into convex-test, so the whole SPEC 5.1 path runs.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import { check } from '../../../packages/ginko/src/cli/check.ts'
import { createPlatform, type Platform } from '../../../packages/ginko/src/cli/platform.ts'
import { release, type ReleaseInput } from '../../../packages/ginko/src/cli/release.ts'
import { CliError } from '../../../packages/ginko/src/cli/model.ts'
import { f, type SiteInput } from '../../../packages/ginko/src/core/index.ts'
import { api, internal } from '../convex/_generated/api'
import { setup } from './setup'

type Setup = Awaited<ReturnType<typeof setup>>

const COMMIT = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a1b2c3d4'

// The restaurant site with a new translatable `menu.title`, filled from `name` by a migration.
const menu = restaurant.bricks.menu
const withTitle: SiteInput = {
  ...restaurant,
  bricks: { ...restaurant.bricks, menu: { ...menu, fields: { ...menu.fields, title: f.text('Titel', { max: 120 }) } } },
  migrations: { '2026-11-menu-title': { brick: 'menu', fills: 'title', from: (entry) => entry.name } },
}

let sleeps: number[] = []

async function platformFor(s: Setup, onPost?: () => Promise<void>): Promise<{ platform: Platform; posts: () => number }> {
  const { key } = await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'CI', scopes: ['release', 'check'] })
  let posts = 0
  const platform = createPlatform({
    url: 'https://platform.test',
    key,
    fetch: async (url, init) => {
      const { pathname, search } = new URL(url)
      if (pathname === '/release' && init?.method === 'POST') {
        posts++
        await onPost?.()
      }
      return s.t.fetch(pathname + search, init)
    },
  })
  return { platform, posts: () => posts }
}

function inputFor(platform: Platform, config: SiteInput, commit = COMMIT, branchHead = COMMIT): ReleaseInput {
  return {
    config,
    commit,
    platform,
    branchHead: async () => branchHead,
    sleep: async (ms) => { sleeps.push(ms) },
    log: () => undefined,
  }
}

async function storedSite(s: Setup) {
  return (await s.t.run((ctx) => ctx.db.get(s.site)))!
}

async function menuRows(s: Setup) {
  return s.t.run(async (ctx) => (await ctx.db.query('entries').collect()).filter((e) => e.brick === 'menu'))
}

describe('ginko release and check against the platform (SPEC 5.1, 5.3)', () => {
  it('a change between state and release is CHANGED_SINCE, retried after 2 s, and then released', async () => {
    sleeps = []
    const s = await setup()
    let raced = false
    const { platform } = await platformFor(s, async () => {
      // Another entry appears after the CLI read the state: the first POST is stale.
      if (raced) return
      raced = true
      await s.t.run(async (ctx) => {
        const { _id: _ignored, _creationTime: _time, ...row } = (await ctx.db.get(s.entries['menu-saibling']!))!
        await ctx.db.insert('entries', { ...row, order: 99 })
        const site = (await ctx.db.get(s.site))!
        await ctx.db.patch(s.site, { contentRev: site.contentRev + 1 })
      })
    })
    const outcome = await release(inputFor(platform, withTitle))
    expect(outcome).toEqual({ deploy: true, schemaRev: 2, contentRev: 3 })
    expect(sleeps).toEqual([2000])
    const rows = await menuRows(s)
    expect(rows.length).toBeGreaterThan(8)
    expect(rows.every((e) => e.data.title !== undefined)).toBe(true)
  })

  it('the same commit twice gives the same answer and the second run changes nothing', async () => {
    const s = await setup()
    const { platform, posts } = await platformFor(s)
    const first = await release(inputFor(platform, withTitle))
    const second = await release(inputFor(platform, withTitle))
    expect(first).toEqual({ deploy: true, schemaRev: 2, contentRev: 2 })
    expect(second).toEqual(first)
    expect(posts()).toBe(2)
    expect((await storedSite(s)).schemaRev).toBe(2)
  })

  it('a commit that is no longer the head of main releases nothing', async () => {
    const s = await setup()
    const { platform, posts } = await platformFor(s)
    const outcome = await release(inputFor(platform, withTitle, COMMIT, 'ffffffffffffffffffffffffffffffffffffffff'))
    expect(outcome).toEqual({ deploy: false, reason: 'superseded' })
    expect(posts()).toBe(0)
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('a rejected schema change stops before anything is sent, and the message names the fix', async () => {
    const s = await setup()
    const { platform, posts } = await platformFor(s)
    const fields = { ...menu.fields }
    delete (fields as Record<string, unknown>).allergens
    const removed: SiteInput = { ...restaurant, bricks: { ...restaurant.bricks, menu: { ...menu, fields } } }
    const error = await release(inputFor(platform, removed)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CliError)
    expect((error as Error).message).toContain('menu.allergens')
    expect((error as Error).message).toContain('retired')
    expect(posts()).toBe(0)
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('a revoked key ends the release with the platform code UNAUTHORIZED', async () => {
    const s = await setup()
    const created = await s.as.owner.mutation(api.release.createPushKey, { site: 'restaurant', label: 'alt', scopes: ['release'] })
    await s.as.owner.mutation(api.release.revokePushKey, { site: 'restaurant', key: created.id })
    const revoked = createPlatform({
      url: 'https://platform.test',
      key: created.key,
      fetch: (url, init) => s.t.fetch(new URL(url).pathname + new URL(url).search, init),
    })
    await expect(release(inputFor(revoked, withTitle))).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect((await storedSite(s)).schemaRev).toBe(1)
  })

  it('check reports the release and writes nothing', async () => {
    const s = await setup()
    const { platform, posts } = await platformFor(s)
    const lines: string[] = []
    const root = fileURLToPath(new URL('../../../sites/restaurant/', import.meta.url))
    const noFetch = async () => { throw new Error('no external link check expected') }
    expect(await check({ config: withTitle, connect: () => platform, root, fetch: noFetch, log: (line) => lines.push(line) })).toBe(true)
    expect(lines.join('\n')).toContain('OK: A release with this schema would be accepted.')
    expect(posts()).toBe(0)
    const site = await storedSite(s)
    expect({ schemaRev: site.schemaRev, contentRev: site.contentRev }).toEqual({ schemaRev: 1, contentRev: 1 })
    expect((await menuRows(s)).every((e) => e.data.title === undefined)).toBe(true)
  })
})

// Phase 10: a new deployment starts with sites:bootstrap and release:bootstrapKey (deploy key only);
// the first `ginko release` then brings the whole schema and creates the singles.
it('a bootstrapped site takes its first release through the CLI path', async () => {
  const s = await setup()
  await s.t.mutation(internal.sites.bootstrap, { slug: 'linde', name: 'Gasthaus zur Linde', url: 'https://ginko-demo-restaurant.vercel.app' })
  const { key } = await s.t.mutation(internal.release.bootstrapKey, { site: 'linde', label: 'CI', scopes: ['release', 'check'] })
  expect(key).toMatch(/^ginko_linde_[a-z0-9]{32}$/)
  const platform = createPlatform({ url: 'https://platform.test', key, fetch: async (url, init) => { const { pathname, search } = new URL(url); return s.t.fetch(pathname + search, init) } })
  const outcome = await release(inputFor(platform, { ...restaurant, site: 'linde' }))
  expect(outcome).toMatchObject({ deploy: true, schemaRev: 2 })
  const site = (await s.t.run((ctx) => ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', 'linde')).unique()))!
  const singles = (await s.t.run((ctx) => ctx.db.query('entries').collect())).filter((e) => e.site === site._id).map((e) => e.brick).sort()
  expect(singles).toEqual(['contact', 'gallery', 'hours', 'legal', 'lunch', 'seo'])
})
