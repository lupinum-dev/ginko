// The weekly reminder (SPEC 10): content that is out of date for the coming week (`staleOf`, the rule
// the Studio shows too) is mailed once per person and week, on the day before the site's week starts (Sunday for Monday-first weeks), between 17:00 and 18:00 in the site's time zone.
import { startOfWeek, type Json } from '@lupinum/ginko'
import { addDays, labelOf, plannedWeeks, staleOf, todayIn, weeklyTask, workWeekOf, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import { components } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { localeOfUser, t } from './lib/i18n'
import { mailAvailable, queueMail, siteOrigin } from './mail'

const REMIND_HOUR = 17

/** Hour of day (0 to 23) at `now` in `timeZone`. */
function hourIn(timeZone: string, now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).find((p) => p.type === 'hour')?.value
  return Number(hour)
}

/** Who the reminder mails about a weekly task: owners, and staff who hold that task (SPEC 2.7). */
export const isReminded = (member: Pick<Doc<'memberships'>, 'role' | 'grants'>, taskRef: string) => member.role === 'owner' || member.grants.includes(taskRef)

/** The weekly tasks ("brick.task") of the site's live singles: what the reminder can mail about (see `weeklyTask`). */
export const weeklyRefs = (schema: Schema): string[] => Object.entries(schema.bricks).flatMap(([key, brick]) => {
  const task = brick.kind === 'single' && !brick.retired ? weeklyTask(brick)?.task : undefined
  return task ? [`${key}.${task.id}`] : []
})

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
  let sent = 0
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.kind !== 'single' || brick.retired) continue
    const entry = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', key)).first()
    if (!entry || entry.deletedAt) continue
    const state = staleOf(brick, entry.data, coming, info, plannedWeeks(schema, key, (k) => live.get(k) ?? []))
    if (!state || state.current) continue
    // Owners may fix everything; staff only with the task that edits the field (SPEC 2.7).
    const task = `${key}.${state.task.id}`
    for (const member of members.filter((m) => isReminded(m, task))) {
      const done = await ctx.db.query('reminders').withIndex('by_site_brick_week_user', (q) => q.eq('site', site._id).eq('brick', key).eq('week', week).eq('user', member.user)).first()
      if (done) continue
      const to = await addressOf(ctx, member.user)
      if (!to) continue
      const locale = await localeOfUser(ctx, member.user)
      await ctx.db.insert('reminders', { site: site._id, brick: key, week, user: member.user, at })
      await queueMail(ctx, {
        to,
        subject: t(locale, 'mail.reminder.subject', { brick: labelOf(brick.label, locale, schema.locales[0]!) }),
        text: t(locale, 'mail.reminder.text', { site: site.name, brick: labelOf(brick.label, locale, schema.locales[0]!), link: `${siteOrigin()}/s/${site.slug}`, settings: `${siteOrigin()}/?all` }),
      })
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
