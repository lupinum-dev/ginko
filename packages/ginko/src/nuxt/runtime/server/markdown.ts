/// <reference path="../schema.d.ts" />
// Markdown for AI agents, one middleware so a request looks its entry up once:
//  - `<page>.md` answers with the entry as Markdown,
//  - a page whose `Accept` prefers `text/markdown` answers with the same,
//  - every other page of a file entry gets `Link: <page.md>; rel="alternate"` (and `Vary: Accept`); platform entries
//    get no Link header, so a page view never costs a second platform request.
// A platform failure is a 503 for `.md`, but never breaks a normal page: there the middleware steps aside.
import { defineEventHandler, getRequestHeader, getRequestURL, setResponseStatus, useRuntimeConfig } from 'nuxt/server'
import { localeFromPath } from '@lupinum/ginko-i18n/core'
import schema from '#ginko/schema'
import locales from '#ginko/locales'
import fileBundles from '#ginko/files'
import { entryMarkdown, findEntryByPath, markdownNotFound, markdownRequestPath, prefersMarkdown, type Bundle, type Locale } from '../../../internal.ts'
import type { GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'
import { markdownTrees } from './markdown-trees.ts'

export default defineEventHandler(async (event) => {
  const method = event.req.method
  if (method !== 'GET' && method !== 'HEAD') return
  const path = getRequestURL(event).pathname
  if (/^\/(__ginko|_nuxt|_ginko)(\/|$)/.test(path)) return
  const markdownPage = markdownRequestPath(path)
  // Other files (images, feeds, robots.txt) are no pages: skip them without asking the platform.
  if (markdownPage === undefined && /\.[^/]*$/.test(path)) return
  const asMarkdown = markdownPage !== undefined
  const pagePath = markdownPage ?? path

  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const locale = (localeFromPath(pagePath, locales) ?? locales.defaultLocale) as Locale
  const wantsMarkdown = asMarkdown || prefersMarkdown(getRequestHeader(event, 'accept'))
  let bundle
  if (!wantsMarkdown) {
    // A normal page view only gets the Link header, from the build-time file bundle: asking the platform here
    // would fetch the bundle a second time on every page view (the page itself loads it too).
    bundle = fileBundles[locale as keyof typeof fileBundles] as Bundle | undefined
  } else {
    try {
      bundle = (await loadServerBundles(event, config, [locale]))[locale]
    } catch (error) {
      if (asMarkdown) throw error
      return
    }
  }
  if (!bundle) return
  const match = findEntryByPath(bundle, pagePath)
  if (!match) {
    // A missing `.md` page answers with suggestions in Markdown. Other paths may be static pages: they fall through.
    if (!asMarkdown) return
    setResponseStatus(event, 404)
    event.res.headers.set('content-type', 'text/markdown; charset=utf-8')
    return markdownNotFound(bundle, path, { origin: config.url })
  }

  if (wantsMarkdown) {
    event.res.headers.set('content-type', 'text/markdown; charset=utf-8')
    event.res.headers.set('x-ginko-rev', `${bundle.schemaRev}.${bundle.contentRev}`)
    if (!asMarkdown) event.res.headers.set('vary', 'Accept')
    return entryMarkdown(match.item, match.brick, { schema, trees: markdownTrees })
  }
  event.res.headers.append('link', `<${match.url === '/' ? '/index' : match.url.replace(/\/+$/, '')}.md>; rel="alternate"; type="text/markdown"`)
  event.res.headers.append('vary', 'Accept')
})
