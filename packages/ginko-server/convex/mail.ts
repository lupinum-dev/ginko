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

export async function queueMail(ctx: MutationCtx, mail: Mail) {
  const way = mailWay()
  if (!way) fail('INVALID', 'errors.signInNotSetUp')
  if (way === 'outbox' || isTestAddress(mail.to)) {
    await ctx.db.insert('outbox', { ...mail, at: Date.now() })
    return
  }
  // Sent once this mutation commits, so a refused mutation sends nothing. The mail is not stored in a table.
  await ctx.scheduler.runAfter(0, internal.mail.send, mail)
}

/** Delivery through Resend. A refusal is logged without the mail text, which may hold a sign-in code. */
export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  handler: async (_ctx, mail) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.GINKO_MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
    if (!response.ok) throw new Error(`Resend refused the mail "${mail.subject}": ${response.status} ${(await response.text()).slice(0, 300)}`)
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
    await queueMail(ctx, { to: email, subject: t(locale, 'mail.code.subject'), text: t(locale, 'mail.code.text', { code: args.otp }) })
  },
})
