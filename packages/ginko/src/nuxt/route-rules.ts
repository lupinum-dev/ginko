/** The parts of a Nitro route rule that Ginko sets; every other key passes through at runtime. */
interface GinkoRouteRule { isr?: number | boolean | object; headers?: Record<string, string> }
type RouteRules = Record<string, GinkoRouteRule>

/**
 * Nitro's Vercel options with Ginko's bypass token: only that token makes Vercel regenerate a page on demand (SPEC 4.4).
 * A token the site set itself wins.
 */
export function ginkoVercelConfig<V extends { config?: { bypassToken?: string } }>(site: V | undefined, token: string | undefined) {
  return { ...site, config: { ...site?.config, bypassToken: site?.config?.bypassToken ?? token } }
}

/** How long a page stays cached before Vercel renders it again: a default, the site's own `/**` rule wins. */
const ISR_SECONDS = 60

/**
 * Ginko's cache rules on top of the site's own (docs: 11.veroeffentlichen "Vercel"). Ginko only fills what the site
 * left unset, except under /__ginko/: there Ginko's `isr`, `cache-control` and `x-robots-tag` replace the site's, so
 * the preview is never cached or indexed. A more specific rule of the site wins anyway (Nitro merges by specificity).
 * `noindex` are the paths of the pages in `seo.noindex`: they answer with `X-Robots-Tag: noindex`. With `platform`
 * (the site has platform bricks) the search index is built from platform content at runtime, so it expires like a page.
 */
export function ginkoRouteRules(site: RouteRules, { noindex = [], platform = false }: { noindex?: readonly string[]; platform?: boolean } = {}): RouteRules {
  const rules = { ...site }
  for (const path of noindex) rules[path] = { ...rules[path], headers: { 'x-robots-tag': 'noindex', ...rules[path]?.headers } }
  // ISR for every page; queries share one cache entry so a refresh reaches them (ISR spike, question 5).
  rules['/**'] = { ...rules['/**'], isr: rules['/**']?.isr ?? { expiration: ISR_SECONDS, allowQuery: [] } }
  // A site's own server routes pick their language from a header or cookie (ginko-i18n), so they are not cached.
  rules['/api/**'] = { isr: false, ...rules['/api/**'] }
  // Ginko's own addresses are never indexed. The preview and other dynamic routes are never cached either; the exact
  // path and its children need their own rules (ISR spike).
  for (const path of ['/__ginko', '/__ginko/**']) {
    rules[path] = { ...rules[path], isr: false, headers: { ...rules[path]?.headers, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } }
  }
  // The file bundles, Markdown trees and search indexes are build output: Vercel and Netlify keep them until the next
  // deploy, a browser asks again each time (they change with every deploy, under the same address).
  for (const path of ['/__ginko/files/**', '/__ginko/search/**']) {
    const isr = path === '/__ginko/search/**' && platform ? rules['/**'].isr : { expiration: false, allowQuery: [] }
    rules[path] = { ...rules[path], isr, headers: { ...rules[path]?.headers, 'cache-control': 'public, max-age=0, must-revalidate', 'x-robots-tag': 'noindex' } }
  }
  // The platform's files (images) are public content, not preview: indexable, and cached for good because a storage id never changes its bytes.
  // `all` replaces the noindex of /__ginko/** above (headers merge by key).
  if (platform) rules['/__ginko/file/**'] = { ...rules['/__ginko/file/**'], isr: false, headers: { ...rules['/__ginko/file/**']?.headers, 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable', 'x-robots-tag': 'all' } }
  return rules
}
