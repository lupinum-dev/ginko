// `@lupinum/ginko/search` is public and loads in the browser: it exports only what the docs document, and the engine
// file imports nothing but MiniSearch and the stemmers (an import of markdown.ts once pulled 36 KB of messages into it).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('@lupinum/ginko/search', () => {
  it('exports only the documented functions', async () => {
    expect(Object.keys(await import('@lupinum/ginko/search')).sort()).toEqual(['loadIndex', 'search'])
  })

  it('keeps the browser chunk to the engine', () => {
    const source = readFileSync(new URL('../../src/core/search.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.filter((spec) => spec !== 'minisearch' && !spec!.startsWith('@zbsearch/stemmers/'))).toEqual([])
  })
})
