// `ginko connect` (convex/connect.ts, routes/connect.ts): a computer asks for a publishing key, an owner or admin
// confirms the code in the Studio, the computer's next poll gets the key once. Each test names the attack it stops.
import { sha256 } from '@lupinum/ginko/internal'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../../packages/ginko/src/cli/index.ts'
import { api, internal } from '../convex/_generated/api'
import { CONNECT } from '../convex/connect'
import { tick } from './clock'
import { errorOf, setup } from './setup'

type S = Awaited<ReturnType<typeof setup>>
type Started = { deviceCode: string; userCode: string; verifyUrl: string; interval: number; expiresIn: number }

afterEach(() => { vi.unstubAllEnvs() })

const post = (s: S, path: string, body: unknown) => s.t.fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function start(s: S, label = 'linde-website'): Promise<Started> {
  vi.stubEnv('SITE_URL', 'https://cms.example.test/')
  const response = await post(s, '/connect/start', { label })
  expect(response.status).toBe(200)
  return await response.json() as Started
}

async function poll(s: S, deviceCode: string) {
  const response = await post(s, '/connect/poll', { deviceCode })
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

const NOT_VALID = { status: 400, body: { code: 'INVALID', message: 'This connect request is not valid. Start again with ginko connect.' } }

/** Every row of the connect and key tables as text: where a plaintext secret must never appear. */
const stored = (s: S) => s.t.run(async (ctx) => JSON.stringify([await ctx.db.query('connectRequests').collect(), await ctx.db.query('pushKeys').collect()]))

describe('the key', () => {
  // Wrong behaviour caught: the key is stored in plain text (a database export leaks it), a second poll or a poll with
  // another device code gets it again, or it differs from a Team-page key (other scopes, no creator, not listed).
  it('exists in the database only as a hash, is returned once to the holder of the device code, and is listed like a Team-page key', async () => {
    const s = await setup()
    const started = await start(s)
    expect(started).toMatchObject({ verifyUrl: 'https://cms.example.test/connect', interval: 2, expiresIn: 600 })
    expect(started.userCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/)
    expect(started.verifyUrl).not.toContain(started.userCode)
    expect(await stored(s)).not.toContain(started.deviceCode)

    expect(await s.as.owner.mutation(api.connect.lookup, { code: started.userCode.toLowerCase() })).toMatchObject({ ok: true, label: 'linde-website' })
    expect(await poll(s, started.deviceCode)).toEqual({ status: 200, body: { status: 'pending' } })
    expect(await s.as.owner.mutation(api.connect.approve, { code: started.userCode, site: 'restaurant' })).toEqual({ ok: true })
    // The approval made no key; another device code gets nothing.
    expect(await s.t.run(async (ctx) => (await ctx.db.query('pushKeys').collect()).length)).toBe(0)
    expect(await poll(s, 'A'.repeat(43))).toEqual(NOT_VALID)

    const got = await poll(s, started.deviceCode)
    expect(got.status).toBe(200)
    expect(got.body.site).toBe('restaurant')
    const key = got.body.key as string
    expect(key).toMatch(/^ginko_restaurant_[a-z0-9]{32}$/)
    expect(await poll(s, started.deviceCode)).toEqual(NOT_VALID)

    expect(await stored(s)).not.toContain(key)
    expect(await stored(s)).not.toContain(started.deviceCode)
    const row = await s.t.run(async (ctx) => (await ctx.db.query('pushKeys').collect())[0]!)
    expect(row).toMatchObject({ hash: sha256(key), label: 'connect: linde-website', scopes: ['release', 'check', 'pull', 'export'], createdBy: 'u-wirtin' })
    // The Team page lists it with who and when, so an owner can revoke it; then the key stops working.
    const team = await s.as.owner.query(api.members.list, { site: 'restaurant' })
    expect(team.keys).toMatchObject([{ id: row._id, label: 'connect: linde-website', member: expect.anything(), createdAt: row._creationTime }])
    const state = () => s.t.fetch('/release/state?site=restaurant', { headers: { authorization: `Bearer ${key}` } })
    expect((await state()).status).toBe(200)
    await s.as.owner.mutation(api.release.revokePushKey, { site: 'restaurant', key: row._id })
    expect((await state()).status).toBe(401)
  })

  // Wrong behaviour caught: a long folder name makes the key insert fail after the approval, so nobody gets a key.
  it('takes a label of 60 characters and keeps the key label within 60', async () => {
    const s = await setup()
    const started = await start(s, 'x'.repeat(60))
    await s.as.admin.mutation(api.connect.approve, { code: started.userCode, site: 'andere' })
    expect((await poll(s, started.deviceCode)).body.site).toBe('andere')
    const row = await s.t.run(async (ctx) => (await ctx.db.query('pushKeys').collect())[0]!)
    expect(row.label).toBe(`connect: ${'x'.repeat(51)}`)
    expect((await post(s, '/connect/start', { label: 'x'.repeat(61) })).status).toBe(400)
    expect((await post(s, '/connect/start', { label: ' \u0000 ' })).status).toBe(400)
  })
})

describe('approving', () => {
  // Wrong behaviour caught: a staff member, the owner of another site or a signed-out caller approves a request for
  // the restaurant and so gets a publishing key they could not make on the Team page.
  it('needs the right to make a key on the Team page: staff, another site and signed-out callers are refused', async () => {
    const s = await setup()
    const started = await start(s)
    const args = { code: started.userCode, site: 'restaurant' }
    expect((await errorOf(s.as.cook.mutation(api.connect.approve, args))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.stranger.mutation(api.connect.approve, args))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.anonymous.mutation(api.connect.approve, args))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.anonymous.mutation(api.connect.lookup, { code: started.userCode }))).code).toBe('FORBIDDEN')
    expect((await errorOf(s.as.anonymous.mutation(api.connect.decline, { code: started.userCode }))).code).toBe('FORBIDDEN')
    expect(await poll(s, started.deviceCode)).toEqual({ status: 200, body: { status: 'pending' } })

    // The platform admin may, as on the Team page.
    expect(await s.as.admin.mutation(api.connect.approve, args)).toEqual({ ok: true })
    expect((await poll(s, started.deviceCode)).body.site).toBe('restaurant')
  })

  // Wrong behaviour caught: an owner approves, is removed from the site, and the computer still gets a key in their name.
  it('gives no key when the approver lost the right before the poll', async () => {
    const s = await setup()
    const started = await start(s)
    await s.as.owner.mutation(api.connect.approve, { code: started.userCode, site: 'restaurant' })
    await s.t.run(async (ctx) => {
      const member = (await ctx.db.query('memberships').collect()).find((m) => m.user === 'u-wirtin')!
      await ctx.db.patch(member._id, { role: 'staff' })
    })
    expect(await poll(s, started.deviceCode)).toEqual(NOT_VALID)
    expect(await s.t.run(async (ctx) => (await ctx.db.query('pushKeys').collect()).length)).toBe(0)
  })
})

