import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// The projects that deploy main build only on a release (D70). A wrong build costs build minutes on every push to
// main; a wrong skip leaves the demo, the docs and the template sites behind the release.
describe('vercel-ignore-template', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
    return result.stdout.trim()
  }
  const origin = join(dir, 'origin')
  for (const folder of ['scripts', 'packages/ginko', 'templates/blog']) mkdirSync(join(origin, folder), { recursive: true })
  copyFileSync(fileURLToPath(new URL('../vercel-ignore-template.ts', import.meta.url)), join(origin, 'scripts/vercel-ignore-template.ts'))
  git(origin, 'init', '-q', '-b', 'main')
  // GitHub serves any commit by its SHA; a local remote needs this switched on.
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
  const commit = (file: string, text: string) => {
    writeFileSync(join(origin, file), text)
    git(origin, 'add', '.')
    git(origin, 'commit', '-q', '-m', file)
    return git(origin, 'rev-parse', 'HEAD')
  }
  const first = commit('packages/ginko/package.json', '{"name":"@lupinum/ginko","version":"1.0.0"}')
  const feature = commit('templates/blog/app.vue', '<template />')
  const release = commit('packages/ginko/package.json', '{"name":"@lupinum/ginko","version":"1.1.0"}')
  const afterRelease = commit('templates/blog/app.vue', '<template><div /></template>')

  // Vercel's clone: shallow, at the pushed commit, with the remote named origin.
  let clones = 0
  const ignore = (sha: string, previous: string | undefined, env = 'production') => {
    const clone = join(dir, `clone-${clones++}`)
    git(dir, 'init', '-q', clone)
    git(clone, 'remote', 'add', 'origin', `file://${origin}`)
    git(clone, 'fetch', '-q', '--depth=1', 'origin', sha)
    git(clone, 'checkout', '-q', 'FETCH_HEAD')
    return spawnSync(process.execPath, [join(clone, 'scripts/vercel-ignore-template.ts')], {
      cwd: join(clone, 'templates/blog'),
      env: { PATH: process.env.PATH, VERCEL_ENV: env, VERCEL_GIT_COMMIT_SHA: sha, ...(previous && { VERCEL_GIT_PREVIOUS_SHA: previous }) },
    }).status
  }

  it.each([
    ['a push to main without a release skips, although the template changed', feature, first, 'production', 0],
    ['a push that holds a release builds', release, feature, 'production', 1],
    ['a later push builds when the release was not built yet', afterRelease, feature, 'production', 1],
    ['the push after a built release skips', afterRelease, release, 'production', 0],
    ['a redeploy of the same commit builds', feature, feature, 'production', 1],
    ['the first build of a project builds', feature, undefined, 'production', 1],
    ['a last build that cannot be fetched builds', feature, '0123456789abcdef0123456789abcdef01234567', 'production', 1],
    ['a preview never builds', release, feature, 'preview', 0],
  ])('%s', (_, sha, previous, env, expected) => {
    expect(ignore(sha, previous, env)).toBe(expected)
  })
})
