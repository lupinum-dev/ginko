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
