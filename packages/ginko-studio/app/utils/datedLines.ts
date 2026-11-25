// What the Studio says about an entry's changes with days beside their own notice text (slice 3), in one place for the
// task sheet, the editor's notices and the editor's fields: two exceptions on the same days (the later start wins), a
// change without an end that waits for an exception's end, and under a field an exception covers today what the
// website shows instead (the form always edits the normal value).
import type { InjectionKey } from 'vue'
import type { Fields, Locale } from '@lupinum/ginko'
import { valuesText, type Data, type ValueWords } from './content'

/** A change that waits or holds (stopped ones left out), as `datedChanges.list` gives it. */
export interface DatedRow { id: string; from: string; until?: string; holds?: boolean; fields: readonly string[]; values: Data }

/** "26. Nov.": the days in a line and a hint. */
const dayMonth = (day: string, words: ValueWords) => words.format.date(day, { day: 'numeric', month: 'short' })
/** "So., 6. Dez.": the days of an exception in its notice. */
const shortDay = (day: string, words: ValueWords) => words.format.date(day, { weekday: 'short', day: 'numeric', month: 'short' })

/** An exception's days and labels as `datedChanges.list` gives them (the days of its time of today). */
export interface ExceptionNotice { from: string; until: string; holds?: boolean; yearly?: boolean; name?: string | null }

/**
 * The notice of an exception, in the task sheet and the editor: its days and `changes`, while it holds what the website
 * shows instead of `normal`. The name leads when there is one; a yearly one names its days without a year and, while
 * it holds, says that it comes back (slice 4).
 */
export function exceptionText(c: ExceptionNotice, changes: string, normal: string | undefined, words: ValueWords): string {
  const { t } = words
  const name = c.name ?? ''
  if (!c.holds) {
    if (c.yearly) {
      const days = { day: dayMonth(c.from, words), until: dayMonth(c.until, words), changes, name }
      return name ? t('dated.waitingYearlyNamed', days) : t('dated.waitingYearly', days)
    }
    const days = { day: shortDay(c.from, words), until: shortDay(c.until, words), changes, name }
    return name ? t('dated.waitingUntilNamed', days) : t('dated.waitingUntil', days)
  }
  const params = { until: shortDay(c.until, words), changes, name, normal: normal ?? '' }
  const text = normal
    ? (name ? t('dated.holdingNamed', params) : t('dated.holding', params))
    : (name ? t('dated.holdingPlainNamed', params) : t('dated.holdingPlain', params))
  return c.yearly ? t('dated.comesBack', { text }) : text
}

/**
 * The line under the notice of `n`: an exception that starts inside an earlier one of a shared field names the days
 * both hold and that the website shows the later one; a change without an end inside an exception waits for its end.
 */
export function datedLine(rows: readonly DatedRow[], n: DatedRow, words: ValueWords): { test: 'dated-overlap' | 'dated-after-end'; text: string } | undefined {
  const around = rows.filter((o) => o.id !== n.id && o.until !== undefined && o.fields.some((k) => n.fields.includes(k)))
  if (n.until === undefined) return around.some((o) => o.from <= n.from && n.from <= o.until!) ? { test: 'dated-after-end', text: words.t('dated.afterEnd') } : undefined
  const earlier = around.find((o) => o.from < n.from && n.from <= o.until!)
  if (!earlier) return undefined
  const end = earlier.until! < n.until ? earlier.until! : n.until
  return { test: 'dated-overlap', text: words.t('dated.overlap', { from: dayMonth(n.from, words), until: dayMonth(end, words) }) }
}

/** Under field `key` when an exception covers it today: what the website shows instead, and until when. */
export function coveredHint(rows: readonly DatedRow[], key: string, fields: Fields, main: Locale, words: ValueWords): string {
  const n = rows.find((o) => o.holds && o.fields.includes(key))
  if (!n?.until) return ''
  const value = valuesText(fields, [key], n.values, main, words)
  return value ? words.t('dated.covered', { until: dayMonth(n.until, words), value }) : words.t('dated.coveredOther', { until: dayMonth(n.until, words) })
}

/** The id of the hint under field `path` (GinkoField's own id plus `-covered`), which the field is described by. */
export const coveredId = (path: string) => `f-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}-covered`

/** The editor's hint per field (`coveredHint` over the entry's changes), for EntryFields. */
export const COVERED: InjectionKey<(key: string) => string> = Symbol('ginko:covered')
