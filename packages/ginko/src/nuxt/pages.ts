// Build-time check of ginko.config.ts paths against the site's Nuxt pages (pure, so it is unit tested).
import type { Schema } from '../core/index.ts'

/**
 * Paths from ginko.config.ts that no Nuxt page serves: a static page, or a collection route (tried
 * with a sample slug). Renaming a page file would otherwise break links and the sitemap silently.
 * Only the site's languages count: a preset's default route for another language is never served.
 */
export function unservedPaths(schema: Pick<Schema, 'locales' | 'pages' | 'bricks'>, pages: { path: string, children?: { path: string }[] }[]): string[] {
  const patterns: RegExp[] = []
  const add = (list: { path: string, children?: { path: string }[] }[], prefix: string) => {
    for (const page of list) {
      const path = page.path.startsWith('/') ? page.path : `${prefix.replace(/\/$/, '')}/${page.path}`
      // Parameters first (catch-all, optional, required), then everything else is literal.
      const source = path
        .replace(/\/:\w+\(\.\*\)\*/g, '\u0001')
        .replace(/:\w+\(\)\?|:\w+\?/g, '\u0002')
        .replace(/:\w+(\(\))?/g, '\u0003')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\u0001/g, '(/.*)?').replace(/\u0002/g, '[^/]*').replace(/\u0003/g, '[^/]+')
      patterns.push(new RegExp(`^${source}/?$`))
      if (page.children) add(page.children, path)
    }
  }
  add(pages, '')
  const served = (path: string) => patterns.some((pattern) => pattern.test(path))
  const warnings: string[] = []
  const ours = (locale: string) => schema.locales.includes(locale)
  for (const [key, paths] of Object.entries(schema.pages)) {
    for (const [locale, path] of Object.entries(paths)) if (path && ours(locale) && !served(path)) warnings.push(`pages.${key}.${locale}: no page at “${path}”. Fix: create the page or change the path in ginko.config.ts.`)
  }
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.kind !== 'collection' || !brick.route) continue
    for (const [locale, route] of Object.entries(brick.route)) if (route && ours(locale) && !served(route.replace('[slug]', 'beispiel'))) warnings.push(`${key}.route.${locale}: no page at “${route}”. Fix: create the page (for example pages/…/[slug].vue) or change the route.`)
  }
  return warnings
}
