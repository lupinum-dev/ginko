import { defineBuildConfig } from 'unbuild'

// Only the config entry is built: Node loads `ginko.config.ts` directly, and Node cannot strip
// TypeScript inside node_modules. The Nuxt layer ships as source.
export default defineBuildConfig({
  entries: [{ input: 'src/config', outDir: 'dist', name: 'config' }],
  declaration: true,
})
