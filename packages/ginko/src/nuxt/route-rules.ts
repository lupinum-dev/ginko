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
 */
export function ginkoRouteRules(site: RouteRules): RouteRules {
  const rules = { ...site }
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
    rules[path] = { ...rules[path], isr: { expiration: false, allowQuery: [] }, headers: { ...rules[path]?.headers, 'cache-control': 'public, max-age=0, must-revalidate', 'x-robots-tag': 'noindex' } }
  }
  return rules
}
