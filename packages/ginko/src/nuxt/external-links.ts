// Opt-in check of `http(s)://` links over the network (`linkCheck.external`). Node only: core stays pure and lists the
// targets (`externalLinks`); this file asks the servers. Runs on `nuxt build` / generate and `ginko check`, never in dev.
// `fileLinkIssues` is the whole link check of file content, the one entry for the build and `ginko check`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { checkLinks, externalLinks, msg, type Bundle, type LinkConfig, type LinkIssue, type Schema, type SiteInput } from '../core/index.ts'

const TIMEOUT_MS = 8000
const CONCURRENCY = 4
const FRESH_MS = 7 * 24 * 60 * 60 * 1000

export type Fetch = (url: string, init: { method: string; redirect: 'follow'; signal: AbortSignal }) => Promise<{ status: number }>
type Verdict = { broken: false } | { broken: true; reason: string }

/** Where the results are kept between runs (OK ones for 7 days); `root` is the site's folder. */
export const externalCacheFile = (root: string) => join(root, 'node_modules/.cache/ginko/external-links.json')

async function request(url: string, fetchFn: Fetch): Promise<number> {
  const send = async (method: string) => (await fetchFn(url, { method, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })).status
  const status = await send('HEAD')
  return status === 405 || status === 501 ? send('GET') : status
}

const errorCode = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: { code?: string } } | undefined
  return e?.cause?.code ?? e?.code
}

/**
 * Dead means: 404/410, a host that does not exist (DNS), or a timeout twice. Every other answer (401, 403, 429, 5xx,
 * other network errors) is "OK-unknown": sites block bots, and we only report what we are sure about.
 */
export async function verdict(url: string, fetchFn: Fetch): Promise<Verdict> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const status = await request(url, fetchFn)
      return status === 404 || status === 410 ? { broken: true, reason: String(status) } : { broken: false }
    } catch (error) {
      if (errorCode(error) === 'ENOTFOUND') return { broken: true, reason: 'DNS' }
      const timeout = (error as Error | undefined)?.name === 'TimeoutError' || (error as Error | undefined)?.name === 'AbortError'
      if (!timeout) return { broken: false }
    }
  }
  return { broken: true, reason: 'timeout' }
}

type Cache = Record<string, number> // url -> time of the last OK answer

function readCache(file: string): Cache {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { ok?: number }>
    return Object.fromEntries(Object.entries(value).flatMap(([url, v]) => (typeof v?.ok === 'number' ? [[url, v.ok]] : [])))
  } catch { return {} }
}

function writeCache(file: string, cache: Cache) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(cache).map(([url, ok]) => [url, { ok }]))))
  } catch { /* the cache is an optimisation */ }
}

export interface ExternalLinkOptions {
  linkCheck: LinkConfig | undefined
  /** The site's folder (cache below `node_modules/.cache/ginko`). */
  root: string
  log: (line: string) => void
  fetch?: Fetch
  now?: () => number
}

/**
 * Checks the `http(s)://` links of the bundles when `linkCheck.external` is `error` or `warn`; otherwise returns nothing, makes
 * no request and prints nothing. Each URL is fetched once per run; at most 4 requests run at once and 1 per host.
 * Prints one summary line and returns the issues of the broken links.
 */
export async function checkExternalLinks(bundles: Bundle[], options: ExternalLinkOptions): Promise<LinkIssue[]> {
  const level = options.linkCheck?.external
  if (level !== 'error' && level !== 'warn') return []
  const fetchFn = options.fetch ?? globalThis.fetch
  const now = (options.now ?? Date.now)()
  const file = externalCacheFile(options.root)
  const cache = readCache(file)
  const found = externalLinks(bundles)
  const urls = [...new Set(found.map((l) => l.href))]
  const fresh = urls.filter((url) => cache[url] !== undefined && now - cache[url]! < FRESH_MS)
  const results = new Map<string, Verdict>()
  const byHost = new Map<string, string[]>()
  for (const url of urls) {
    if (fresh.includes(url)) { results.set(url, { broken: false }); continue }
    const host = URL.canParse(url) ? new URL(url).host : url
    byHost.set(host, [...(byHost.get(host) ?? []), url])
  }
  const queue = [...byHost.values()]
  const worker = async () => {
    for (let hostUrls = queue.shift(); hostUrls; hostUrls = queue.shift()) {
      for (const url of hostUrls) results.set(url, await verdict(url, fetchFn))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  for (const url of urls) {
    const result = results.get(url)!
    if (!result.broken) cache[url] = fresh.includes(url) ? cache[url]! : now
    else delete cache[url]
  }
  if (urls.length) writeCache(file, cache)
  const issues = found.flatMap((l): LinkIssue[] => {
    const result = results.get(l.href)!
    return result.broken ? [{ severity: level, locale: l.locale, brick: l.brick, id: l.id, field: l.field, href: l.href, ...msg('links.externalBroken', { href: l.href, reason: result.reason }) }] : []
  })
  const broken = [...results.values()].filter((r) => r.broken).length
  options.log(`[ginko] external links: ${urls.length} checked, ${fresh.length} from cache, ${broken} broken`)
  return issues
}

/**
 * The link check of file content, shared by the Nuxt build (useFiles) and `ginko check`: route links, anchors,
 * snippets and redirected paths, and with `external` the opt-in `http(s)://` check. Paths of platform bricks are not
 * known here, so unknown paths (files in `public/`) are checked only for sites with file bricks alone.
 */
export async function fileLinkIssues(options: {
  bundles: Bundle[]
  schema: Schema
  site: Pick<SiteInput, 'linkCheck' | 'redirects'>
  publicDir: string
  root: string
  log: (line: string) => void
  fetch?: Fetch
  external: boolean
}): Promise<LinkIssue[]> {
  const { bundles, schema, site } = options
  const onlyFiles = Object.values(schema.bricks).every((b) => b.source === 'files')
  const issues = checkLinks(bundles, schema, { linkCheck: site.linkCheck, redirects: site.redirects, files: onlyFiles ? (path) => existsSync(join(options.publicDir, path)) : undefined })
  if (options.external) issues.push(...await checkExternalLinks(bundles, { linkCheck: site.linkCheck, root: options.root, log: options.log, fetch: options.fetch }))
  return issues
}
