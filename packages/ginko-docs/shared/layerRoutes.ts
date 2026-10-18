// Which pages and feeds the layer adds for a site, decided from the site's Ginko config and the paths its own pages
// already take. Pure, so modules/pages.ts only wires the result into Nuxt and the test can check every case.
export interface SiteOptions { locales?: readonly string[], pages?: Record<string, Record<string, string> | undefined>, bricks?: Record<string, { route?: Record<string, string> } | undefined> }

export interface LayerRoutes {
  docs: { base: string }
  /** Where the bricks put the blog list and the changelog (main language), whoever serves them. The app links here. */
  addresses: { blog?: string, changelog?: string }
  /** What the layer adds itself: the address, only when the site has no page there. Feeds are `<blog>/rss.xml` and `/:locale<blog>/rss.xml`. */
  blog?: string
  changelog?: string
  /** A brick is configured but has no address to put a page at (the changelog brick without a route or `pages.changelog`). */
  noAddress: string[]
}

/** The brick's address in the main language, with `[slug]` as `:slug()`; the list page is the parent path. */
function listPath(route: string | undefined): string | undefined {
  if (!route) return undefined
  const list = route.replace(/\/\[slug\]$/, '')
  return list.includes('[') ? undefined : list || '/'
}

/** A page as Nuxt has it once every `pages:extend` ran: its scanned path and, from the templates' page-paths module, its addresses per language. */
export interface PageLike { path: string, meta?: { i18n?: unknown } | undefined }

/** The main-language address of a page: `meta.i18n.paths[main]` when set (`/news` answers at `/blog`), else its path. */
function addressOf(page: PageLike, main: string): string[] {
  const paths = (page.meta?.i18n as { paths?: Record<string, string> } | false | undefined)
  const mapped = paths && paths.paths?.[main]
  return mapped && !page.path.includes(':') ? [page.path, mapped] : [page.path]
}

export function layerRoutes(site: SiteOptions | undefined, pages: Iterable<PageLike>): LayerRoutes {
  const bricks = site?.bricks ?? {}
  const main = site?.locales?.[0] ?? ''
  const taken = new Set<string>()
  for (const page of pages) for (const path of addressOf(page, main)) taken.add(path)
  // docsCollection writes `<base>/[slug]` for the main language; other languages get a prefix from ginko-i18n.
  const docsBase = bricks.docs?.route?.[main]?.replace(/\/\[slug\]$/, '') ?? '/docs'
  const blog = bricks.posts ? listPath(bricks.posts.route?.[main]) : undefined
  // The changelog has no page of its own per entry: its list lives at the route the brick has, else at `pages.changelog`.
  const changelog = bricks.changelog ? listPath(bricks.changelog.route?.[main]) ?? site?.pages?.changelog?.[main] : undefined
  const free = (path: string | undefined) => (path && !taken.has(path) ? path : undefined)
  const noAddress = [...(bricks.posts && !blog ? ['posts'] : []), ...(bricks.changelog && !changelog ? ['changelog'] : [])]
  const addedBlog = free(blog)
  const addedChangelog = free(changelog)
  return {
    docs: { base: docsBase },
    addresses: { ...(blog && { blog }), ...(changelog && { changelog }) },
    ...(addedBlog && { blog: addedBlog }),
    ...(addedChangelog && { changelog: addedChangelog }),
    noAddress,
  }
}
