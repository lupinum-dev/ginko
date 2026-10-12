import { fileURLToPath } from 'node:url'
import { defineNuxtModule } from '@nuxt/kit'

// Stands in for ginko-cms: ships its own de/en strings under a namespace.
export default defineNuxtModule({
  meta: { name: 'fake-lib' },
  setup(_, nuxt) {
    nuxt.hook('ginko-i18n:sources', (sources) => {
      sources.push({ namespace: 'fakeLib', dir: fileURLToPath(new URL('./i18n', import.meta.url)) })
    })
  },
})
