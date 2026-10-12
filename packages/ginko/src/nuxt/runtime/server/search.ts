// `/__ginko/search/<locale>.json`: the search index of the site's file bricks (CONTENT.md, Phase 14),
// built from content/ at build time (in dev: on every change). The docs site's search loads it in the browser.
/// <reference path="../schema.d.ts" />
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import indexes from '#ginko/search'

export default defineEventHandler((event) => {
  const file = getRouterParam(event, 'file') ?? ''
  const locale = file.endsWith('.json') ? file.slice(0, -'.json'.length) : ''
  const index = Object.hasOwn(indexes, locale) ? indexes[locale as keyof typeof indexes] : undefined
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Unknown language' })
  return index
})
