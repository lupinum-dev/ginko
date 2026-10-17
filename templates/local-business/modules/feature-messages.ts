// Synced from templates/_features/site/modules/feature-messages.ts by `pnpm templates sync`. Edit the source, not this copy.
import { readdirSync, statSync } from 'node:fs'
import type {} from '@lupinum/ginko-i18n'
import { createResolver, defineNuxtModule } from 'nuxt/kit'

// The texts of the shared components: each folder in i18n/ (i18n/site/en.json, …) is read under its folder name, so
// `useI18n('site')` finds them. The site's own i18n/<code>.json still wins per key, so a text is changed there, not
// in the shared files. Files of a language the site does not have are ignored.
export default defineNuxtModule({
  meta: { name: 'feature-messages' },
  setup(_options, nuxt) {
    const { resolve } = createResolver(nuxt.options.rootDir)
    const root = resolve('i18n')
    const folders = readdirSync(root).filter((name) => statSync(resolve('i18n', name)).isDirectory())
    nuxt.hook('ginko-i18n:sources', (sources) => {
      for (const namespace of folders) sources.push({ namespace, dir: resolve('i18n', namespace) })
    })
  },
})
