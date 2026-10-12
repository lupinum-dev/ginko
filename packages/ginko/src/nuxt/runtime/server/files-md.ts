/// <reference path="../schema.d.ts" />
// `/__ginko/files/<locale>/md/<brick>/<id>/<field>.json`: one markdown tree (CONTENT.md, Phase 14).
// <GinkoMarkdown> loads it, so a page's payload holds only the texts that page shows.
import { createError, defineEventHandler, getRequestURL } from 'nuxt/server'
import trees from '#ginko/files-md'

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  const tree = Object.hasOwn(trees, path) ? trees[path] : undefined
  if (!tree) throw createError({ statusCode: 404, statusMessage: 'Text not found' })
  return tree
})
