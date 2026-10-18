// The docs layer. A site extends it and brings ginko.config.ts (with docsCollection), content/ and branding:
//   export default defineNuxtConfig({ extends: ['@lupinum/ginko-docs'], modules: ['@lupinum/ginko/nuxt'], ginko })
// Standalone it is a whole docs site; inside a larger site (`extends` next to the site's own pages and layout) it
// adds only the docs pages, styled from the site's shadcn-style tokens (README: "Inside an existing site").
import { fileURLToPath } from 'node:url'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineNuxtConfig({
  modules: ['@lupinum/ginko-components', '@lupinum/ginko-docs/pages', '@lupinum/ginko-docs/icons'],
  // Tells @lupinum/ginko to keep each page's repository path (`source`) in the served bundle, for "Edit this page".
  // A config hook, not one in modules/pages.ts: it is registered before any module runs, whatever the module order.
  hooks: { 'ginko:files': (options) => { options.keepSource = true } },
  css: [here('./app/assets/docs.css')],
  // The diagram engine (mermaid + ELK, 462 kB gzip) is loaded only by a page with a ```mermaid block. Left alone, Rolldown
  // could put its small shared module helper into that chunk, and every page importing the helper downloaded the engine. A named group of its own keeps the helper out of it (e2e/docs.spec.ts checks).
  vite: {
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: 'mermaid', test: /[\\/]node_modules[\\/](beautiful-mermaid|elkjs|mermaid)[\\/]/, includeDependenciesRecursively: false }],
          },
        },
      },
    },
  },
})
