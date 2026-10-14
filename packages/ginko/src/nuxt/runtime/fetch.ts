/// <reference path="./schema.d.ts" />
// The platform's bundle endpoint (SPEC 6), shared by pages (plugin) and the sitemap route.
// Server-safe: no Nuxt app imports, no global fetch helper. Failures are plain errors with `statusCode: 503`;
// the app plugin and the sitemap route turn them into Nuxt errors with their own `createError`.
import schema from '#ginko/schema'
import { BUNDLE_FORMAT, bundleFits, isBundle, knownBricks, withFileBricks, type Bundle, type Locale } from '../../internal.ts'
import type { GinkoPublicConfig } from './shared.ts'

/** A platform that does not answer in time is a failure, not a page that never loads. */
const TIMEOUT_MS = 10_000
/** Twice the site budget (SPEC 3: 4 MiB of content): anything bigger is not a bundle of this site. */
const MAX_CHARS = 8 * 1024 * 1024

/**
 * The bundle a page reads: the platform's, the site's own file bricks (CONTENT.md), or both merged.
 * File bundles come from `loadFiles` (the app fetches the site's own route `/__ginko/files/<locale>.json`,
 * the server reads the build-time bundle directly), so this file needs no Nuxt app imports.
 */
export async function loadBundle(config: GinkoPublicConfig, locale: Locale, minRev: string | undefined, loadFiles: (locale: Locale) => Promise<Bundle | undefined>, siteToken?: string): Promise<Bundle> {
  const [platform, files] = await Promise.all([
    config.sources.platform ? fetchBundle(config, locale, minRev, siteToken) : undefined,
    config.sources.files ? loadFiles(locale) : undefined,
  ])
  return withFileBricks(platform, files, schema)
}

/** A platform failure: a plain error that carries the status, for the caller to turn into its framework's error. */
export class PlatformError extends Error {
  readonly statusCode = 503
  constructor(message: string, cause?: unknown) { super(message, { cause }) }
}

/**
 * The 503 text. In dev the platform is a local address that is often not running (a new site, a pasted README
 * example), so the message names the bricks that need it, the address tried and the two fixes. Elsewhere it stays
 * the plain, safe text. One ASCII line: Nitro puts it in the status line.
 */
export function unreachableMessage(config: GinkoPublicConfig, url: string): string {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(config.platform)
  if (!local) return 'Content temporarily unavailable'
  const bricks = Object.entries(schema.bricks).filter(([, brick]) => brick.source !== 'files').map(([name]) => name)
  const origin = new URL(url).origin
  return `Ginko cannot get content from the platform at ${origin}, which the brick(s) ${bricks.map((b) => `"${b}"`).join(', ')} read from. Fix: add source: 'files' to read them from Markdown files, or start the platform / set NUXT_PUBLIC_GINKO_PLATFORM.`
}

/** Logged once per server process: a deployment without the platform address answers every platform page with 503. */
let missingPlatformLogged = false

/** Header with which the site's server proves to the platform that it is the site (not counted by the visitor rate limit). */
export const SITE_TOKEN_HEADER = 'x-ginko-site-token'

/**
 * Any platform failure (network, 5xx, 409 STALE, 429, wrong format) is a 503, never a 404:
 * on Vercel a 503 keeps the last good page in the ISR cache, a 404 would replace it (ISR spike).
 */
export async function fetchBundle(config: GinkoPublicConfig, locale: Locale, minRev: string | undefined, siteToken?: string): Promise<Bundle> {
  if (!config.platform) {
    // Only production has no default address; the visitor still gets the plain 503, the log names the cause.
    if (!missingPlatformLogged) console.error('[ginko] NUXT_PUBLIC_GINKO_PLATFORM is not set, so every page with platform content answers 503. Set it to the platform address in the environment of this deployment.')
    missingPlatformLogged = true
    throw new PlatformError('Content temporarily unavailable')
  }
  const query = new URLSearchParams({ format: String(BUNDLE_FORMAT), locale })
  if (minRev && /^\d+\.\d+$/.test(minRev)) query.set('minRev', minRev)
  const url = `${config.platform.replace(/\/$/, '')}/bundle/${encodeURIComponent(config.site)}?${query}`
  let body: unknown
  try {
    // `siteToken` is the private `NUXT_GINKO_REVALIDATE_TOKEN`: only server code passes it, a browser never has it.
    const headers: Record<string, string> = { accept: 'application/json' }
    if (siteToken) headers[SITE_TOKEN_HEADER] = siteToken
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    if (text.length > MAX_CHARS) throw new Error('bundle too large')
    body = JSON.parse(text)
  } catch (error) {
    throw new PlatformError(unreachableMessage(config, url), error)
  }
  // A bundle of the wrong shape, or with a brick of another kind than the site's config, is a
  // platform failure too: defaults must never hide it (an empty collection would 404 detail pages).
  if (!isBundle(body) || body.site !== config.site || !bundleFits(body, schema)) throw new PlatformError('Content in the wrong format')
  return knownBricks(body, schema)
}
