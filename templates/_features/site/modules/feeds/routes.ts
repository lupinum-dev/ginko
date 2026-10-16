/**
 * The feed addresses a static build must list: `<page>/rss.xml` in every language for each feed the template has. A
 * feed is a file `server/middleware/<page key>-feed.ts` (the blog's `news-feed.ts`, the changelog's
 * `changelog-feed.ts`) whose page key is in `pages` of ginko.config.ts; a feed without its page has no address.
 */
export function feedRoutes(middleware: readonly string[], pages: Record<string, Record<string, string>>): string[] {
  return middleware.flatMap((file) => {
    const key = /^(.+)-feed\.ts$/.exec(file)?.[1]
    const paths = key && Object.hasOwn(pages, key) ? pages[key] : undefined
    return paths ? Object.values(paths).map((path) => `${path.replace(/\/$/, '')}/rss.xml`) : []
  })
}
