// Copies the repository's templates (templates/<name>, without build output and installs) into templates/ here, so the
// published package carries them; create-ginko --template <name> copies them from there. Next to each copy goes
// <name>.json (template-files.mjs manifestOf): the locales and the date fields, read from the template's config,
// which only the monorepo can import. Runs before `pnpm pack` (prepack) and in the root `pnpm build`.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { manifestOf, notCopied } from './template-files.mjs'

const source = fileURLToPath(new URL('../../templates/', import.meta.url))
const out = fileURLToPath(new URL('./templates/', import.meta.url))

rmSync(out, { recursive: true, force: true })
mkdirSync(out)
const names = readdirSync(source).filter((name) => !name.startsWith('_') && existsSync(join(source, name, 'package.json')) && statSync(join(source, name)).isDirectory())
for (const name of names) {
  const target = join(out, name)
  cpSync(join(source, name), target, { recursive: true, filter: (path) => !notCopied.has(basename(path)) })
  // npm drops .gitignore from published packages; create-ginko renames it back.
  if (existsSync(join(target, '.gitignore'))) renameSync(join(target, '.gitignore'), join(target, 'gitignore'))
  const site = (await import(pathToFileURL(join(source, name, 'ginko.config.ts')).href)).default
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(manifestOf(site), null, 2)}\n`)
}
console.log(`create-ginko: bundled ${names.length} template${names.length === 1 ? '' : 's'} (${names.join(', ')})`)
