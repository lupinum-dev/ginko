// Gate 7 (spec TEMPLATES.md §9): `nuxt dev --extends scripts/templates/platform-layer` runs a template as it runs on the
// platform, `withoutFiles(config)`: no brick reads files, so the site takes its content from the local Studio.
// Not part of any template; the template's own files stay as they are.
import { useNuxt } from '@nuxt/kit'
import { withoutFiles } from '../../../packages/ginko/src/core/site.ts'

export default defineNuxtConfig({
  hooks: {
    // Before the Ginko module reads its options (`ginko` in the template's nuxt.config).
    'modules:before': () => {
      const nuxt = useNuxt()
      nuxt.options.ginko = withoutFiles(nuxt.options.ginko)
    },
  },
})
