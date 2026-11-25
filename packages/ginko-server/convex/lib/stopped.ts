// A plan that did not go online (D103) in words: one line with the title, one with the cause. Today's "waits for you"
// row and the mail to the planner and the owners (D104) say the same, from the catalog's `stopped.*`.
import type { Label } from '@lupinum/ginko'
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

/** The cause as a sentence of its own (`stopped.cause.*`) or as the end of "… because" (`stopped.because.*`). */
function causeOf(schema: Schema, brickKey: string, reason: StopReason, form: 'cause' | 'because'): HistoryMsg {
  if (reason.code === 'link') return msg(`stopped.${form}.link`, { href: reason.href })
  if (reason.code === 'invalid') return msg(`stopped.${form}.invalid`, quotedFields(schema, brickKey, reason.fields))
  return msg(`stopped.${form}.late`)
}

/** A stopped entry, with its title as the history names it (entries `labelOf`). */
type Stopped = Pick<Doc<'entries'>, 'brick'> & { stopped: NonNullable<Doc<'entries'>['stopped']>; title: string }

/** Today's row: `“{title}” did not go online`, and the cause as its second line. */
export function stoppedLines(schema: Schema, entry: Stopped): { title: HistoryMsg; cause: HistoryMsg } {
  return {
    title: msg('stopped.title', { title: entry.title }),
    cause: causeOf(schema, entry.brick, entry.stopped.reason, 'cause'),
  }
}

/**
 * Tells the planner, while that person is still a member of the site, and the owners that a plan stopped, each in their
 * language, with a link that opens the entry. Without mail set up, Today's row is the only sign.
 */
export async function mailStopped(ctx: MutationCtx, site: Doc<'sites'>, entry: Stopped & Pick<Doc<'entries'>, '_id'>) {
  if (!mailAvailable()) return
  // The mail's link needs the Studio's address; without it the mail stays out and Today's row is the sign.
  const origin = knownSiteOrigin()
  if (!origin) {
    console.warn(`Mail stopped ${entry._id} not sent: SITE_URL is not set.`)
    return
  }
  const schema = site.schema as Schema
  const members = await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', site._id)).collect()
  const path = `${origin}/s/${site.slug}/all/${entry.brick}/${entry._id}`
  for (const member of members) {
    if (!member.email || (member.role !== 'owner' && member.user !== entry.stopped.by)) continue
    const locale = await localeOfUser(ctx, member.user)
    await queueMail(ctx, 'stopped', {
      to: member.email,
      subject: historyText(msg('mail.stopped.subject', { title: entry.title }), locale, schema),
      text: historyText(msg('mail.stopped.text', { at: entry.stopped.at, because: causeOf(schema, entry.brick, entry.stopped.reason, 'because'), path }), locale, schema),
    })
  }
}
