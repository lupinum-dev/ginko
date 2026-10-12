// `POST /__ginko/docs-mcp`: read-only MCP endpoint of the docs (see ../../mcp/handler.ts). It lives under `/__ginko/`
// like the other generated endpoints, so it cannot collide with a page or with the platform's own `/mcp`.
import { createError, defineEventHandler, readBody, setResponseStatus } from 'nuxt/server'
import indexes from '#ginko/search'
import locales from '#ginko/locales'
import { loadIndex, search, type SearchIndex } from '@lupinum/ginko/search'
import { handleMcp } from '../../mcp/handler'

const loaded = new Map<string, SearchIndex>()

export default defineEventHandler(async (event) => {
  if (event.req.method !== 'POST') throw createError({ statusCode: 405, statusMessage: 'POST only' })
  const response = await handleMcp(await readBody(event), {
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
