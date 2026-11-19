// The platform's request details without Nuxt or virtual-module imports, for the site's server routes and for the
// build (platform-files.ts), which runs before any Nitro virtual module exists.
import { BUNDLE_FORMAT, type Locale } from '../../internal.ts'

/** A platform that does not answer in time is a failure, not a page that never loads. */
export const TIMEOUT_MS = 10_000

/** Header with which the site's server proves to the platform that it is the site (not counted by the visitor rate limit). */
export const SITE_TOKEN_HEADER = 'x-ginko-site-token'

/** The shape of a Convex id: the upload and storage parts of a file address (`/__ginko/file/<upload>/<storage>`). */
export const FILE_ID = /^[a-z0-9]{20,40}$/

/**
 * The platform's bundle request for one locale (SPEC 6): the one place its URL and headers are made, for the pages
 * (fetch.ts) and for the build, which reads the image addresses from it (platform-files.ts). `files=stable` asks for
 * file URLs on the site's own address (`/__ginko/file/…`, server/file.ts), not the storage host. `siteToken` is the
 * private `NUXT_GINKO_REVALIDATE_TOKEN`: only server code passes it, a browser never has it.
 */
export function bundleRequest(platform: string, site: string, locale: Locale, minRev?: string, siteToken?: string): { url: string; init: RequestInit } {
  const query = new URLSearchParams({ format: String(BUNDLE_FORMAT), locale, files: 'stable' })
  if (minRev && /^\d+\.\d+$/.test(minRev)) query.set('minRev', minRev)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (siteToken) headers[SITE_TOKEN_HEADER] = siteToken
  return {
    url: `${platform.replace(/\/$/, '')}/bundle/${encodeURIComponent(site)}?${query}`,
    init: { headers, signal: AbortSignal.timeout(TIMEOUT_MS) },
  }
}
