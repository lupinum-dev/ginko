// Packs the site packages into .packs/ for a site outside this monorepo that tries unpublished code
// (lupinum-v7, PLAN phase 23). The site points at .packs/<name>.tgz with `file:`; a tarball install
// keeps one copy of Vue and Nuxt, which `link:` would not. Run: pnpm pack:local, then reinstall the site.
import { execSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const out = join(root, '.packs')
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
for (const dir of ['ginko', 'ginko-i18n', 'ginko-content', 'ginko-components', 'ginko-docs']) {
  const file = execSync(`pnpm pack --pack-destination ${out}`, { cwd: join(root, 'packages', dir), encoding: 'utf8' }).trim().split('\n').at(-1)!
  // Stable names, so the site's package.json does not change with the version.
  renameSync(file.startsWith('/') ? file : join(out, file), join(out, `${dir}.tgz`))
  console.log(`.packs/${dir}.tgz`)
}
