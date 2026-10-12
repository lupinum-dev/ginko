/// <reference path="../schema.d.ts" />
// `/llms.txt`: the index of the main locale's entries, linked to their Markdown. A platform failure is a 503.
import { createError, defineEventHandler, useRuntimeConfig } from 'nuxt/server'
import schema from '#ginko/schema'
import { llmsTxt } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'
import { markdownTrees } from './markdown-trees.ts'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const main = (await loadServerBundles(event, config, [config.mainLocale]))[config.mainLocale]
  if (!main) throw createError({ statusCode: 503, statusMessage: 'Content unavailable', fatal: true })
  event.res.headers.set('content-type', 'text/plain; charset=utf-8')
  event.res.headers.set('x-ginko-rev', `${main.schemaRev}.${main.contentRev}`)
  return llmsTxt(main, { schema, trees: markdownTrees, siteName: config.name, description: config.agents.description ?? config.seo.description, origin: config.url })
})
