/// <reference path="../schema.d.ts" />
// `/sitemap.xml` route (SPEC 8 "Sitemap"). Same platform rules as pages: every locale's bundle is
// fetched, and any failure is a 503 (never an empty sitemap).
import { createError, defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import schema from '#ginko/schema'
import locales from '#ginko/locales'
import { todayIn } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'
import { sitemapXml } from './sitemap-xml.ts'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const bundles = await loadServerBundles(event, config, config.locales)
  const main = bundles[config.mainLocale]
  if (!main) throw createError({ statusCode: 503, statusMessage: 'Content unavailable', fatal: true })
  event.res.headers.set('content-type', 'application/xml; charset=utf-8')
  event.res.headers.set('x-ginko-rev', `${main.schemaRev}.${main.contentRev}`)
  return sitemapXml(schema, bundles, todayIn(config.timeZone), locales)
})
