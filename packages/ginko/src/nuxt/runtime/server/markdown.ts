/// <reference path="../schema.d.ts" />
// Markdown for AI agents, one middleware so a request looks its entry up once:
//  - `<page>.md` answers with the entry as Markdown,
//  - every page of a file entry gets `Link: <page.md>; rel="alternate"`; platform entries get no Link header, so a
//    page view never costs a second platform request.
// The normal address never answers with Markdown, whatever `Accept` says: Vercel's ISR cache (every page) ignores
// `Vary`, so one request asking for Markdown would serve it to every visitor (ginko-i18n DECISIONS.md D10).
// A platform failure is a 503 for `.md`, but never breaks a normal page: there the middleware steps aside.
import { defineEventHandler, getRequestURL, setResponseStatus, useRuntimeConfig } from 'nuxt/server'
import { localeFromPath } from '@lupinum/ginko-i18n/core'
import schema from '#ginko/schema'
import locales from '#ginko/locales'
import fileBundles from '#ginko/files'
import { entryMarkdown, findEntryByPath, markdownNotFound, type Bundle, type Locale } from '../../../internal.ts'
import { agentRequest, type GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'
import { markdownTrees } from './markdown-trees.ts'

export default defineEventHandler(async (event) => {
  const method = event.req.method
  if (method !== 'GET' && method !== 'HEAD') return
  const path = getRequestURL(event).pathname
  const request = agentRequest(path)
  if (!request) return
  const { page: pagePath, asMarkdown } = request

  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const locale = (localeFromPath(pagePath, locales) ?? locales.defaultLocale) as Locale
  if (!asMarkdown) {
    // A normal page view only gets the Link header, from the build-time file bundle: asking the platform here
    // would fetch the bundle a second time on every page view (the page itself loads it too).
    const files = fileBundles[locale as keyof typeof fileBundles] as Bundle | undefined
    const match = files && findEntryByPath(files, pagePath)
    if (match) event.res.headers.append('link', `<${match.url === '/' ? '/index' : match.url.replace(/\/+$/, '')}.md>; rel="alternate"; type="text/markdown"`)
    return
  }
  const bundle = (await loadServerBundles(event, config, [locale]))[locale]
  if (!bundle) return
  const match = findEntryByPath(bundle, pagePath)
  event.res.headers.set('content-type', 'text/markdown; charset=utf-8')
  if (!match) {
    // A missing `.md` page answers with suggestions in Markdown.
    setResponseStatus(event, 404)
    return markdownNotFound(bundle, path, { origin: config.url, schema })
  }
  event.res.headers.set('x-ginko-rev', `${bundle.schemaRev}.${bundle.contentRev}`)
  return entryMarkdown(match.item, match.brick, { schema, trees: markdownTrees })
})
