// Vercel "Ignored Build Step" of the projects that deploy main (internals/decisions.md D70): the template sites
// `ginko-template-<name>`, the demo platform `lupinum-ginko-demo` and the docs `lupinum-ginko-docs`. Exit 0 skips
// the build, exit 1 builds. Vercel runs it in the project's root directory as
// `node ../../scripts/vercel-ignore-template.ts` (Node 24 strips the types). Node and git only: it runs before the
// install. `.github/workflows/demo.yml` runs it too, to release the sites' schemas on the same pushes.
//
// A project builds only when main holds a release it has not built yet: the version of @lupinum/ginko differs
// between the commit the project last built and this one. Every push to main used to build up to twelve projects.
// "Redeploy" in Vercel (the same commit again) always builds, so a fix can go live without a release.
// Preview deployments stay skipped: these projects only serve main.
//
// Vercel clones shallowly, so the last built commit is often missing from the clone. We fetch it instead of
// building blindly; if git still cannot answer, we build to stay safe.
import { spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
/** Every public package has this version (the `fixed` group in .changeset/config.json), so it marks a release. */
const versionFile = 'packages/ginko/package.json'

function main() {
  const { VERCEL_ENV, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_GIT_PREVIOUS_SHA: previous } = process.env
  if (VERCEL_ENV !== 'production') return 0
  const run = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const hasCommit = (ref: string) => run('cat-file', '-e', `${ref}^{commit}`).status === 0
  // The project's first build has nothing to compare with.
  if (!previous) return log('build: no earlier build of this project')
  if (previous === sha) return log('build: redeploy of the same commit')
  if (!hasCommit(previous)) run('fetch', '--no-tags', '--depth=1', 'origin', previous)
  if (!hasCommit(previous)) return log(`build: could not fetch ${previous}`)
  const version = (ref: string): string | null => {
    const shown = run('show', `${ref}:${versionFile}`)
    return shown.status === 0 ? JSON.parse(shown.stdout).version : null
  }
  const [before, after] = [version(previous), version('HEAD')]
  if (!before || !after) return log(`build: could not read the version in ${versionFile}`)
  if (before === after) return log(`skip: no release since ${previous.slice(0, 7)}, still ${after}`, false)
  return log(`build: release ${before} → ${after}`)
}

function log(message: string, build = true): number {
  console.log(`[vercel-ignore] ${basename(process.cwd())}: ${message}`)
  return build ? 1 : 0
}

process.exit(main())
