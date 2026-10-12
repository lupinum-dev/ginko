// `/__ginko/files/<locale>.json`: the site's file bricks (CONTENT.md) as a bundle, built from content/
// at build time (in dev: on every change). Pages load it through loadBundle.
/// <reference path="../schema.d.ts" />
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import bundles from '#ginko/files'

export default defineEventHandler((event) => {
  // The `.json` ending lets a static host (nuxt generate) serve the file with the right type; `files/<locale>/md/` is a directory beside it.
  const file = getRouterParam(event, 'locale') ?? ''
  const locale = file.endsWith('.json') ? file.slice(0, -'.json'.length) : ''
  const bundle = Object.hasOwn(bundles, locale) ? bundles[locale as keyof typeof bundles] : undefined
  if (!bundle) throw createError({ statusCode: 404, statusMessage: 'Unknown language' })
  return bundle
})
