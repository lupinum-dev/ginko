// Which pages and feeds the layer adds for a site, decided from the site's Ginko config and the paths its own pages
// already take. Pure, so modules/pages.ts only wires the result into Nuxt and the test can check every case.
export interface SiteOptions { locales?: readonly string[], pages?: Record<string, Record<string, string> | undefined>, bricks?: Record<string, { route?: Record<string, string> } | undefined> }

export interface LayerRoutes {
  docs: { base: string }
  /** The blog list path (its feeds are `<list>/rss.xml` and `/:locale<list>/rss.xml`), when the layer adds the blog. */
  blog?: string
  changelog?: string
  /** A brick's list is the site's own page, or the brick has no address to put one at. */
  skipped: string[]
}

/** The brick's address in the main language, with `[slug]` as `:slug()`; the list page is the parent path. */
function listPath(route: string | undefined): string | undefined {
  if (!route) return undefined
  const list = route.replace(/\/\[slug\]$/, '')
  return list.includes('[') ? undefined : list || '/'
}

/**
 * `pagePaths`: the paths of the site's own pages as Nuxt scans them (`/news`). The address a page answers at can differ
 * (`pages.news` is `/blog` in English: the page-paths module of the templates, which runs after this layer), so a page
 * also counts at the main-language path that `pages.<first folder>` gives it.
 */
export function layerRoutes(site: SiteOptions | undefined, pagePaths: Iterable<string>): LayerRoutes {
  const main = site?.locales?.[0] ?? ''
  const taken = new Set<string>()
  for (const path of pagePaths) {
    taken.add(path)
    const mapped = site?.pages?.[path.split('/')[1] ?? '']?.[main]
    if (mapped && !path.includes(':')) taken.add(mapped)
  }
  return decide(site, taken)
}

function decide(site: SiteOptions | undefined, taken: ReadonlySet<string>): LayerRoutes {
  const bricks = site?.bricks ?? {}
  const main = site?.locales?.[0] ?? ''
  const skipped: string[] = []
  // docsCollection writes `<base>/[slug]` for the main language; other languages get a prefix from ginko-i18n.
  const docsBase = bricks.docs?.route?.[main]?.replace(/\/\[slug\]$/, '') ?? '/docs'
  const own = (brick: string, path: string | undefined) => {
    if (!path) return skipped.push(`${brick}: no address`), undefined
    if (taken.has(path)) return skipped.push(`${brick}: the site has a page at ${path}`), undefined
    return path
  }
  const blog = bricks.posts ? own('posts', listPath(bricks.posts.route?.[main])) : undefined
  // The changelog has no page of its own per entry: its list lives at the route the brick has, else at `pages.changelog`.
  const changelog = bricks.changelog ? own('changelog', listPath(bricks.changelog.route?.[main]) ?? site?.pages?.changelog?.[main]) : undefined
  return { docs: { base: docsBase }, ...(blog && { blog }), ...(changelog && { changelog }), skipped }
}
