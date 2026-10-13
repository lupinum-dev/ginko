// The docs layer. A site extends it and brings ginko.config.ts (with docsCollection), content/ and branding:
//   export default defineNuxtConfig({ extends: ['@lupinum/ginko-docs'], modules: ['@lupinum/ginko/nuxt'], ginko })
// Standalone it is a whole docs site; inside a larger site (`extends` next to the site's own pages and layout) it
// adds only the docs pages, styled from the site's shadcn-style tokens (README: "Inside an existing site").
import { fileURLToPath } from 'node:url'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Icons the layer's own components use. They go into the client bundle; icon names in the site's content
// (the `icon` field) are found by the scan. No icon API: everything is bundled, so static hosting works offline.
const icons = [
  'arrow-left', 'arrow-right', 'arrow-up', 'arrow-up-right', 'check', 'chevron-down', 'chevron-right', 'circle-alert',
  'copy', 'corner-down-left', 'file-text', 'hash', 'languages', 'menu', 'moon', 'panel-left', 'pencil', 'rss',
  'search', 'sun', 'text-align-start', 'x',
].map((name) => `lucide:${name}`)

export default defineNuxtConfig({
  modules: ['@lupinum/ginko-components', '@nuxt/icon', here('./modules/pages')],
  // Tells @lupinum/ginko to keep each page's repository path (`source`) in the served bundle, for "Edit this page".
  // A config hook, not one in modules/pages.ts: it is registered before any module runs, whatever the module order.
  hooks: { 'ginko:files': (options) => { options.keepSource = true } },
  css: [here('./app/assets/docs.css')],
  icon: {
    provider: 'none',
    fallbackToApi: false,
    customCollections: [{ prefix: 'docs', dir: here('./icons') }],
    clientBundle: { icons, scan: true, includeCustomCollections: true },
  },
  // The diagram engine (mermaid + ELK, 462 kB gzip) is loaded only by a page with a ```mermaid block. Left alone, Rolldown
  // put its small shared module helper into that chunk, the icon runtime on every page imported the helper from there,
  // and so every page downloaded the engine. A named group of its own keeps the helper out of it (e2e/docs.spec.ts checks).
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
