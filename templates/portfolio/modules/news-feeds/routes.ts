// Synced from templates/_features/blog/modules/news-feeds/routes.ts by `pnpm templates sync`. Edit the source, not this copy.
/**
 * The feed of each language's news page (`<news page>/rss.xml`) for a static build (`nuxt generate`), whose crawler
 * skips the feeds because they end in .xml. A server build lists none: there the middleware answers each request.
 */
export function feedRoutes(news: Record<string, string> | undefined, isStatic: boolean): string[] {
  if (!news || !isStatic) return []
  return Object.values(news).map((page) => `${page === '/' ? '' : page}/rss.xml`)
}
