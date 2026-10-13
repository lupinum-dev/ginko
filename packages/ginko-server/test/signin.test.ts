// Sign-in codes (SPEC 10): mail.queueCode is what the Better Auth `email` hook calls.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api, internal } from '../convex/_generated/api'
import { setup } from './setup'

beforeEach(() => {
  vi.stubEnv('GINKO_MAIL', 'outbox')
  vi.stubEnv('SITE_URL', 'https://ginko.test')
})
afterEach(() => vi.unstubAllEnvs())

it('a code goes to an invited or known address, never to anyone else (break-it)', async () => {
  const s = await setup()
  await s.as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'gast@example.com', role: 'staff', grants: [] })
  for (const to of ['gast@example.com', 'Wirtin@Example.com', 'fremd-ohne-einladung@example.com']) {
    await s.t.mutation(internal.mail.queueCode, { to, otp: '123456' })
  }
  const codes = await s.t.run((ctx) => ctx.db.query('outbox').collect())
  expect(codes.filter((m) => m.subject === 'Dein Anmeldecode').map((m) => m.to).sort()).toEqual(['gast@example.com', 'wirtin@example.com'])
})

it("an invitee's first code comes in the inviter's language", async () => {
  const s = await setup()
  await s.as.owner.mutation(api.account.setLocale, { locale: 'en' })
  await s.as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'guest@example.com', role: 'staff', grants: [] })
  await s.t.mutation(internal.mail.queueCode, { to: 'guest@example.com', otp: '123456' })
  const mails = await s.t.run((ctx) => ctx.db.query('outbox').collect())
  expect(mails.map((m) => m.subject)).toEqual(['Invitation to Gasthaus zur Linde', 'Your sign-in code'])
})

// Astra phase 8: without a mail way, sign-in is off and every code request fails the same (no hint about the address).
it('without mail, sign-in is reported off and known and unknown addresses fail alike', async () => {
  const s = await setup()
  vi.stubEnv('GINKO_MAIL', '')
  expect(await s.t.query(api.mail.signInAvailable, {})).toBe(false)
  const failures = []
  for (const to of ['wirtin@example.com', 'niemand@example.com']) {
    failures.push(await s.t.mutation(internal.mail.queueCode, { to, otp: '123456' }).then(() => 'sent', (e: { data?: { code?: string; message?: string } }) => `${e.data?.code}: ${e.data?.message}`))
  }
  expect(failures).toEqual(['INVALID: Anmeldung noch nicht eingerichtet.', 'INVALID: Anmeldung noch nicht eingerichtet.'])
})

// Hosted mail: the code goes out through Resend and is not kept in a table; without its key, sign-in stays off.
it('with GINKO_MAIL=resend, a code is sent through Resend and not stored, except to .test addresses; without the key sign-in is off', async () => {
  const s = await setup()
  vi.stubEnv('GINKO_MAIL', 'resend')
  vi.stubEnv('GINKO_MAIL_FROM', 'Ginko <onboarding@resend.dev>')
  vi.stubEnv('RESEND_API_KEY', '')
  expect(await s.t.query(api.mail.signInAvailable, {})).toBe(false)
  vi.stubEnv('RESEND_API_KEY', 're_test')
  const fetch = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  vi.useFakeTimers()
  await s.t.mutation(internal.mail.queueCode, { to: 'Wirtin@Example.com', otp: '654321' })
  await s.t.mutation(internal.mail.queueCode, { to: 'niemand@example.com', otp: '111111' })
  // A test account (reserved .test domain) signs in through the outbox, also on a hosted deployment.
  await s.as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'koechin@example.test', role: 'staff', grants: [] })
  await s.t.mutation(internal.mail.queueCode, { to: 'koechin@example.test', otp: '222222' })
  await s.t.finishAllScheduledFunctions(vi.runAllTimers)
  vi.unstubAllGlobals()
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.resend.com/emails')
  expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test')
  expect(JSON.parse(init.body as string)).toEqual({ from: 'Ginko <onboarding@resend.dev>', to: ['wirtin@example.com'], subject: 'Dein Anmeldecode', text: 'Dein Anmeldecode: 654321\n\nEr ist 5 Minuten gültig.\n' })
  const kept = await s.t.run((ctx) => ctx.db.query('outbox').collect())
  expect(kept.map((m) => [m.to, m.subject])).toEqual([['koechin@example.test', 'Einladung zu Gasthaus zur Linde'], ['koechin@example.test', 'Dein Anmeldecode']])
})

// Security review 13 Oct: sign-in proves the mailbox with a code. A password sign-up for an invited address would
// skip that proof and take the invitation (or admin, for an address in GINKO_ADMIN_EMAILS).
it('an invited address cannot sign up or sign in with a password', async () => {
  const s = await setup()
  await s.as.owner.mutation(api.invites.create, { site: 'restaurant', email: 'gast@example.com', role: 'staff', grants: [] })
  // As the Studio's auth proxy sends it: the visitor IP, signed with the shared proxy secret.
  const secret = 'x'.repeat(32)
  vi.stubEnv('BCN_AUTH_PROXY_IP_SECRET', secret)
  vi.stubEnv('CONVEX_SITE_URL', 'https://platform.ginko.test')
  vi.stubEnv('BETTER_AUTH_SECRETS', `0:${'a'.repeat(64)}`)
  const ip = '203.0.113.7'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v1\n${ip}`))).toString('base64url')
  const post = (path: string, body: object) => s.t.fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://ginko.test', 'x-bcn-client-ip': ip, 'x-bcn-client-ip-signature': signature },
    body: JSON.stringify(body),
  })
  const credentials = { email: 'gast@example.com', password: 'a-long-attacker-password' }
  expect((await post('sign-up/email', { ...credentials, name: 'Gast' })).ok).toBe(false)
  expect((await post('sign-in/email', credentials)).ok).toBe(false)
  // The same request shape still reaches the code sign-in, so the refusals above are not a broken request.
  expect((await post('email-otp/send-verification-otp', { email: 'gast@example.com', type: 'sign-in' })).ok).toBe(true)
  const codes = await s.t.run((ctx) => ctx.db.query('outbox').collect())
  expect(codes.filter((m) => m.to === 'gast@example.com' && m.subject === 'Dein Anmeldecode')).toHaveLength(1)
})
