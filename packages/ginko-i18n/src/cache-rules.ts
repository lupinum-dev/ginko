// D10: caches that ignore Vary (Vercel ISR, Nitro SWR) must never store a response whose language came
// from a header or cookie: every visitor would get the first visitor's language.

interface CacheRule { isr?: unknown, swr?: unknown, cache?: unknown }

const caches = (rule: CacheRule) => !!(rule.isr || rule.swr || rule.cache)
const toRegExp = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}$`)
/** One concrete path a pattern matches: `/api/**` → `/api/x`. */
const sample = (pattern: string) => pattern.replace(/\*\*?/g, 'x')

/**
 * Route rules that cache a path whose language is negotiated. `negotiated` are the patterns whose
 * language comes from the request (`/api/**`, excludes, user-locale zones, `/` under `prefix`).
 * Returns the caching rule's pattern and the negotiated pattern it hits.
 */
export function cachedNegotiatedPaths(rules: Record<string, CacheRule>, negotiated: string[]): { pattern: string, path: string }[] {
  const entries = Object.entries(rules)
  // Nitro merges every matching rule, the more specific (longer) pattern last, so `/api/**: { isr: false }` wins over `/**`.
  const effective = (path: string) => {
    const hits = entries.filter(([pattern]) => toRegExp(pattern).test(path)).sort(([a], [b]) => a.length - b.length)
    return { rule: Object.assign({}, ...hits.map(([, rule]) => rule)) as CacheRule, pattern: hits.findLast(([, rule]) => caches(rule))?.[0] }
  }
  const found = new Map<string, string>()
  for (const area of negotiated) {
    // A broad rule over the area (`/**`), and narrower rules inside it (`/api/products/**`).
    const paths = [sample(area), ...entries.filter(([pattern, rule]) => caches(rule) && toRegExp(area).test(sample(pattern))).map(([pattern]) => sample(pattern))]
    for (const path of paths) {
      const { rule, pattern } = effective(path)
      if (caches(rule) && pattern && !found.has(pattern)) found.set(pattern, area)
    }
  }
  return [...found].map(([pattern, path]) => ({ pattern, path }))
}
