// Synced from templates/_features/site/modules/page-paths/index.ts by `pnpm templates sync`. Edit the source, not this copy.
import { defineNuxtModule, tryImportModule } from 'nuxt/kit'
import { pagePaths, toConfig, toNuxt, type Segments, type SiteConfig } from './paths.ts'

// Gives each Vue page of app/pages/ its address per language (rules in ./paths.ts) as `definePageMeta({ i18n: { paths } })`
// would, so the page files of the shared features stay the same in every template.
export default defineNuxtModule({
  meta: { name: 'page-paths' },
  async setup(_options, nuxt) {
    const site = (nuxt.options as { ginko?: SiteConfig }).ginko
    if (!site?.locales.length) return
    // The words of app/routes.ts (a template without `segments` has none).
    const routes = await tryImportModule<{ segments?: Segments }>(`${nuxt.options.srcDir}/routes.ts`)
    const segments = routes?.segments ?? {}

    nuxt.hook('pages:extend', (pages) => {
      for (const page of pages) {
        if (page.meta?.i18n !== undefined) continue
        const file = toConfig(page.path)
        const paths = pagePaths(site, segments, file)
        if (!paths || Object.values(paths).every((path) => path === file)) continue
        page.meta = { ...page.meta, i18n: { paths: Object.fromEntries(Object.entries(paths).map(([locale, path]) => [locale, toNuxt(path)])) } }
      }
    })
  },
})
