// The one place that sends mail (SPEC 10). GINKO_MAIL picks the way:
// - `outbox`: mail goes to the `outbox` table, which local development and tests read;
// - `resend`: mail goes out through Resend (RESEND_API_KEY, GINKO_MAIL_FROM), hosted only. Mail to a
//   `.test` address (a reserved domain that never receives mail) still goes to the outbox, so test
//   accounts can sign in on a hosted deployment: `pnpm outbox <email>` prints their newest mail.
// Anything else, or a missing key, disables sending: sign-in then shows "Anmeldung noch nicht eingerichtet".
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { internalAction, internalMutation, query, type MutationCtx } from './_generated/server'
import { fail } from './lib/fail'
import { localeOfUser, t } from './lib/i18n'
import { normalizeEmail } from './members'

export interface Mail {
  to: string
  subject: string
  text: string
}

function mailWay(): 'outbox' | 'resend' | undefined {
  const way = process.env.GINKO_MAIL
  if (way === 'outbox') return 'outbox'
  if (way === 'resend' && process.env.RESEND_API_KEY && process.env.GINKO_MAIL_FROM) return 'resend'
  return undefined
}

/** RFC 2606 reserves `.test`: such an address can never receive mail, so it is safe to keep its mail. */
function isTestAddress(email: string): boolean {
  return /\.test$/i.test(email.trim())
}

/** Where the Studio lives, for links in mail. */
export function siteOrigin(): string {
  const origin = process.env.SITE_URL
  if (!origin) throw new Error('SITE_URL is not set in the Convex environment')
  return origin.replace(/\/$/, '')
}

/** Whether mail can be sent at all. */
export function mailAvailable(): boolean {
  return mailWay() !== undefined
}

/** For the sign-in page: show "Anmeldung noch nicht eingerichtet" instead of a code form that cannot work. */
export const signInAvailable = query({
  args: {},
  handler: async () => mailAvailable(),
})

/** How long a sign-in code works: auth.ts `emailOTP.expiresIn` (breakit-access pins both). Its mail is not sent again after that. */
export const CODE_LIFETIME_MS = 5 * 60 * 1000
/** The waits before the 1st, 2nd and 3rd retry of a mail Resend could not take: short for a code, longer for the rest. */
const CODE_RETRY_MS = [5_000, 30_000, 2 * 60_000]
const MAIL_RETRY_MS = [60_000, 10 * 60_000, 60 * 60_000]

/** `until`: a sign-in code's end of life; its mail is retried only before that. */
export async function queueMail(ctx: MutationCtx, mail: Mail, until?: number) {
  const way = mailWay()
  if (!way) fail('INVALID', 'errors.signInNotSetUp')
  if (way === 'outbox' || isTestAddress(mail.to)) {
    await ctx.db.insert('outbox', { ...mail, at: Date.now() })
    return
  }
  // Sent once this mutation commits, so a refused mutation sends nothing. The mail is not stored in a table.
  await ctx.scheduler.runAfter(0, internal.mail.send, { ...mail, ...(until === undefined ? {} : { until }) })
}

/** One try at Resend. A network error, 429 or 5xx may pass on a retry; any other refusal is the request's own fault. */
async function deliver(mail: Mail): Promise<{ sent: true } | { sent: false; retry: boolean; reason: string }> {
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.GINKO_MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
  } catch (error) {
    return { sent: false, retry: true, reason: `network error: ${String(error).slice(0, 200)}` }
  }
  if (response.ok) return { sent: true }
  return { sent: false, retry: response.status === 429 || response.status >= 500, reason: `${response.status} ${(await response.text()).slice(0, 300)}` }
}

/**
 * Delivery through Resend, retried up to 3 times on a passing failure (Convex does not retry actions). A sign-in
 * code is retried only while it still works. A failure is logged without the mail text, which may hold a code.
 */
export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string(), until: v.optional(v.number()), attempt: v.optional(v.number()) },
  handler: async (ctx, { until, attempt = 0, ...mail }) => {
    const outcome = await deliver(mail)
    if (outcome.sent) return
    const wait = (until === undefined ? MAIL_RETRY_MS : CODE_RETRY_MS)[attempt]
    if (outcome.retry && wait !== undefined && (until === undefined || Date.now() + wait < until)) {
      console.warn(`Mail "${mail.subject}" not sent (${outcome.reason}); retry ${attempt + 1} in ${wait / 1000} s.`)
      await ctx.scheduler.runAfter(wait, internal.mail.send, { ...mail, attempt: attempt + 1, ...(until === undefined ? {} : { until }) })
      return
    }
    throw new Error(`Resend refused the mail "${mail.subject}": ${outcome.reason}`)
  },
})

/** Called from the Better Auth `email` hook, which can only reach mutations through runMutation. */
export const queue = internalMutation({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  handler: async (ctx, mail) => {
    await queueMail(ctx, mail)
  },
})

/**
 * A sign-in code, from the Better Auth `email` hook. It goes only to people who have an account or
 * may create one (SPEC 10). Anyone else gets the same answer but no mail, so the sign-in endpoint
 * cannot be used to send mail to arbitrary addresses.
 */
export const queueCode = internalMutation({
  args: { to: v.string(), otp: v.string() },
  handler: async (ctx, args) => {
    // Without a mail way every request fails the same, before anything about the address is looked up.
    if (!mailAvailable()) fail('INVALID', 'errors.signInNotSetUp')
    const email = normalizeEmail(args.to)
    const known = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'user', where: [{ field: 'email', value: email }] })
    if (!known && !(await ctx.runQuery(internal.invites.mayJoin, { email }))) return
    // The person's own language (the Studio stores it on the first visit); a new person gets their newest
    // invite's language, else German.
    const invite = known ? null : await ctx.db.query('invites').withIndex('by_email', (q) => q.eq('email', email)).order('desc').first()
    const locale = invite?.locale ?? await localeOfUser(ctx, typeof known?.id === 'string' ? known.id : undefined)
    await queueMail(ctx, { to: email, subject: t(locale, 'mail.code.subject'), text: t(locale, 'mail.code.text', { code: args.otp }) }, Date.now() + CODE_LIFETIME_MS)
  },
})
