// GET /.well-known/ginko-platform: the discovery document of this platform. Public (no sign-in) and cacheable. The
// `ginko` CLI (`release`, `check`, `export`) takes the Studio's address as GINKO_PLATFORM, reads this once per run and
// sends its calls to `backend`, the Convex HTTP address, which the Studio does not proxy (a release can be larger than
// Vercel's request limit). `version` lets the CLI say when the platform is older than the site's Ginko.
import { defineEventHandler, setResponseHeaders, useRuntimeConfig } from '#imports'

export default defineEventHandler((event) => {
  const { ginkoPlatform } = useRuntimeConfig(event)
  setResponseHeaders(event, { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' })
  return { backend: ginkoPlatform.backend, version: ginkoPlatform.version }
})
