// `@lupinum/ginko/search` is public and loads in the browser: it exports only what the docs document, and the engine
// file statically imports nothing but MiniSearch. Stemmers load per language (dynamic import); a static import of
// one, or of markdown.ts (36 KB of messages), would put it in every site's search chunk.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stemmerNow } from '@lupinum/ginko/internal/search'

describe('@lupinum/ginko/search', () => {
  it('exports only the documented functions', async () => {
    expect(Object.keys(await import('@lupinum/ginko/search')).sort()).toEqual(['loadIndex', 'search'])
  })

  it('keeps the browser chunk to the engine', () => {
    const source = readFileSync(new URL('../../src/core/search.ts', import.meta.url), 'utf8')
    expect([...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])).toEqual(['minisearch'])
  })
})

describe('stemmers for a Convex query', () => {
  // Wrong behaviour caught: a slip in the static list (search-stemmers.ts) gives the Studio search another language's word rules.
  it.each([['de', 'german'], ['en', 'english'], ['es', 'spanish'], ['fr', 'french'], ['it', 'italian'], ['nl', 'dutch'], ['pt-BR', 'portuguese']])('%s stems like the %s stemmer the browser loads', async (code, name) => {
    const { stemmer } = await import(`@zbsearch/stemmers/${name}`) as { stemmer: (word: string) => string }
    const words = ['connections', 'gärtnerei', 'nationalités', 'cantando', 'mangiare', 'lopende', 'falando']
    expect(words.map(stemmerNow(code))).toEqual(words.map(stemmer))
  })
})
