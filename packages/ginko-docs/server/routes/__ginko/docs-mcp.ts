// `POST /__ginko/docs-mcp`: read-only MCP endpoint of the docs (see ../../mcp/handler.ts). It lives under `/__ginko/`
// like the other generated endpoints, so it cannot collide with a page or with the platform's own `/mcp`.
import { createError, defineEventHandler, serverFetch, setResponseStatus } from 'nuxt/server'
import locales from '#ginko/locales'
import { loadIndex, search, type SearchIndex } from '@lupinum/ginko/search'
import { withoutTrailingSlashes } from '@lupinum/ginko/internal'
import { handleMcp, readLimitedText } from '../../mcp/handler'

// The loading index per locale and the revision it holds, kept as its promise so two first requests share one load.
const loaded = new Map<string, { rev: string; index: Promise<SearchIndex> }>()

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'POST') throw createError({ statusCode: 405, statusMessage: 'POST only' })
  // Over 1 MB: refuse before parsing (a plain Node host has no body limit of its own).
  const raw = await readLimitedText(event.req)
  if (raw === undefined) throw createError({ statusCode: 413, statusMessage: 'Request body too large (limit 1 MB)' })
  let body: unknown
  try { body = raw === '' ? undefined : JSON.parse(raw) } catch { throw createError({ statusCode: 400, statusMessage: 'Body must be JSON' }) }
  const response = await handleMcp(body, {
    // The index the site's search box loads, asked in-process: built from content/ at build time, or from the
    // platform's content when the docs live there (`x-ginko-rev` then says which revision it holds).
    async search(query, locale = locales.defaultLocale) {
      const response = await serverFetch(event, `/__ginko/search/${encodeURIComponent(locale)}.json`, { forwardHeaders: false })
      if (response.status === 404) return []
      if (!response.ok) throw createError({ statusCode: 503, statusMessage: 'Content temporarily unavailable' })
      const rev = response.headers.get('x-ginko-rev') ?? 'build'
      let entry = loaded.get(locale)
      if (entry?.rev !== rev) {
        // Parsed from text: Nuxt 5 types `json()` as the serialized route value, which drops the index's brand.
        const index = response.text().then((text) => loadIndex(JSON.parse(text)))
        // A failed load is not kept: the next call tries again.
        index.catch(() => { if (loaded.get(locale)?.index === index) loaded.delete(locale) })
        loaded.set(locale, entry = { rev, index })
      }
      return search(await entry.index, query, { limit: 8 })
    },
    // The same Markdown the public `<page>.md` twin returns: ask the site's own middleware, in-process (Nuxt 4.6 and 5).
    async read(path) {
      const response = await serverFetch(event, `${path === '/' ? '/index' : withoutTrailingSlashes(path)}.md`, { forwardHeaders: false }).catch(() => undefined)
      return response?.ok ? response.text() : undefined
    },
  })
  if (response === undefined) { setResponseStatus(event, 202); return '' }
  return response
})
