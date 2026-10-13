// Site search: sections of the bundle's items, indexed with MiniSearch and the stemmer of the index's language.
// The engine choice lives in this one file. It imports MiniSearch, so the core index does not export it: sites reach
// it through `@lupinum/ginko/search`, Ginko's own packages also through `@lupinum/ginko/internal`. Pure: no Node APIs, runs in Convex too.
import MiniSearch from 'minisearch'

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

// Stemmers for the languages Ginko sites use most, each its own chunk: a browser loads only the stemmer of the index
// it opens. Another language gets lowercase words without accents and no stemming: prefix and typo matching still
// find word forms close enough.
type Stemmer = (word: string) => string
const stemmers: Record<string, () => Promise<{ stemmer: Stemmer }>> = {
  de: () => import('@zbsearch/stemmers/german'),
  en: () => import('@zbsearch/stemmers/english'),
  es: () => import('@zbsearch/stemmers/spanish'),
  fr: () => import('@zbsearch/stemmers/french'),
  it: () => import('@zbsearch/stemmers/italian'),
  nl: () => import('@zbsearch/stemmers/dutch'),
  pt: () => import('@zbsearch/stemmers/portuguese'),
}
const withoutAccents = (term: string) => term.normalize('NFD').replace(/\p{M}/gu, '')

/**
 * The word rules of a language (a locale code such as `de`, `en` or `pt-BR`). German spells ä/ö/ü/ß out first
 * ("Öffnungszeiten" and "Oeffnungszeiten" meet); every other language stems the word, then drops accents ("café" finds "cafe").
 */
async function processTerm(language: string): Promise<(term: string) => string> {
  const code = language.split('-')[0]!.toLowerCase()
  const stem: Stemmer = Object.hasOwn(stemmers, code) ? (await stemmers[code]!()).stemmer : (word) => word
  if (code === 'de') return (term) => stem(term.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'))
  return (term) => withoutAccents(stem(term.toLowerCase()))
}

const engineOptions = async (language: string) => ({
  fields: ['title', 'heading', 'text'],
  storeFields: ['url', 'title', 'heading', 'excerpt'],
  processTerm: await processTerm(language),
})

/**
 * The serialized index of these records in `language` (the locale code of their text): title ranks above heading,
 * heading above text. Only id, url, title, heading and excerpt are stored.
 */
export async function buildIndex(records: readonly SearchRecord[], language: string): Promise<SearchIndexJson> {
  const index = new MiniSearch<SearchRecord>(await engineOptions(language))
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

/** The index ready to search, with the word rules of the language it was built in (loads that language's stemmer). */
export async function loadIndex(json: SearchIndexJson): Promise<SearchIndex> {
  return wrap(MiniSearch.loadJS(json.index as unknown as EngineJson, await engineOptions(json.language)))
}

/** Prefix and typo tolerant (fuzzy 0.2); the best `limit` hits first. */
export function search(index: SearchIndex, query: string, { limit = 10 }: { limit?: number } = {}): SearchHit[] {
  return engineOf(index).search(query, { prefix: true, fuzzy: 0.2, boost: { title: 2, heading: 1.5 } }).slice(0, limit).map((hit) => {
    const out: SearchHit = { id: String(hit.id), url: hit.url as string, title: hit.title as string, excerpt: hit.excerpt as string, score: hit.score }
    if (typeof hit.heading === 'string') out.heading = hit.heading
    return out
  })
}
