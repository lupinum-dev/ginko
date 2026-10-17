// The one search over entries (SPEC 4.2 search.studio, SPEC 16 ginko_search): the core search engine
// over one record per entry with all texts in all languages. The agent door and the Studio both call
// `searchEntries`; nothing else searches.
import { indexOf, stemmerNow, type SearchRecord } from '@lupinum/ginko/internal/search'
import { search } from '@lupinum/ginko/search'
import type { Brick, Field, Json } from '@lupinum/ginko'
import { isTranslatable, type Schema } from '@lupinum/ginko/internal'
import type { QueryCtx } from '../_generated/server'
import { fail, type Actor } from './access'
import type { Data } from './content'
import { labelOf } from '../entries'

// ---- Search text ----

const textOf = (value: Json | undefined): string[] =>
  typeof value === 'string' ? [value]
    : value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value).flatMap((v) => (typeof v === 'string' ? [v] : []))
    : []

/** Every text of a field value, in all languages: what a search should find. */
export function searchTexts(field: Field, value: Json | undefined, out: string[] = []): string[] {
  if (value === undefined || value === null) return out
  if (field.type === 'text' || field.type === 'longtext' || field.type === 'markdown') {
    if (isTranslatable(field) || typeof value === 'string') out.push(...textOf(value))
  } else if (field.type === 'image') {
    out.push(...textOf((value as Record<string, Json>).alt))
  } else if (field.type === 'list' && Array.isArray(value)) {
    for (const row of value) {
      if (row && typeof row === 'object' && !Array.isArray(row)) for (const [key, inner] of Object.entries(field.of)) searchTexts(inner, row[key], out)
    }
  }
  return out
}

export function searchText(brick: Brick, data: Data): string {
  return Object.entries(brick.fields).filter(([, f]) => !f.retired).flatMap(([key, f]) => searchTexts(f, data[key])).join('\n')
}

/** Lower case, ä → ae, other accents dropped; `map[i]` is the index in `text` of the i-th folded character. */
export function fold(text: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  let i = 0
  for (const char of text) {
    const lower = char.toLowerCase()
    const out = lower === 'ä' ? 'ae' : lower === 'ö' ? 'oe' : lower === 'ü' ? 'ue' : lower === 'ß' ? 'ss' : lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (const c of out) { folded += c; map.push(i) }
    i += char.length
  }
  return { folded, map }
}

const plain = (text: string) => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim()

/** A short excerpt around the first search word found in the text (the start of the text when none is). */
export function snippetOf(text: string, query: string, width = 140): string {
  const { folded, map } = fold(text)
  let at = -1
  for (const word of fold(query).folded.split(/\s+/).filter(Boolean)) {
    // The engine stems ("Gerichte" finds "Gericht"): try the word, then it without up to three letters.
    for (let cut = 0; cut <= 3 && word.length - cut >= 3; cut++) {
      const i = folded.indexOf(word.slice(0, word.length - cut))
      if (i !== -1 && (at === -1 || map[i]! < at)) at = map[i]!
      if (i !== -1) break
    }
  }
  const start = at === -1 ? 0 : Math.max(0, at - 40)
  const end = Math.min(text.length, start + width)
  const piece = plain(text.slice(start, end))
  return `${start > 0 ? '…' : ''}${piece}${end < text.length ? '…' : ''}`
}

/** Whether every word of `query` is part of `label`, ignoring case and umlauts: the match for brick and task names. */
export function labelMatches(label: string, query: string): boolean {
  const hay = fold(label).folded
  const words = fold(query).folded.split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((w) => hay.includes(w))
}

// ---- Entries ----

export type EntryState = 'draft' | 'live' | 'scheduled'

/** Where an entry stands: a draft with a time is scheduled (SPEC 15). */
export const entryState = (row: { state?: 'draft' | 'live'; publishAt?: number }): EntryState =>
  row.state === 'draft' ? (row.publishAt === undefined ? 'draft' : 'scheduled') : 'live'

export interface EntryHit { entry: string; brick: string; label: string; snippet: string; state: EntryState }

/**
 * The best entries for the words in `query` (deleted ones never), optionally in one brick, or only in the bricks
 * `within` names (the Studio's search for staff: the areas they can open).
 */
export async function searchEntries(ctx: QueryCtx, actor: Actor, input: { query: string; brick?: string; within?: ReadonlySet<string>; limit: number }): Promise<EntryHit[]> {
  const schema = actor.site.schema as Schema
  const { query, brick: only, within } = input
  if (only !== undefined && !Object.hasOwn(schema.bricks, only)) fail('INVALID', 'errors.brickNotFoundSeeOverview', { only })
  const found = new Map<string, { brick: string; label: string; text: string; state: EntryState }>()
  const records: SearchRecord[] = []
  for (const [key, def] of Object.entries(schema.bricks)) {
    if (def.retired || (only && key !== only) || (within && !within.has(key))) continue
    const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', actor.site._id).eq('brick', key)).collect()
    for (const row of rows) {
      if (row.deletedAt) continue
      const label = labelOf(schema, key, row.data as Data)
      const body = searchText(def, row.data as Data)
      found.set(row._id, { brick: key, label, text: body, state: entryState(row) })
      records.push({ id: row._id, url: '', title: label, text: body, excerpt: '', brick: key, locale: '' })
    }
  }
  // The texts of every language are in one record; the main language's word rules fit most of them. A Convex query
  // cannot load a stemmer chunk (`import()` throws), so the index takes a stemmer that is already loaded.
  const language = schema.locales[0] ?? 'de'
  const hits = search(indexOf(records, language, stemmerNow(language)), query, { limit: input.limit })
  // The engine matches word beginnings only. German compounds hide the word inside ("Topfenstrudel"), so
  // entries that contain every query word anywhere come after the engine's hits, title matches first.
  const ranked = hits.map((hit) => hit.id)
  const seen = new Set(ranked)
  const words = fold(query).folded.split(/\s+/).filter(Boolean)
  const inside = (text: string) => { const hay = fold(text).folded; return words.length > 0 && words.every((w) => hay.includes(w)) }
  const titleHits: string[] = []
  const bodyHits: string[] = []
  for (const record of records) {
    if (seen.has(record.id)) continue
    if (inside(record.title)) titleHits.push(record.id)
    else if (inside(record.text)) bodyHits.push(record.id)
  }
  return [...ranked, ...titleHits, ...bodyHits].slice(0, input.limit).map((id) => {
    const row = found.get(id)!
    return { entry: id, brick: row.brick, label: row.label, snippet: snippetOf(row.text || row.label, query), state: row.state }
  })
}
