/** What the build knows about the platform address and the revalidate token. */
export interface PlatformBuildInput {
  /** The site has bricks that read from the platform (not only `source: 'files'`). */
  needsPlatform: boolean
  /** `NUXT_PUBLIC_GINKO_PLATFORM`. */
  platform: string | undefined
  /** `NUXT_GINKO_REVALIDATE_TOKEN`. */
  token: string | undefined
  /** `VERCEL_ENV` ('production', 'preview', 'development'); undefined outside Vercel. */
  vercelEnv: string | undefined
}

const DOCS = 'the Ginko docs, page "Publishing", section Vercel'

/**
 * The build-time check of the platform address. Without it a production site is built and deployed, then answers 503
 * on every page with platform content. Only a Vercel production build fails: Vercel gives a deployment the same
 * variables at build and run time. Every other build only warns, because a `NUXT_PUBLIC_*` variable may also arrive at
 * run time (a Node server, CI that serves the build). Returns the error to throw and the warnings to print.
 */
export function platformBuildCheck({ needsPlatform, platform, token, vercelEnv }: PlatformBuildInput): { error?: string; warnings: string[] } {
  const warnings: string[] = []
  if (!needsPlatform) return { warnings }
  let error: string | undefined
  if (!platform) {
    const message = `[ginko] NUXT_PUBLIC_GINKO_PLATFORM is not set, so this site cannot load its content from the platform and every page with platform content would answer 503. Set NUXT_PUBLIC_GINKO_PLATFORM to the platform address for Production and Preview (on Vercel: Project Settings, Environment Variables), then build again. See ${DOCS}.`
    if (vercelEnv === 'production') error = message
    else warnings.push(message)
  }
  // The token only matters on Vercel, which gets it as `bypassToken`.
  if (!token && vercelEnv !== undefined) {
    warnings.push('[ginko] NUXT_GINKO_REVALIDATE_TOKEN is not set. Publishes will not refresh this site on demand; a change appears only after the cache expires (60 seconds). Set it for Production and Preview to refresh right after a publish.')
  }
  return { error, warnings }
}
