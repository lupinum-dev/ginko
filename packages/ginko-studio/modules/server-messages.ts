import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { Nuxt } from 'nuxt/schema'
// Loads the module's type augmentation of `NuxtHooks` (the `ginko-i18n:sources` hook).
import type {} from '@lupinum/ginko-i18n'

// The texts of server errors live in @lupinum/ginko-server (i18n/<locale>.json, the same files its mails use).
// The Studio translates `error.key` with them, so they join the Studio's catalogs under the namespace `server`.
// Found like server-api.ts finds the Convex code: through the host app, because the package exports only convex/*.
export default (_options: unknown, nuxt: Nuxt) => {
  const api = createRequire(`${nuxt.options.rootDir}/`).resolve('@lupinum/ginko-server/convex/_generated/api.js')
  const dir = resolve(dirname(api), '../../i18n')
  nuxt.hook('ginko-i18n:sources', (sources) => { sources.push({ namespace: 'server', dir }) })
}