describe('a code works once', () => {
  // Wrong behaviour caught: a declined, expired or used request is approved again or polled into a key, or the answer
  // tells an attacker which of these it was.
  it('declined, expired, used and unknown requests give no key and the same answer', async () => {
    const s = await setup()
    const declined = await start(s)
    expect(await s.as.owner.mutation(api.connect.decline, { code: declined.userCode })).toEqual({ ok: true })
    expect(await s.as.owner.mutation(api.connect.approve, { code: declined.userCode, site: 'restaurant' })).toEqual({ ok: false, reason: 'invalid' })
    expect(await poll(s, declined.deviceCode)).toEqual(NOT_VALID)

    const used = await start(s)
    await s.as.owner.mutation(api.connect.approve, { code: used.userCode, site: 'restaurant' })
    expect((await poll(s, used.deviceCode)).status).toBe(200)
    expect(await s.as.owner.mutation(api.connect.approve, { code: used.userCode, site: 'restaurant' })).toEqual({ ok: false, reason: 'invalid' })
    expect(await poll(s, used.deviceCode)).toEqual(NOT_VALID)

    const late = await start(s)
    const approvedLate = await start(s)
    await s.as.owner.mutation(api.connect.approve, { code: approvedLate.userCode, site: 'restaurant' })
    tick(CONNECT.lifetimeMs + 1000)
    expect(await s.as.owner.mutation(api.connect.lookup, { code: late.userCode })).toEqual({ ok: false, reason: 'invalid' })
    expect(await s.as.owner.mutation(api.connect.approve, { code: late.userCode, site: 'restaurant' })).toEqual({ ok: false, reason: 'invalid' })
    expect(await poll(s, late.deviceCode)).toEqual(NOT_VALID)
    expect(await poll(s, approvedLate.deviceCode)).toEqual(NOT_VALID)
    expect(await poll(s, 'unknown-device-code-unknown-device-code-123')).toEqual(NOT_VALID)
    expect(await poll(s, 'short')).toEqual(NOT_VALID)
    expect(await s.t.run(async (ctx) => (await ctx.db.query('pushKeys').collect()).length)).toBe(1)
  })
})

