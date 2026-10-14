import { useDocs } from '../composables/useDocs'

/**
 * Leads to the first docs page of the language. A site without any docs page yet gets a 404 instead: a redirect to
 * `/` would loop, because `/` leads here when the site has no start page.
 */
export function toFirstDoc() {
  const first = useDocs().first.value
  if (!first) throw createError({ statusCode: 404, statusMessage: 'No docs page yet: add a Markdown file to content/docs/.' })
  return navigateTo(first, { redirectCode: 302 })
}
