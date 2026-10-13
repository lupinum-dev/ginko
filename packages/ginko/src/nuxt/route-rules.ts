/** The parts of a Nitro route rule that Ginko sets; every other key passes through. */
interface RouteRule { isr?: unknown; headers?: Record<string, string>; [key: string]: unknown }
type RouteRules = Record<string, RouteRule>

/** How long a page stays cached before Vercel renders it again: a default, the site's own `/**` rule wins. */
export const ISR_SECONDS = 60

/**
 * Ginko's cache rules on top of the site's own (docs: 11.veroeffentlichen "Vercel"). Ginko only fills what the site
 * left unset; a more specific rule of the site wins anyway (Nitro merges rules by specificity).
 */
export function ginkoRouteRules(site: RouteRules): RouteRules {
  const rules = { ...site }
  // ISR for every page; queries share one cache entry so a refresh reaches them (ISR spike, question 5).
  rules['/**'] = { ...rules['/**'], isr: rules['/**']?.isr ?? { expiration: ISR_SECONDS, allowQuery: [] } }
  // A site's own server routes pick their language from a header or cookie (ginko-i18n), so they are not cached.
  rules['/api/**'] = { isr: false, ...rules['/api/**'] }
  // The preview is never cached and never indexed: the exact path and its children need their own rules (ISR spike).
  for (const path of ['/__ginko', '/__ginko/**']) {
    rules[path] = { ...rules[path], isr: false, headers: { ...rules[path]?.headers, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } }
  }
  return rules
}