describe('wrong codes', () => {
  // Wrong behaviour caught: a signed-in person guesses codes without limit until one names somebody's request.
  it('after 5 wrong codes in 10 minutes, the person is refused for the rest of that window, the right code too', async () => {
    const s = await setup()
    const started = await start(s)
    for (let i = 0; i < 5; i++) expect(await s.as.cook.mutation(api.connect.lookup, { code: 'AAAA-AAA2' })).toEqual({ ok: false, reason: 'invalid' })
    expect(await s.as.cook.mutation(api.connect.lookup, { code: started.userCode })).toEqual({ ok: false, reason: 'limited' })
    expect(await s.as.cook.mutation(api.connect.decline, { code: started.userCode })).toEqual({ ok: false, reason: 'limited' })
    expect(await s.as.cook.mutation(api.connect.approve, { code: started.userCode, site: 'restaurant' })).toEqual({ ok: false, reason: 'limited' })
    // Another person is not blocked by the cook's guesses.
    expect(await s.as.owner.mutation(api.connect.lookup, { code: started.userCode })).toMatchObject({ ok: true })
    // The next window starts fresh.
    tick(CONNECT.windowMs + 1000)
    const again = await start(s)
    expect(await s.as.cook.mutation(api.connect.lookup, { code: again.userCode })).toMatchObject({ ok: true })
  })

  // Wrong behaviour caught: approve and decline do not count, so guessing moves to them.
  it('counts wrong codes in approve and decline too', async () => {
    const s = await setup()
    const started = await start(s)
    for (let i = 0; i < 3; i++) await s.as.owner.mutation(api.connect.approve, { code: 'BBBB-BBBB', site: 'restaurant' })
    for (let i = 0; i < 2; i++) await s.as.owner.mutation(api.connect.decline, { code: 'not a code' })
    expect(await s.as.owner.mutation(api.connect.approve, { code: started.userCode, site: 'restaurant' })).toEqual({ ok: false, reason: 'limited' })
  })
})

