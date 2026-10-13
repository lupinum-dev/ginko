import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { copyFile, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { defineBuildConfig } from 'unbuild'

// Packages are published from dist/ (see publishConfig in package.json). The workspace keeps importing src/*.ts.
// Runtime files for Nuxt are copied per file (mkdist), not bundled: Nuxt loads them by path from dist/nuxt/runtime.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
}

const runtimeOut = new URL('./dist/nuxt/runtime', import.meta.url).pathname

// mkdist copies import paths as written, so `./shared.ts` would point at a file that does not exist in dist.
// Rewrite relative `.ts` specifiers to `.mjs` in the copied runtime files, their declarations and the .vue page.
// mkdist names declarations `.d.ts`; TypeScript pairs `composables.mjs` only with `composables.d.mts`, so rename them.
async function rewriteTsSpecifiers() {
  for (const file of await readdir(runtimeOut, { recursive: true })) {
    if (!/\.(mjs|d\.ts|vue)$/.test(file)) continue
    const path = join(runtimeOut, file)
    const source = await readFile(path, 'utf8')
    const rewritten = source.replace(/(["'])(\.{1,2}\/[^"']*?)\.ts\1/g, '$1$2.mjs$1')
    // Runtime files are copied, not bundled: a relative import of a file outside dist (src/core) breaks every site's build.
    if (!file.endsWith('.d.ts')) {
      for (const [, , spec] of rewritten.matchAll(/from (["'])(\.{1,2}\/[^"']*)\1/g)) {
        if (!existsSync(resolve(dirname(path), spec!))) throw new Error(`dist/nuxt/runtime/${file} imports ${spec}, which is not in dist`)
      }
    }
    if (file.endsWith('.d.ts')) {
      await writeFile(path.replace(/\.d\.ts$/, '.d.mts'), rewritten)
      await rm(path)
    } else if (rewritten !== source) await writeFile(path, rewritten)
  }
  // Module declarations, not a module: copied unchanged; module.ts adds it to the site's types.
  await copyFile(new URL('./src/nuxt/runtime/schema.d.ts', import.meta.url), join(runtimeOut, 'schema.d.ts'))
}

export default defineBuildConfig({
  entries: [
    { input: 'src/index', name: 'index' },
    { input: 'src/internal', name: 'internal' },
    { input: 'src/vue', name: 'vue' },
    { input: 'src/search', name: 'search' },
    { input: 'src/internal-search', name: 'internal/search' },
    { input: 'src/cli/index', name: 'cli/index' },
    { input: 'src/nuxt/module', name: 'nuxt/module' },
    // Declarations for the .ts files: a site's types for useGinko, useGinkoEntry and GinkoItem come from
    // composables.d.mts (types/ginko.d.ts augments it). The .vue page is copied without one (that would need vue-tsc).
    // schema.d.ts (types of the virtual `#ginko/*` modules) is copied as is after the build (build:done).
    { builder: 'mkdist', input: 'src/nuxt/runtime', outDir: 'dist/nuxt/runtime', declaration: true, pattern: ['**/*.ts', '!**/*.d.ts'] },
    { builder: 'mkdist', input: 'src/nuxt/runtime', outDir: 'dist/nuxt/runtime', declaration: false, pattern: ['**/*.vue'] },
  ],
  declaration: true,
  clean: true,
  externals: [
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.dependencies).map((name) => new RegExp(`^${name}/`)),
    ...Object.keys(pkg.peerDependencies),
    // Loaded with a dynamic import when a site has file bricks. Not a dependency or peer (ginko-content depends on ginko,
    // and a cycle stops the release), so it is only a devDependency here for types and tests.
    '@lupinum/ginko-content',
    'vue',
    'nitropack',
    'h3',
    /^#/,
  ],
  hooks: {
    'build:done': rewriteTsSpecifiers,
  },
})
