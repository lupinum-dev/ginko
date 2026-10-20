/// <reference path="../schema.d.ts" />
// `/__ginko/sitemap.json`: the sitemap's URLs as a source for @nuxtjs/sitemap, which owns /sitemap.xml when a
// site installs it (module.ts). Same list and platform rules as Ginko's own /sitemap.xml: a failure is a 503.
import { createError, defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import schema from '#ginko/schema'
import locales from '#ginko/locales'
import { todayIn } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'
import { sitemapUrls } from './sitemap-xml.ts'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const bundles = await loadServerBundles(event, config, config.locales)
  const main = bundles[config.mainLocale]
  if (!main) throw createError({ statusCode: 503, statusMessage: 'Content unavailable', fatal: true })
  event.res.headers.set('x-ginko-rev', `${main.schemaRev}.${main.contentRev}`)
  return sitemapUrls(schema, bundles, todayIn(config.timeZone), locales, config.seo.noindex)
})