describe('the table cannot be filled', () => {
  // Wrong behaviour caught: a script calls /connect/start without end and fills the database; expired rows stay forever.
  it('refuses a new request while 200 are pending, and the next start and the daily clean-up remove expired rows', async () => {
    const s = await setup()
    vi.stubEnv('SITE_URL', 'https://cms.example.test')
    await s.t.run(async (ctx) => {
      for (let i = 0; i < CONNECT.maxPending; i++) {
        await ctx.db.insert('connectRequests', { deviceHash: `h${i}`, userCode: `FLOOD${i}`, label: 'flood', expiresAt: Date.now() + CONNECT.lifetimeMs, state: 'pending' })
      }
    })
    const full = await post(s, '/connect/start', { label: 'one more' })
    expect(full.status).toBe(429)
    expect(await full.json()).toEqual({ code: 'RATE_LIMITED', message: 'Too many connect requests are open. Try again in 10 minutes.' })

    tick(CONNECT.lifetimeMs + 1000)
    expect((await post(s, '/connect/start', { label: 'after' })).status).toBe(200)
    const count = () => s.t.run(async (ctx) => (await ctx.db.query('connectRequests').collect()).length)
    expect(await count()).toBe(CONNECT.maxPending - 20 + 1)
    await s.as.owner.mutation(api.connect.lookup, { code: 'AAAA-AAA2' })
    tick(CONNECT.lifetimeMs + 1000)
    // 181 expired rows: a run takes 100 and schedules the next one; here the second run is called directly.
    await s.t.mutation(internal.cleanup.daily, {})
    await s.t.mutation(internal.cleanup.daily, {})
    expect(await count()).toBe(0)
    expect(await s.t.run(async (ctx) => (await ctx.db.query('connectTries').collect()).length)).toBe(0)
  })
})

describe('no secret leaves the body', () => {
  // Wrong behaviour caught: the device code or the key ends up in a log line or an error message, where hosting logs
  // and CI output keep it.
  it('logs and error messages carry neither the device code nor the key', async () => {
    const s = await setup()
    const lines: string[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')) })
    }
    const started = await start(s)
    await s.as.owner.mutation(api.connect.approve, { code: started.userCode, site: 'restaurant' })
    const key = (await poll(s, started.deviceCode)).body.key as string
    const again = await poll(s, started.deviceCode)
    vi.restoreAllMocks()
    const text = [...lines, JSON.stringify(again.body)].join('\n')
    expect(text).not.toContain(started.deviceCode)
    expect(text).not.toContain(key)
  })
})

describe('the ginko connect command', () => {
  // Wrong behaviour caught: the CLI and the routes disagree on the protocol (paths, fields, the pending answer), so the
  // command never gets the key the person confirmed, or gets one that the release routes refuse.
  it('gets a working key end to end: start, the approval while it waits, the poll', async () => {
    const s = await setup()
    vi.stubEnv('SITE_URL', 'http://localhost:3100')
    const log: string[] = []
    let stdout = ''
    let approved = false
    const code = await main(['connect', 'http://localhost:3100'], {
      env: {},
      git: async () => '',
      stdout: (text) => { stdout += text },
      log: (line) => { log.push(line) },
      // The Convex router has no discovery document, so the address is the backend itself.
      fetch: (url, init) => { const { pathname, search } = new URL(url); return s.t.fetch(pathname + search, init) },
    }, {
      open: () => {},
      run: async () => { throw new Error('spawn gh ENOENT') },
      ask: async () => undefined,
      cwd: () => '/home/anna/linde-website',
      async sleep() {
        if (approved) return
        const userCode = /enter this code: (\S+)$/.exec(log[0]!)![1]!
        expect(await s.as.owner.mutation(api.connect.approve, { code: userCode, site: 'restaurant' })).toEqual({ ok: true })
        approved = true
      },
    })
    expect(code).toBe(0)
    expect(stdout).toBe('{"ok":true,"site":"restaurant","stored":"shown"}\n')
    expect(log[0]).toMatch(/^Open http:\/\/localhost:3100\/connect and enter this code: [A-Z2-9]{4}-[A-Z2-9]{4}$/)
    const key = log.at(-1)!
    expect(key).toMatch(/^ginko_restaurant_[a-z0-9]{32}$/)
    expect((await s.t.fetch('/release/state?site=restaurant', { headers: { authorization: `Bearer ${key}` } })).status).toBe(200)
  })
})
