import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Editor field components are mounted as SFCs in tests.
        plugins: [vue()],
        // The Nuxt runtime composables import '#imports' and '#ginko/schema'; tests get small shims.
        resolve: {
          alias: [
            // The Studio layer's own alias (nuxt.config.ts): its components import their siblings through it.
            { find: /^@studio\//, replacement: fileURLToPath(new URL('packages/ginko-studio/app/', import.meta.url)) },
            // The stylesheets of ginko-components (see the Studio's nuxt.config.ts); tests do not need their content.
            { find: /^@ginko-components\//, replacement: fileURLToPath(new URL('packages/ginko-components/src/runtime/', import.meta.url)) },
            // Feature code of the templates (templates/_features) imports the basics by package name, as a template does.
            { find: /^@lupinum\/ginko\/basics$/, replacement: fileURLToPath(new URL('packages/ginko/src/basics/index.ts', import.meta.url)) },
            { find: /^#imports$/, replacement: fileURLToPath(new URL('packages/ginko/test/shims/imports.ts', import.meta.url)) },
            { find: /^#convex\/api$/, replacement: fileURLToPath(new URL('packages/ginko-studio/test/shims/convex-api.ts', import.meta.url)) },
            { find: /^#ginko\/og$/, replacement: fileURLToPath(new URL('packages/ginko/test/shims/og.ts', import.meta.url)) },
            { find: /^#ginko\/schema-org$/, replacement: fileURLToPath(new URL('packages/ginko/test/shims/schema-org.ts', import.meta.url)) },
            { find: /^#ginko\/schema$/, replacement: fileURLToPath(new URL('packages/ginko/test/shims/schema.ts', import.meta.url)) },
          ],
        },
        test: { name: 'packages', include: ['packages/*/test/**/*.test.ts', 'sites/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'], exclude: ['packages/ginko-server/**', '**/node_modules/**'] },
      },
      // convex-test runs Convex functions in the edge-runtime environment (see its docs).
      {
        test: {
          name: 'convex',
          include: ['packages/ginko-server/test/**/*.test.ts'],
          environment: 'edge-runtime',
          setupFiles: ['packages/ginko-server/test/clock.ts'],
          server: { deps: { inline: ['convex-test'] } },
        },
      },
    ],
  },
})
