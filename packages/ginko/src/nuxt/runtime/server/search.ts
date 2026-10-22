/// <reference path="../schema.d.ts" />
// `/__ginko/search/<locale>.json`: the search index of the site (CONTENT.md, Phase 14). The docs site's search loads it
// in the browser. A site whose bricks all read files serves the index built from content/ at build time. A site with
// platform bricks builds it here from the bundle its pages read (files and platform), so a published change is found
// once the cached index expires, like a page (route-rules.ts). A platform failure is a 503, never an empty index.
import { createError, defineEventHandler, getRouterParam, useRuntimeConfig } from 'nuxt/server'
import indexes from '#ginko/search'
import schema from '#ginko/schema'
import { todayIn, type Locale } from '../../../internal.ts'
import { buildIndex, searchSections } from '../../../internal/search.ts'
import type { GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'
import { markdownTrees } from './markdown-trees.ts'

type IndexJson = Awaited<ReturnType<typeof buildIndex>>

// The last index per locale and what it was built from (revision and day), so a warm server does not rebuild it for
// every request in between.
const built = new Map<string, { key: string; index: IndexJson }>()

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const file = getRouterParam(event, 'file') ?? ''
  const locale = (file.endsWith('.json') ? file.slice(0, -'.json'.length) : '') as Locale
  if (!config.locales.includes(locale)) throw createError({ statusCode: 404, statusMessage: 'Unknown language' })
  if (!config.sources.platform) {
    const index = Object.hasOwn(indexes, locale) ? indexes[locale as keyof typeof indexes] : undefined
    if (!index) throw createError({ statusCode: 404, statusMessage: 'Unknown language' })
    return index
  }
  const bundle = (await loadServerBundles(event, config, [locale]))[locale]
  if (!bundle) throw createError({ statusCode: 503, statusMessage: 'Content unavailable', fatal: true })
  const rev = `${bundle.schemaRev}.${bundle.contentRev}`
  event.res.headers.set('x-ginko-rev', rev)
  const today = todayIn(config.timeZone)
  const key = `${rev}@${today}`
  const cached = built.get(locale)
  if (cached?.key === key) return cached.index
  const index = await buildIndex(searchSections(bundle, { schema, trees: markdownTrees, today }), locale)
  built.set(locale, { key, index })
  return index
})
