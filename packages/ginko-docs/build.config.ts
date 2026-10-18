import { defineBuildConfig } from 'unbuild'

// Node cannot strip TypeScript inside node_modules, so what Node loads itself is built: the config entry
// (`ginko.config.ts` imports it) and the layer's module (Nuxt 5 loads modules natively). The rest of the
// layer ships as source; Nuxt compiles it.
export default defineBuildConfig({
  entries: [
    { input: 'src/config', outDir: 'dist', name: 'config' },
    { input: 'modules/pages', outDir: 'dist', name: 'pages' },
    { input: 'modules/icons', outDir: 'dist', name: 'icons' },
  ],
  declaration: true,
})
