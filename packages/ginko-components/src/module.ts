// Nuxt module: gives <GinkoMarkdown> the tag → component map and adds the stylesheet.
// The registry (`@lupinum/ginko-components/registry`) is separate and pure data; list it in `ginko.config.ts`.
import type {} from '@lupinum/ginko-i18n' // the `ginko-i18n:sources` hook type
import { addPlugin, createResolver, defineNuxtModule, hasNuxtModule } from '@nuxt/kit'
import { STYLES } from './styles'
import { mergeProviders, type EmbedProviderConfig } from './runtime/components/embed-utils'

export type { EmbedProvider, EmbedProviderConfig } from './runtime/components/embed-utils'

export interface ModuleOptions {
  embeds?: {
    /** Adds or replaces a provider of the `embed` component by id; `false` disables a built-in. See the README. */
    providers?: EmbedProviderConfig
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@lupinum/ginko-components', configKey: 'ginkoComponents' },
  setup(options, nuxt) {
    // Throws a clear error naming the provider id when the config is invalid.
    nuxt.options.runtimeConfig.public.ginkoEmbeds = mergeProviders(options.embeds?.providers)
    const { resolve } = createResolver(import.meta.url)
    addPlugin({ src: resolve('./runtime/plugin'), mode: 'all' })
    for (const file of STYLES) {
      const css = resolve(`./runtime/${file}`)
      if (!nuxt.options.css.includes(css)) nuxt.options.css.push(css)
    }
    // Default UI texts (de, en); the host app overrides single keys under `components.*` in its own i18n folder.
    nuxt.hook('ginko-i18n:sources', (sources) => { sources.push({ namespace: 'components', dir: resolve('../i18n') }) })
    // The UI texts come from ginko-i18n's `useI18n`; without the module the build fails on an unclear import error.
    nuxt.hook('modules:done', async () => {
      if (await hasNuxtModule('@lupinum/ginko-i18n', nuxt)) return
      throw new Error("@lupinum/ginko-components needs @lupinum/ginko-i18n for its UI texts. Add '@lupinum/ginko/nuxt' to `modules` in nuxt.config.ts (it installs ginko-i18n with the languages of ginko.config.ts).")
    })
  },
})
