// The routes `nuxt generate` must write for a Git-only site (pure, so it is unit tested without Nuxt).
import type { Bundle, Schema } from '../core/index.ts'

/** The `.md` twin of a page path, as the markdown middleware answers it (`/` is `/index.md`). */
export function markdownTwin(path: string): string {
  return path === '/' ? '/index.md' : `${path.replace(/\/+$/, '')}.md`
}

/**
 * Every route a static host must serve: the pages, the entry pages and their `.md` twins, the generated
 * documents, and the JSON the client plugin and the search load. `trees` holds the paths of the
 * markdown tree routes (keys of the `#ginko/files-md` template).
 */
export function prerenderRoutes(
  schema: Pick<Schema, 'pages' | 'locales'>,
  bundles: Partial<Record<string, Bundle>>,
  trees: Iterable<string>,
  served: { robots: boolean, llms: boolean, llmsFull: boolean, markdown: boolean },
): string[] {
  const routes = new Set<string>()
  for (const paths of Object.values(schema.pages)) for (const path of Object.values(paths)) if (path) routes.add(path)
  for (const bundle of Object.values(bundles)) {
    if (!bundle) continue
    for (const brick of Object.values(bundle.bricks)) {
      if (brick.kind !== 'collection') continue
      for (const item of brick.items) {
        const url = item.urls?.[bundle.locale]
        if (!url) continue
        routes.add(url)
        if (served.markdown) routes.add(markdownTwin(url))
      }
    }
  }
  routes.add('/sitemap.xml')
  if (served.robots) routes.add('/robots.txt')
  if (served.llms) routes.add('/llms.txt')
  if (served.llmsFull) routes.add('/llms-full.txt')
  for (const locale of schema.locales) {
    routes.add(`/__ginko/files/${locale}.json`)
    routes.add(`/__ginko/search/${locale}.json`)
  }
  for (const tree of trees) routes.add(tree)
  return [...routes]
}
