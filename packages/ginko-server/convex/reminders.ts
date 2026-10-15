// The weekly reminder (SPEC 10): content that is out of date for the coming week (`staleOf`, the rule
// the Studio shows too), and the due status lines of the Today page (lib/status.ts) in the Studio's words, are mailed
// once per brick, person and week, on the day before the site's week starts (Sunday for Monday-first weeks), between 17:00 and 18:00 in the site's time zone.
import { startOfWeek, type Json } from '@lupinum/ginko'
import { addDays, labelOf, plannedWeeks, staleOf, todayIn, workWeekOf, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import { components } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { localeOfUser, t } from './lib/i18n'
import { isReminded, reminderBricks } from './lib/reminders'
import { statesOf, statusText } from './lib/status'
import { mailAvailable, queueMail, siteOrigin } from './mail'

const REMIND_HOUR = 17

/** Hour of day (0 to 23) at `now` in `timeZone`. */
function hourIn(timeZone: string, now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).find((p) => p.type === 'hour')?.value
  return Number(hour)
}

/** Whether tomorrow is the first day of the site's week. */
const isDayBeforeWeekStart = (date: string, schema: Schema) => startOfWeek(addDays(date, 1), schema.week) === addDays(date, 1)

/**
 * Hourly. Sends the reminders of every site whose 17:00 hour on the day before the week starts it is. `now` is for tests and the
 * live check; the cron passes nothing. Sending twice is harmless: a `reminders` row per site, brick,
 * week and person stops it.
 */
export const sweep = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ sent: number }> => {
    if (!mailAvailable()) return { sent: 0 }
    const now = new Date(args.now ?? Date.now())
    let sent = 0
    for (const site of await ctx.db.query('sites').collect()) {
      if (site.deleting) continue
      const schema = site.schema as Schema
      const today = todayIn(schema.timeZone, now)
      if (!isDayBeforeWeekStart(today, schema) || hourIn(schema.timeZone, now) !== REMIND_HOUR) continue
      sent += await remindSite(ctx, site, schema, today, now.getTime())
    }
    return { sent }
  },
})

async function remindSite(ctx: MutationCtx, site: Doc<'sites'>, schema: Schema, today: string, at: number): Promise<number> {
  // Tomorrow starts the coming week; asking from there keeps the rule right for any first day.
  const coming = addDays(today, 1)
  const info = schema.week
  const week = workWeekOf(coming, info)
  const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).collect()
  // Live entries of the collections that plan weeks ahead (no drafts, nothing deleted), read once per site.
  const live = new Map<string, { data: Record<string, Json> }[]>()
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.kind !== 'collection' || !brick.plans) continue
    const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', key)).collect()
    live.set(key, rows.filter((r) => !r.deletedAt && r.state !== 'draft').map((r) => ({ data: r.data as Record<string, Json> })))
  }
  const bricks = reminderBricks(schema)
  // Status lines are asked for the coming week's first day, like the weekly rule.
  const states = new Map((await statesOf(ctx, site, bricks.filter((b) => !b.weekly).map((b) => b.key), coming)).map((s) => [s.brick, s]))
  let sent = 0
  for (const { key, brick, weekly, refs } of bricks) {
    let mail: ((locale: string) => { subject: string; text: string }) | undefined
    const label = (locale: string) => labelOf(brick.label, locale, schema.locales[0]!)
    if (weekly) {
      const entry = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', key)).first()
      if (!entry || entry.deletedAt) continue
      const state = staleOf(brick, entry.data, coming, info, plannedWeeks(schema, key, (k) => live.get(k) ?? []))
      if (!state || state.current) continue
      mail = (locale) => ({
        subject: t(locale, 'mail.reminder.subject', { brick: label(locale) }),
        text: t(locale, 'mail.reminder.text', { site: site.name, brick: label(locale), link: `${siteOrigin()}/s/${site.slug}`, settings: `${siteOrigin()}/?all` }),
      })
    } else {
      const state = states.get(key)
      const line = state?.due && state.line ? state.line : undefined
      if (!line) continue
      const words = (locale: string) => statusText(locale, schema, brick, line)
      if (words(schema.locales[0]!) === null) continue
      mail = (locale) => ({
        subject: t(locale, 'mail.statusReminder.subject', { brick: label(locale), line: words(locale)! }),
        text: t(locale, 'mail.statusReminder.text', { site: site.name, brick: label(locale), line: words(locale)!, link: `${siteOrigin()}/s/${site.slug}`, settings: `${siteOrigin()}/?all` }),
      })
    }
    // Owners may fix everything; staff only with a task that fixes it (SPEC 2.7).
    for (const member of members.filter((m) => isReminded(m, refs))) {
      const done = await ctx.db.query('reminders').withIndex('by_site_brick_week_user', (q) => q.eq('site', site._id).eq('brick', key).eq('week', week).eq('user', member.user)).first()
      if (done) continue
      const to = await addressOf(ctx, member.user)
      if (!to) continue
      const locale = await localeOfUser(ctx, member.user)
      await ctx.db.insert('reminders', { site: site._id, brick: key, week, user: member.user, at })
      await queueMail(ctx, { to, ...mail(locale) })
      sent++
    }
  }
  return sent
}

/** The verified address of a person who has not switched reminders off, else nothing. */
async function addressOf(ctx: MutationCtx, userId: string): Promise<string | undefined> {
  const settings = await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', userId)).unique()
  if (settings?.remindByMail === false) return undefined
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'user', where: [{ field: 'id', value: userId }] })
  return user?.emailVerified === true && typeof user.email === 'string' ? user.email : undefined
}
