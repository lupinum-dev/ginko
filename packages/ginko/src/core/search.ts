// The site search engine: MiniSearch with the stemmer of the index's language. The engine choice lives in this one
// file; no MiniSearch type leaves it. It imports MiniSearch, so the browser reaches it only through
// `@lupinum/ginko/search`; the core index does not export it. Imports no other core file, so the browser chunk carries
// only the engine. Pure: no Node APIs, runs in Convex too. The records come from search-sections.ts.
import MiniSearch from 'minisearch'
import { stemmer as dutch } from '@zbsearch/stemmers/dutch'
import { stemmer as english } from '@zbsearch/stemmers/english'
import { stemmer as french } from '@zbsearch/stemmers/french'
import { stemmer as german } from '@zbsearch/stemmers/german'
import { stemmer as italian } from '@zbsearch/stemmers/italian'
import { stemmer as portuguese } from '@zbsearch/stemmers/portuguese'
import { stemmer as spanish } from '@zbsearch/stemmers/spanish'

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

export interface SearchHit { id: string; url: string; title: string; heading?: string; excerpt: string; score: number }

type EngineJson = ReturnType<MiniSearch<SearchRecord>['toJSON']>
declare const engineData: unique symbol
/** The engine's own data inside `SearchIndexJson`: only `loadIndex` reads it, so the engine can change without a new type. */
export interface SearchEngineData { readonly [engineData]: true }

/** The index as JSON: what `buildIndex` returns and `loadIndex` takes. `language` picks the word rules for the index and every query. */
export interface SearchIndexJson { language: string; index: SearchEngineData }

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
  // The one place engine JSON becomes the opaque type, and loadIndex the one place it turns back.
  return { language, index: index.toJSON() as unknown as SearchEngineData }
}

// `loadIndex` and `search` reach the engine through these two, set in the class's static block; the class itself
// shows nothing of MiniSearch, so a site cannot depend on it.
let wrap!: (engine: MiniSearch<SearchRecord>) => SearchIndex
let engineOf!: (index: SearchIndex) => MiniSearch<SearchRecord>

/** An index ready to search: what `loadIndex` returns and `search` takes. */
export class SearchIndex {
  readonly #engine: MiniSearch<SearchRecord>
  private constructor(engine: MiniSearch<SearchRecord>) { this.#engine = engine }
  static {
    wrap = (engine) => new SearchIndex(engine)
    engineOf = (index) => index.#engine
  }
}

/** The index ready to search, with the word rules of the language it was built in. */
export function loadIndex(json: SearchIndexJson): SearchIndex {
  return wrap(MiniSearch.loadJS(json.index as unknown as EngineJson, engineOptions(json.language)))
}

/** Prefix and typo tolerant (fuzzy 0.2); the best `limit` hits first. */
export function search(index: SearchIndex, query: string, { limit = 10 }: { limit?: number } = {}): SearchHit[] {
  return engineOf(index).search(query, { prefix: true, fuzzy: 0.2, boost: { title: 2, heading: 1.5 } }).slice(0, limit).map((hit) => {
    const out: SearchHit = { id: String(hit.id), url: hit.url as string, title: hit.title as string, excerpt: hit.excerpt as string, score: hit.score }
    if (typeof hit.heading === 'string') out.heading = hit.heading
    return out
  })
}
