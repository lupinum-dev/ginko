// A long text that lost most of its length since its last save: usually a slip (in Markdown mode, a select-all and one
// typed line), sometimes a deliberate rewrite. The save bar says so in one muted line; saving is not blocked.
import type { Fields, Json, Locale } from '@lupinum/ginko'
import { fileRefsIn } from '@lupinum/ginko/internal'
import type { Data } from './content'
import type { Words } from './when'

export interface Shrunk { key: string; before: number; after: number; files: number }

/** Shorter saved texts are left out: rewriting a few lines is normal. */
const MIN_BEFORE = 300
/** What is left of the saved length below which a text counts as mostly removed. */
const SHARE = 0.4

const textIn = (value: Json | undefined, locale: Locale): string => {
  if (typeof value === 'string') return value
  const text = value && typeof value === 'object' && !Array.isArray(value) ? value[locale] : undefined
  return typeof text === 'string' ? text : ''
}

/**
 * The Markdown fields whose text in `locale` had at least 300 characters when saved and now has less than 40 % of them,
 * with the library files it no longer names: pictures, and files it linked (a price list), which a text cannot tell apart.
 */
export function shrunkTexts(fields: Fields, baseline: Data, draft: Data, locale: Locale): Shrunk[] {
  return Object.entries(fields).flatMap(([key, field]) => {
    if (field.type !== 'markdown') return []
    const before = textIn(baseline[key], locale)
    const after = textIn(draft[key], locale)
    if (before.length < MIN_BEFORE || after.length >= before.length * SHARE) return []
    const kept = fileRefsIn(after)
    const files = [...fileRefsIn(before)].filter((id) => !kept.has(id)).length
    return [{ key, before: before.length, after: after.length, files }]
  })
}

/** "„Text“ ist viel kürzer als vorher: 80 statt 2.400 Zeichen. 4 Dateien weniger." */
export function shrunkHint(shrunk: Shrunk, label: string, { t, format }: Words): string {
  const text = t('entry.shrunk.text', { field: label, after: format.number(shrunk.after), before: format.number(shrunk.before) })
  return shrunk.files ? `${text} ${t('entry.shrunk.files', { count: shrunk.files })}` : text
}
