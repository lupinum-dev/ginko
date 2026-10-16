// Synced from templates/_features/site/site-url.ts by `pnpm templates sync`. Edit the source, not this copy.
// The site's public address (TEMPLATES T12), read once by ginko.config.ts: NUXT_PUBLIC_SITE_URL, else the production
// address Vercel sets (VERCEL_PROJECT_PRODUCTION_URL), else `fallback` from ginko.config.ts. Canonical links, the
// sitemap and share cards start with it, so a Vercel deploy with the example address must not happen.

/** The address to use, without a trailing slash. */
export function siteUrl(fallback: string): string {
  const env = process.env.NUXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  return (env || fallback).replace(/\/+$/, '')
}

/**
 * Stops a Vercel build that would still use an example.com address and names the variable to set. Any other build
 * (CI, a local build, another host) only prints a warning, so a fresh copy of the template builds as it is.
 */
export function checkSiteUrl(url: string): void {
  if (!/^https?:\/\/([^/]+\.)?example\.com(\/|$)/.test(url)) return
  const message = `The site address is still ${url}. Set NUXT_PUBLIC_SITE_URL to the address of the live site (for example https://www.my-site.com) in the build environment, or change \`url\` in ginko.config.ts.`
  if (process.env.VERCEL) throw new Error(message)
  console.warn(`Warning: ${message} Canonical links, the sitemap and share cards use this address.`)
}
