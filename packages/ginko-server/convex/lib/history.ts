// What the history says about a change or a proposal, stored as a catalog key plus params (`msg`), so
// each team member reads it in their own Studio language and dates in the site's time zone. Next to it
// the row keeps `sentence`, the German rendering, as the fallback for rows written before `msg`.
import type { Label } from '@lupinum/ginko'
import { labelOf, type Schema } from '@lupinum/ginko/internal'
import { storedSentence } from './input'
import { t, type MessageKey } from './i18n'

/** A value in a message: text, a number (a date is milliseconds), a label per locale, or another message. */
export type Param = string | number | Label | HistoryMsg

/** A type, not an interface, so it counts as `Json` where a mutation returns it. */
export type HistoryMsg = {
  /** A key of the server catalog (`history.*`, `publicness.*`). */
  key: string
  params?: Record<string, Param>
}

/** A message with its German rendering: what a change or proposal row stores. */
export interface Recorded {
  msg: HistoryMsg
  sentence: string
}

/** The site facts a message needs: the main language (labels fall back to it) and the zone of its dates. */
type Where = Pick<Schema, 'locales' | 'timeZone'>

/** The key is checked against the catalog where a message is built. */
export const msg = (key: MessageKey, params?: Record<string, Param>): HistoryMsg => (params ? { key, params } : { key })

const isMsg = (value: Param): value is HistoryMsg =>
  typeof value === 'object' && typeof value.key === 'string' && Object.keys(value).every((k) => k === 'key' || k === 'params')

/** The text of a message in `locale`: nested messages first, labels in `locale` (else the main language), dates in the site's zone. */
export function historyText(message: HistoryMsg, locale: string, where: Where | undefined): string {
  const main = where?.locales[0] ?? 'de'
  const params = Object.fromEntries(Object.entries(message.params ?? {}).map(([name, value]) => [
    name,
    typeof value === 'string' || typeof value === 'number' ? value : isMsg(value) ? historyText(value, locale, where) : labelOf(value, locale, main),
  ]))
  return t(locale, message.key as MessageKey, params, { timeZone: where?.timeZone ?? 'UTC' })
}

/** The row fields `msg` and `sentence` (German, cut to the stored length) for a message. */
export function recorded(message: HistoryMsg, where?: Where): Recorded {
  return { msg: message, sentence: storedSentence(historyText(message, 'de', where)) }
}
