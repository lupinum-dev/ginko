import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineBuildConfig } from 'unbuild'

const dist = fileURLToPath(new URL('./dist/', import.meta.url))

// One file per source module (mkdist), so a Vue app compiles the components itself.
// Sources import each other with `.ts`; mkdist keeps those specifiers, so they are rewritten to `.js`
// after the build (the output files are `.js` and the declarations are `.d.ts`), in the declarations too.
export default defineBuildConfig({
  entries: [{ input: 'src', outDir: 'dist', builder: 'mkdist', ext: 'js' }],
  declaration: true,
  hooks: {
    async 'build:done'() {
      // Recursive: sources have subfolders (src/core).
      for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue
        const file = `${entry.parentPath}/${entry.name}`
        const code = await readFile(file, 'utf8')
        await writeFile(file, code.replace(/(['"])(\.{1,2}\/[^'"]+)\.ts\1/g, '$1$2.js$1'))
      }
    },
  },
})
