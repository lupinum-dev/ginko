// `POST /__ginko/docs-mcp`: read-only MCP endpoint of the docs (see ../../mcp/handler.ts). It lives under `/__ginko/`
// like the other generated endpoints, so it cannot collide with a page or with the platform's own `/mcp`.
import { createError, defineEventHandler, setResponseStatus } from 'nuxt/server'
import indexes from '#ginko/search'
import locales from '#ginko/locales'
import { loadIndex, search, type SearchIndex } from '@lupinum/ginko/search'
import { handleMcp, readLimitedText } from '../../mcp/handler'

const loaded = new Map<string, SearchIndex>()

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'POST') throw createError({ statusCode: 405, statusMessage: 'POST only' })
  // Over 1 MB: refuse before parsing (a plain Node host has no body limit of its own).
  const raw = await readLimitedText(event.req)
  if (raw === undefined) throw createError({ statusCode: 413, statusMessage: 'Request body too large (limit 1 MB)' })
  let body: unknown
  try { body = raw === '' ? undefined : JSON.parse(raw) } catch { throw createError({ statusCode: 400, statusMessage: 'Body must be JSON' }) }
  const response = await handleMcp(body, {
    search(query, locale = locales.defaultLocale) {
      const json = Object.hasOwn(indexes, locale) ? indexes[locale as keyof typeof indexes] : undefined
      if (!json) return []
      let index = loaded.get(locale)
      if (!index) loaded.set(locale, index = loadIndex(json))
      return search(index, query, { limit: 8 })
    },
    // The same Markdown the public `<page>.md` twin returns: ask the site's own middleware.
    async read(path) {
      return $fetch<string>(`${path === '/' ? '/index' : path.replace(/\/+$/, '')}.md`, { responseType: 'text' }).catch(() => undefined)
    },
  })
  if (response === undefined) { setResponseStatus(event, 202); return '' }
  return response
})
