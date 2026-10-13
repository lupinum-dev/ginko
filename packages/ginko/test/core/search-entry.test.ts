// `@lupinum/ginko/search` is public and loads in the browser: it exports only what the docs document, and the engine
// file statically imports nothing but MiniSearch. Stemmers load per language (dynamic import); a static import of
// one, or of markdown.ts (36 KB of messages), would put it in every site's search chunk.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('@lupinum/ginko/search', () => {
  it('exports only the documented functions', async () => {
    expect(Object.keys(await import('@lupinum/ginko/search')).sort()).toEqual(['loadIndex', 'search'])
  })

  it('keeps the browser chunk to the engine', () => {
    const source = readFileSync(new URL('../../src/core/search.ts', import.meta.url), 'utf8')
    expect([...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])).toEqual(['minisearch'])
  })
})
