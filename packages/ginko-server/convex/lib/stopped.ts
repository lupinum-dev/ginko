// A plan that did not go online (D103) in words: one line with the title, one with the cause. Today's "waits for you"
// row and the mail to the planner and the owners (D104) say the same, from the catalog's `stopped.*`.
import type { Label } from '@lupinum/ginko'
import { ConvexError } from 'convex/values'
import { labelOf as labelIn, type Schema } from '@lupinum/ginko/internal'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { knownSiteOrigin, mailAvailable, queueMail } from '../mail'
import type { StopReason } from '../schema'
import { rootOf } from './content'
import { historyText, msg, type HistoryMsg } from './history'
import { localeOfUser } from './i18n'

/** Quotes around a field's label, as each language writes them; another language gets the English ones. */
const QUOTES: Record<string, [string, string]> = { de: ['„', '“'], en: ['“', '”'], es: ['“', '”'], fr: ['« ', ' »'] }

/** The labels of the failing fields, each in quotes, per language: “Title”, “Date”. */
function quotedFields(schema: Schema, brickKey: string, paths: string[]): { fields: Label; count: number } {
  const fields = schema.bricks[brickKey]?.fields ?? {}
  const main = schema.locales[0]!
  const roots = [...new Set(paths.map(rootOf))].filter((r) => Object.hasOwn(fields, r))
  const shown = Object.fromEntries(schema.locales.map((l) => {
    const [open, close] = QUOTES[l] ?? QUOTES.en!
    return [l, roots.map((r) => `${open}${labelIn(fields[r]!.label, l, main)}${close}`).join(', ')]
  }))
  return { fields: shown, count: roots.length }
}

/**
 * The cause as a sentence of its own (`stopped.cause.*`) or as the end of "… because" (`stopped.because.*`). An error of
 * the run itself says what to do next, which differs for a planned draft and a dated change.
 */
function causeOf(schema: Schema, brickKey: string, reason: StopReason, form: 'cause' | 'because', of: 'plan' | 'change'): HistoryMsg {
  if (reason.code === 'link') return msg(`stopped.${form}.link`, { href: reason.href })
  if (reason.code === 'invalid') return msg(`stopped.${form}.invalid`, quotedFields(schema, brickKey, reason.fields))
  if (reason.code === 'failed') return msg(`stopped.${form}.${of === 'plan' ? 'failed' : 'changeFailed'}`)
  return msg(`stopped.${form}.late`)
}

/** What a log line may say of an error: its code or its class only, since its message can hold an address or a title. */
export function errorKind(error: unknown): string {
  if (error instanceof ConvexError) return String((error.data as { code?: unknown } | null)?.code)
  return error instanceof Error ? error.constructor.name : typeof error
}

/** A stopped entry, with its title as the history names it (entries `labelOf`). */
type Stopped = Pick<Doc<'entries'>, 'brick'> & { stopped: NonNullable<Doc<'entries'>['stopped']>; title: string }

/** Today's row: `“{title}” did not go online`, and the cause as its second line. */
export function stoppedLines(schema: Schema, entry: Stopped): { title: HistoryMsg; cause: HistoryMsg } {
  return {
    title: msg('stopped.title', { title: entry.title }),
    cause: causeOf(schema, entry.brick, entry.stopped.reason, 'cause', 'plan'),
  }
}

/** A dated change that did not take effect on its day (D127), with its entry's title and the first minute of its day. */
type StoppedChange = { brick: string; title: string; day: number; fields: string[]; reason: StopReason }

/** Today's row of a stopped dated change: `“{title}”: the change from {day} did not take effect`, and the cause. */
export function stoppedChangeLines(schema: Schema, change: StoppedChange): { title: HistoryMsg; cause: HistoryMsg } {
  return { title: msg('stopped.changeTitle', { title: change.title, day: change.day }), cause: causeOf(schema, change.brick, change.reason, 'cause', 'change') }
}

/** The cause of a stop as the end of "… because", for a history line. */
export const stoppedBecause = (schema: Schema, brickKey: string, reason: StopReason) => causeOf(schema, brickKey, reason, 'because', 'change')

/**
 * Tells the planner, while that person is still a member of the site, and the owners that a plan stopped, each in their
 * language, with a link that opens the entry. Without mail set up, Today's row is the only sign.
 */
export async function mailStopped(ctx: MutationCtx, site: Doc<'sites'>, entry: Stopped & Pick<Doc<'entries'>, '_id'>) {
  const schema = site.schema as Schema
  await mailOwnersAnd(ctx, site, entry.stopped.by, entry, (locale, path) => ({
    subject: historyText(msg('mail.stopped.subject', { title: entry.title }), locale, schema),
    text: historyText(msg('mail.stopped.text', { at: entry.stopped.at, because: causeOf(schema, entry.brick, entry.stopped.reason, 'because', 'plan'), path }), locale, schema),
  }))
}

/** `mailStopped` for a dated change that did not take effect (D127): to the person who made it and the owners. */
export async function mailStoppedChange(ctx: MutationCtx, site: Doc<'sites'>, entry: Pick<Doc<'entries'>, '_id' | 'brick'>, by: string | undefined, change: StoppedChange) {
  const schema = site.schema as Schema
  await mailOwnersAnd(ctx, site, by, entry, (locale, path) => ({
    subject: historyText(msg('mail.stoppedChange.subject', { title: change.title }), locale, schema),
    text: historyText(msg('mail.stoppedChange.text', { day: change.day, fields: quotedFields(schema, change.brick, change.fields).fields, because: causeOf(schema, change.brick, change.reason, 'because', 'change'), path }), locale, schema),
  }))
}

/**
 * Mails the owners and `by` (while a member) in their language, with a link that opens the entry. Without mail set up,
 * or without the Studio's address for the link, nobody gets one and Today's row is the sign.
 */
async function mailOwnersAnd(ctx: MutationCtx, site: Doc<'sites'>, by: string | undefined, entry: Pick<Doc<'entries'>, '_id' | 'brick'>, words: (locale: string, path: string) => { subject: string; text: string }) {
  if (!mailAvailable()) return
  const origin = knownSiteOrigin()
  if (!origin) {
    console.warn(`Mail stopped ${entry._id} not sent: SITE_URL is not set.`)
    return
  }
  const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).collect()
  const path = `${origin}/s/${site.slug}/all/${entry.brick}/${entry._id}`
  // Every read and every text first, then the queue: a read that throws queues no mail at all, never some of them.
  const mails: { to: string; subject: string; text: string }[] = []
  for (const member of members) {
    if (!member.email || (member.role !== 'owner' && member.user !== by)) continue
    mails.push({ to: member.email, ...words(await localeOfUser(ctx, member.user), path) })
  }
  for (const mail of mails) await queueMail(ctx, 'stopped', mail)
}
