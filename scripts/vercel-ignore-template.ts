// Vercel "Ignored Build Step" of the demo projects ginko-template-<name> (internals/decisions.md D55):
// exit 0 skips the build, exit 1 builds. Each project's root directory is templates/<name>, and Vercel runs this
// there as `node ../../scripts/vercel-ignore-template.ts` (Node 24 strips the types). Node and git only: it runs before the
// install.
//
// Every push to main used to build all ten templates. Now a template builds only when its inputs changed since the
// commit its project last built: its own folder (the shared features are copied into it, and `templates sync
// --check` keeps the copies current), the workspace packages it imports, the root install files, and this script.
// Changelogs, readmes, tests and version-only bumps in those packages do not reach a site build, so they are left out.
// Preview deployments stay skipped: the demo only serves main.
//
// Vercel clones shallowly, so the last built commit is often missing from the clone. We fetch it instead of
// building blindly; if git still cannot answer, we build to stay safe.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const self = 'scripts/vercel-ignore-template.ts'
const rootFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.nvmrc', '.node-version']

/** Files in a package folder that a site build never reads. */
const notBuildInput = /^[^/]+\.md$|^LICENSE$|^(test|research|browser)\//

/** Workspace package folders by package name, e.g. '@lupinum/ginko' → 'packages/ginko'. */
export function workspacePackages(dir = root): Map<string, string> {
  const byName = new Map<string, string>()
  for (const folder of readdirSync(join(dir, 'packages'))) {
    try {
      byName.set(JSON.parse(readFileSync(join(dir, 'packages', folder, 'package.json'), 'utf8')).name, `packages/${folder}`)
    } catch {}
  }
  return byName
}

/** The package folders a template imports, directly or through other workspace packages. */
type Manifest = Record<'dependencies' | 'peerDependencies' | 'optionalDependencies' | 'devDependencies', Record<string, string> | undefined>

export function packagesOf(template: string, dir = root): string[] {
  const byName = workspacePackages(dir)
  const read = (folder: string): Manifest => JSON.parse(readFileSync(join(dir, folder, 'package.json'), 'utf8'))
  const names = (pkg: Manifest, dev: boolean) => Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies, ...(dev ? pkg.devDependencies : {}) })
  const found = new Set<string>()
  const queue = names(read(`templates/${template}`), true)
  while (queue.length) {
    const folder = byName.get(queue.pop()!)
    if (!folder || found.has(folder)) continue
    found.add(folder)
    queue.push(...names(read(folder), false))
  }
  return [...found].sort()
}

/**
 * Whether a change of these paths can change the template's build. `versionOnly(path)` says whether a package's
 * package.json changed only in its `version` field.
 */
export function needsBuild(template: string, packages: string[], changed: string[], versionOnly = (_path: string) => false): boolean {
  return changed.some((path) => {
    if (path === self || rootFiles.includes(path) || path.startsWith(`templates/${template}/`)) return true
    const pkg = packages.find((folder) => path.startsWith(`${folder}/`))
    if (!pkg) return false
    const inner = path.slice(pkg.length + 1)
    if (notBuildInput.test(inner)) return false
    return !(inner === 'package.json' && versionOnly(path))
  })
}

function main() {
  if (process.env.VERCEL_ENV !== 'production') return 0
  const run = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const hasCommit = (ref: string) => run('cat-file', '-e', `${ref}^{commit}`).status === 0
  const template = basename(process.cwd())
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA
  // The project's first build has nothing to compare with.
  if (!previous) return log(template, 'build: no earlier build of this project')
  if (!hasCommit(previous)) run('fetch', '--no-tags', '--depth=1', 'origin', previous)
  if (!hasCommit(previous)) return log(template, `build: could not fetch ${previous}`)
  const diff = run('diff', '--name-only', '--no-renames', previous, 'HEAD')
  if (diff.status !== 0) return log(template, 'build: git diff failed')
  const changed = diff.stdout.split('\n').filter(Boolean)
  const json = (ref: string, path: string): Record<string, unknown> | null => {
    const shown = run('show', `${ref}:${path}`)
    return shown.status === 0 ? JSON.parse(shown.stdout) : null
  }
  const versionOnly = (path: string) => {
    const [before, after] = [json(previous, path), json('HEAD', path)]
    if (!before || !after) return false
    delete before.version
    delete after.version
    return JSON.stringify(before) === JSON.stringify(after)
  }
  const build = needsBuild(template, packagesOf(template), changed, versionOnly)
  return log(template, `${build ? 'build' : 'skip'}: ${changed.length} files changed since ${previous.slice(0, 7)}`, build)
}

function log(template: string, message: string, build = true): number {
  console.log(`[vercel-ignore] ${template}: ${message}`)
  return build ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main())
