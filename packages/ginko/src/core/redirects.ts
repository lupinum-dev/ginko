import type { Bundle } from './bundle.ts'
import { trimPath } from './path.ts'

export interface Redirect { from: string; to: string; status?: 301 | 302 | 307 | 308 }

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface CompiledRule {
  rule: Redirect
  pattern: RegExp
  params: string[]
  wildcard: boolean
}

function compile(rule: Redirect): CompiledRule {
  const wildcard = rule.from.endsWith('*')
  const base = trimPath(wildcard ? rule.from.slice(0, -1).replace(/\/$/, '') : rule.from)
  const params: string[] = []
  const source = base
    .split('/')
    .map((segment) => {
      const param = /^:([A-Za-z_]\w*)$/.exec(segment)
      if (!param) return escapeRegex(segment)
      params.push(param[1]!)
      return '([^/]+)'
    })
    .join('/')
  // `/old/*` also matches `/old` (empty rest), so the wildcard part is optional.
  const tail = wildcard ? '(?:/(.*))?' : ''
  return { rule, pattern: new RegExp(`^${source}${tail}$`), params, wildcard }
}

// Rules are compiled once per rule list (config rules are one stable array; entry rules are cached per bundle below),
// not on every request. Keyed by identity: a list that is changed in place after its first match is not recompiled.
const compiledRules = new WeakMap<readonly Redirect[], CompiledRule[]>()
const entryRules = new WeakMap<Bundle, Redirect[]>()

function compiledFor(rules: readonly Redirect[]): CompiledRule[] {
  let compiled = compiledRules.get(rules)
  if (!compiled) compiledRules.set(rules, compiled = rules.map(compile))
  return compiled
}

/**
 * First matching rule wins. `from` may hold `:name` segments and one trailing `*`; `to` may use `:name` and `:splat`. Query strings of the request are kept.
 */
export function matchRedirect(rules: readonly Redirect[], path: string): { to: string; status: 301 | 302 | 307 | 308 } | undefined {
  const queryStart = path.indexOf('?')
  const pathPart = trimPath(queryStart === -1 ? path : path.slice(0, queryStart))
  const query = queryStart === -1 ? '' : path.slice(queryStart + 1)

  for (const compiled of compiledFor(rules)) {
    const match = compiled.pattern.exec(pathPart)
    if (!match) continue

    const values: Record<string, string> = {}
    compiled.params.forEach((name, index) => {
      values[name] = match[index + 1] ?? ''
    })
    values.splat = compiled.wildcard ? (match[match.length - 1] ?? '') : ''

    let to = compiled.rule.to.replace(/:([A-Za-z_]\w*)/g, (token, name: string) => values[name] ?? token)
    // A path stays a path on this site: a substituted `//evil.example` would be read as another host.
    // Targets written as full URLs in the rule (`https://…`) are not touched.
    if (/^[/\\]/.test(to)) to = '/' + to.replace(/^[/\\]+/, '')
    if (query) to += (to.includes('?') ? '&' : '?') + query
    return { to, status: compiled.rule.status ?? 301 }
  }
  return undefined
}

/** The redirect for `path`: the site's config rules first, then the entries' `redirectFrom` in the given bundle (the one of the path's locale). */
export function findRedirect(rules: readonly Redirect[], bundle: Bundle | undefined, path: string): { to: string; status: 301 | 302 | 307 | 308 } | undefined {
  if (!bundle) return matchRedirect(rules, path)
  let fromEntries = entryRules.get(bundle)
  if (!fromEntries) entryRules.set(bundle, fromEntries = entryRedirects(bundle))
  return matchRedirect(rules, path) ?? matchRedirect(fromEntries, path)
}

/**
 * Rules from entries: every collection item whose data has `redirectFrom` (a string or string[] of old paths) gets a 301 rule from each old path to its URL in the bundle's locale. Items without a URL are skipped.
 */
export function entryRedirects(bundle: Bundle): Redirect[] {
  const rules: Redirect[] = []
  for (const brick of Object.values(bundle.bricks)) {
    if (brick.kind !== 'collection') continue
    for (const item of brick.items) {
      const value = item.data.redirectFrom
      const oldPaths = Array.isArray(value)
        ? value.filter((path): path is string => typeof path === 'string')
        : typeof value === 'string' ? [value] : []
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      for (const from of oldPaths) rules.push({ from, to: url, status: 301 })
    }
  }
  return rules
}

/**
 * Problems a site config's rules have, in English: `from` not starting with `/`, a rule redirecting to itself, two rules with the same `from`.
 */
export function redirectProblems(rules: readonly Redirect[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const { from, to } of rules) {
    if (!from.startsWith('/')) problems.push(`"${from}": path must start with "/".`)
    if (trimPath(from) === trimPath(to)) problems.push(`"${from}": redirect points to itself.`)
    if (/^[/\\]?:/.test(to)) problems.push(`"${from}": "to" starts with a parameter (${to}). Start it with a fixed path such as "/new/:splat" so a visitor cannot choose the target host.`)
    if (seen.has(from)) problems.push(`"${from}": defined more than once.`)
    seen.add(from)
  }
  return problems
}
