// Site search: sections of the bundle's items, indexed with MiniSearch and the stemmer of the index's language.
// The engine choice lives in this one file. It imports MiniSearch, so the browser reaches it
// only through `@lupinum/ginko/search`; the core index does not export it. Pure: no Node APIs, runs in Convex too.
import MiniSearch from 'minisearch'
import { stemmer as dutch } from '@zbsearch/stemmers/dutch'
import { stemmer as english } from '@zbsearch/stemmers/english'
import { stemmer as french } from '@zbsearch/stemmers/french'
import { stemmer as german } from '@zbsearch/stemmers/german'
import { stemmer as italian } from '@zbsearch/stemmers/italian'
import { stemmer as portuguese } from '@zbsearch/stemmers/portuguese'
import { stemmer as spanish } from '@zbsearch/stemmers/spanish'
import type { Bundle } from './bundle.ts'
import { textBlocks, type MarkdownTree } from './markdown.ts'
import type { Schema } from './types.ts'

export interface SearchRecord {
  /** The item id; `<item id>#<anchor>` for a section with a heading. */
  id: string
  /** The item's URL, with `#anchor` for a section. */
  url: string
  /** The item's title. */
  title: string
  heading?: string
  text: string
  /** The start of `text`, shown under a hit. */
  excerpt: string
  brick: string
  locale: string
}

export interface SearchSectionsOptions {
  /** Tells which fields are markdown and text. */
  schema: Pick<Schema, 'bricks'>
  /** The trees behind `{ ref }` markdown values (withMarkdownRefs); not needed when the bundle holds the trees. */
  trees?: ReadonlyMap<string, MarkdownTree>
}

export interface SearchHit { id: string; url: string; title: string; heading?: string; excerpt: string; score: number }

/** The index as JSON: what `buildIndex` returns and `loadIndex` takes. `language` picks the word rules for the index and every query. */
export interface SearchIndexJson { language: string; index: ReturnType<MiniSearch<SearchRecord>['toJSON']> }

const treeOf = (value: unknown, trees?: ReadonlyMap<string, MarkdownTree>): MarkdownTree | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  if ('nodes' in value) return value as MarkdownTree
  const ref = (value as { ref?: unknown }).ref
  return typeof ref === 'string' ? trees?.get(ref) : undefined
}

/** Characters of a hit's excerpt; the index ships to every visitor, so it stays short. */
const EXCERPT = 140
const excerptOf = (text: string) => {
  const flat = text.replace(/\s+/g, ' ')
  return flat.length <= EXCERPT ? flat : `${flat.slice(0, flat.lastIndexOf(' ', EXCERPT) + 1 || EXCERPT).trimEnd()}…`
}

const collapse = (text: string) => text.replace(/[ \t]*\n[ \t\n]*/g, '\n').replace(/[ \t]+/g, ' ').trim()

/**
 * The search records of one locale's bundle: for every collection item with a URL in that locale, one record
 * for the text before the first h2 and one per h2/h3 section. Longtext fields (a description, a summary) count as text of the first record; short text fields are labels (an icon name, a badge), not content.
 */
export function searchSections(bundle: Bundle, options: SearchSectionsOptions): SearchRecord[] {
  const records: SearchRecord[] = []
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    const fields = Object.entries(options.schema.bricks[brick]?.fields ?? {})
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      const title = typeof item.data.title === 'string' ? item.data.title : item.id
      const intro: string[] = []
      for (const [name, field] of fields) {
        const value = item.data[name]
        if (field.type === 'longtext' && typeof value === 'string') intro.push(value)
      }
      const sections: { heading?: string; id?: string; parts: string[] }[] = [{ parts: intro }]
      for (const [name, field] of fields) {
        if (field.type !== 'markdown') continue
        for (const block of textBlocks(treeOf(item.data[name], options.trees)?.nodes ?? [])) {
          if (block.heading) sections.push({ heading: collapse(block.text), ...(block.heading.id ? { id: block.heading.id } : {}), parts: [] })
          else sections[sections.length - 1]!.parts.push(block.text)
        }
      }
      // An empty intro is left out (its title is found through the sections), unless the item has no sections at all.
      for (const [i, section] of sections.entries()) {
        const text = collapse(section.parts.join('\n'))
        if (i === 0 && !text && sections.length > 1) continue
        const record: SearchRecord = {
          id: section.id ? `${item.id}#${section.id}` : item.id,
          url: section.id ? `${url}#${section.id}` : url,
          title,
          text,
          excerpt: excerptOf(text),
          brick,
          locale: bundle.locale,
        }
        if (section.heading) record.heading = section.heading
        records.push(record)
      }
    }
  }
  return records
}

// Stemmers for the languages Ginko sites use most; they load with the search, never with the page. Another language
// gets lowercase words without accents and no stemming: prefix and typo matching still find word forms close enough.
const stemmers: Record<string, (word: string) => string> = { de: german, en: english, es: spanish, fr: french, it: italian, nl: dutch, pt: portuguese }
const withoutAccents = (term: string) => term.normalize('NFD').replace(/\p{M}/gu, '')

/**
 * The word rules of a language (a locale code such as `de`, `en` or `pt-BR`). German spells ä/ö/ü/ß out first
 * ("Öffnungszeiten" and "Oeffnungszeiten" meet); every other language stems the word, then drops accents ("café" finds "cafe").
 */
function processTerm(language: string): (term: string) => string {
  const code = language.split('-')[0]!.toLowerCase()
  if (code === 'de') return (term) => german(term.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'))
  const stem = stemmers[code] ?? ((word: string) => word)
  return (term) => withoutAccents(stem(term.toLowerCase()))
}

const engineOptions = (language: string) => ({
  fields: ['title', 'heading', 'text'],
  storeFields: ['url', 'title', 'heading', 'excerpt'],
  processTerm: processTerm(language),
})

/**
 * The serialized index of these records in `language` (the locale code of their text): title ranks above heading,
 * heading above text. Only id, url, title, heading and excerpt are stored.
 */
export function buildIndex(records: readonly SearchRecord[], language: string): SearchIndexJson {
  const index = new MiniSearch<SearchRecord>(engineOptions(language))
  index.addAll(records as SearchRecord[])
  return { language, index: index.toJSON() }
}

export type SearchIndex = MiniSearch<SearchRecord>

/** The index ready to search, with the word rules of the language it was built in. */
export function loadIndex(json: SearchIndexJson): SearchIndex {
  return MiniSearch.loadJS(json.index, engineOptions(json.language))
}

/** Prefix and typo tolerant (fuzzy 0.2); the best `limit` hits first. */
export function search(index: SearchIndex, query: string, { limit = 10 }: { limit?: number } = {}): SearchHit[] {
  return index.search(query, { prefix: true, fuzzy: 0.2, boost: { title: 2, heading: 1.5 } }).slice(0, limit).map((hit) => {
    const out: SearchHit = { id: String(hit.id), url: hit.url as string, title: hit.title as string, excerpt: hit.excerpt as string, score: hit.score }
    if (typeof hit.heading === 'string') out.heading = hit.heading
    return out
  })
}
