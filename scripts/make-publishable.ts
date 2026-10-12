// Release step: removes `"private": true` from the released packages (the fixed group in
// .changeset/config.json), so `changeset version` and `changeset publish` see them. Server, Studio,
// editor and the agency preset stay private. Run once, in the release commit (RELEASING.md).
// Run: node --experimental-strip-types scripts/make-publishable.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const released: string[] = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8')).fixed[0]
for (const dir of readdirSync(join(root, 'packages'))) {
  const path = join(root, 'packages', dir, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  if (!released.includes(pkg.name) || !pkg.private) continue
  delete pkg.private
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`${pkg.name}: publishable`)
}
