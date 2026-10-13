import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The site's `ginko.config.*` files, as absolute paths. `nuxt.config.ts` imports the config, but Nuxt restarts
 * `nuxt dev` only when `nuxt.config` itself changes: adding these to `nuxt.options.watch` restarts it for them too
 * (without it, a new language or page path does nothing until the dev server is restarted by hand).
 */
export function configFilesToWatch(rootDir: string): string[] {
  return ['ts', 'mts', 'js', 'mjs'].map((ext) => join(rootDir, `ginko.config.${ext}`)).filter(existsSync)
}
