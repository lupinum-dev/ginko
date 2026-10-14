/// <reference path="../schema.d.ts" />
// `/__ginko/platform/<locale>/<rev>/md/<brick>/<id>/<field>.json`: one markdown tree of a platform brick, the
// `{ ref }` the page state holds (runtime/plugin.ts). <GinkoMarkdown> loads it on a client navigation.
// A platform failure is a 503 (fetch.ts), never a 404.
import { createError, defineEventHandler, getRequestURL, useRuntimeConfig } from 'nuxt/server'
import schema from '#ginko/schema'
import { platformMarkdownRef, withMarkdownRefs, type Locale, type MarkdownTree } from '../../../internal.ts'
import { fetchBundle, PlatformError } from '../fetch.ts'
import type { GinkoPublicConfig } from '../shared.ts'

const PATH = /^\/__ginko\/platform\/([^/]+)\/(\d+\.\d+)\/md\//

// One copy of the platform's trees per locale, for the revision in the path. A page that loads several texts
// (one request each) costs one platform fetch; a newer revision replaces the copy. The rev in the path makes a
// time limit unnecessary: a ref of an older revision is answered from the newer copy.
const cache = new Map<Locale, { rev: string; trees: Promise<Map<string, MarkdownTree>> }>()

const newer = (a: string, b: string) => {
  const [as = 0, ac = 0] = a.split('.').map(Number)
  const [bs = 0, bc = 0] = b.split('.').map(Number)
  return as !== bs ? as > bs : ac > bc
}

function treesOf(config: GinkoPublicConfig, locale: Locale, rev: string): { rev: string; trees: Promise<Map<string, MarkdownTree>> } {
  const cached = cache.get(locale)
  if (cached && !newer(rev, cached.rev)) return cached
  const siteToken = useRuntimeConfig().ginkoRevalidateToken as string | undefined
  const entry = {
    rev,
    // The rev as minRev: the platform answers this revision or a newer one, never an older one.
    trees: fetchBundle(config, locale, rev, siteToken).then((bundle) => {
      const trees = new Map<string, MarkdownTree>()
      withMarkdownRefs(bundle, schema, trees, (brick, id, field) => platformMarkdownRef(locale, rev, brick, id, field))
      return trees
    }),
  }
  cache.set(locale, entry)
  // A failed fetch is not kept: the next request asks the platform again.
  entry.trees.catch(() => { if (cache.get(locale) === entry) cache.delete(locale) })
  return entry
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const path = getRequestURL(event).pathname
  const [, locale = '', rev = ''] = PATH.exec(path) ?? []
  if (!config.locales.includes(locale)) throw createError({ statusCode: 404, statusMessage: 'Text not found' })
  const entry = treesOf(config, locale, rev)
  let trees: Map<string, MarkdownTree>
  try {
    trees = await entry.trees
  } catch (error) {
    if (error instanceof PlatformError) throw createError({ statusCode: error.statusCode, statusMessage: error.message, cause: error.cause })
    throw error
  }
  // The copy may hold a newer revision than the page asked for: look the text up under that revision's path.
  const tree = trees.get(path.replace(PATH, `/__ginko/platform/${locale}/${entry.rev}/md/`))
  if (!tree) throw createError({ statusCode: 404, statusMessage: 'Text not found' })
  return tree
})
