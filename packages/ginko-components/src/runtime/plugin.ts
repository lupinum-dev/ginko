import { defineNuxtPlugin, useI18n, useRuntimeConfig } from '#imports'
import { GINKO_COMPONENTS_KEY } from '@lupinum/ginko/internal'
import { componentMap } from './components/index'
import { EMBED_PROVIDERS_KEY, type EmbedProviderEntry } from './components/embed-utils'
import { TEXT_KEY, type Translate } from './components/text'

// <GinkoMarkdown> injects this map; a site's own `components` prop wins per tag.
export default defineNuxtPlugin({
  name: 'ginko-components',
  setup(nuxtApp) {
    nuxtApp.vueApp.provide(GINKO_COMPONENTS_KEY, componentMap)
    // The merged embed providers (built-ins plus the site's config) are plain data from the module.
    const providers = useRuntimeConfig().public.ginkoEmbeds as EmbedProviderEntry[] | undefined
    if (providers) nuxtApp.vueApp.provide(EMBED_PROVIDERS_KEY, providers)
    // The factory runs inside a component's setup, where ginko-i18n has the route and the Nuxt context.
    nuxtApp.vueApp.provide(TEXT_KEY, () => {
      const { t } = useI18n('components')
      return ((key, params) => t(key as never, params as never)) as Translate
    })
  },
})
