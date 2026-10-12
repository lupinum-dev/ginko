import { createRequire } from 'node:module'
import type { Nuxt } from 'nuxt/schema'

// @lupinum/better-convex-nuxt looks for `convex/_generated/api` in the host app's root. The host has no
// convex/ folder: the Convex code lives in @lupinum/ginko-server. Point `#convex/api` there once the
// module has set its own alias (the module offers no option for this).
export default (_options: unknown, nuxt: Nuxt) => {
  const api = createRequire(`${nuxt.options.rootDir}/`).resolve('@lupinum/ginko-server/convex/_generated/api.js').replace(/\.js$/, '')
  nuxt.hook('modules:done', () => {
    nuxt.options.alias['#convex/api'] = api
  })
  nuxt.hook('prepare:types', ({ tsConfig }) => {
    const paths = (tsConfig.compilerOptions ??= {}).paths ??= {}
    paths['#convex/api'] = [api]
  })
}
