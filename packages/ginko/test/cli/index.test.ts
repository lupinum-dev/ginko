import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/cli/index.ts'
import { main as monorepoMain } from '../../src/cli/monorepo.ts'
import { PlatformError } from '../../src/cli/platform.ts'
import { exitCodeOf, type CliDeps } from '../../src/cli/run.ts'

/** Runs the CLI (`ginko` unless another is given) and returns its exit code, the stdout text and the stderr lines. */
async function run(argv: string[], deps: Partial<CliDeps> = {}, cli = main) {
  const out: string[] = []
  const log: string[] = []
  const code = await cli(argv, {
    env: {},
    git: async () => '',
    stdout: (text) => out.push(text),
    log: (line) => log.push(line),
    fetch: async () => { throw new Error('no network call expected') },
    ...deps,
  })
  return { code, stdout: out.join(''), log }
}

const KEY = 'ginko_site_00000000000000000000000000000000'

describe('ginko release', () => {
  it('reports a superseded commit with exit 0 before it loads the config or needs the platform credentials', async () => {
    const { code, stdout } = await run(['release', '--config', 'missing/ginko.config.ts'], {
      env: { GITHUB_SHA: 'new-commit' },
      git: async () => 'old-commit\trefs/heads/main\n',
    })
    expect(code).toBe(0)
    expect(stdout).toBe('{"ok":true,"deploy":false,"reason":"superseded"}\n')
  })

  it('takes the commit from GINKO_COMMIT before GITHUB_SHA', async () => {
    const { stdout } = await run(['release', '--config', 'missing/ginko.config.ts'], {
      env: { GINKO_COMMIT: 'new-commit', GITHUB_SHA: 'old-commit' },
      git: async () => 'old-commit\trefs/heads/main\n',
    })
    expect(JSON.parse(stdout)).toMatchObject({ deploy: false })
  })

  it('compares with GINKO_BRANCH on GINKO_REMOTE, default origin/main', async () => {
    const calls: string[][] = []
    const git = async (args: string[]) => { calls.push(args); return 'c1\trefs/heads/x\n' }
    await run(['release'], { env: { GINKO_COMMIT: 'c0' }, git })
    await run(['release'], { env: { GINKO_COMMIT: 'c0', GINKO_BRANCH: 'production', GINKO_REMOTE: 'upstream' }, git })
    expect(calls).toEqual([['ls-remote', 'origin', 'refs/heads/main'], ['ls-remote', 'upstream', 'refs/heads/production']])
  })
})

describe('ginko output and exit codes', () => {
  const PLATFORM = { GINKO_PLATFORM: 'https://platform.example', GINKO_KEY: KEY }
  const RESTAURANT = fileURLToPath(new URL('../../../../sites/restaurant/ginko.config.ts', import.meta.url))
  // A valid platform state, but of the site "b": the key belongs to another site.
  const otherSite = async () => Response.json({ site: 'b', schema: { bricks: {}, migrations: [], retired: {} }, schemaRev: 1, contentRev: 1, migrations: [], entries: [] })
  const RELEASE = { ...PLATFORM, GINKO_COMMIT: 'c1' }
  const head = async () => 'c1\trefs/heads/main\n'

  it.each<[string, string[], number, string, Partial<CliDeps>?, string?]>([
    ['no command', [], 2, 'USAGE'],
    ['unknown command', ['dev'], 2, 'USAGE'],
    ['unknown option', ['export', '--out', 'x'], 2, 'USAGE'],
    ['option of another command', ['release', '--offline'], 2, 'USAGE'],
    ['folder on a command without one', ['check', 'x'], 2, 'USAGE'],
    ['--config= without a path', ['check', '--config='], 2, 'USAGE', {}, '--config needs a path.'],
    ['missing environment variable', ['export'], 2, 'USAGE'],
    // The message proves that the CLI read NUXT_PUBLIC_GINKO_PLATFORM: without it, GINKO_PLATFORM would be missing.
    ['invalid platform address', ['export'], 2, 'USAGE', { env: { NUXT_PUBLIC_GINKO_PLATFORM: 'not a url', GINKO_KEY: KEY } }, 'GINKO_PLATFORM is not a valid URL.'],
    // GINKO_PLATFORM points at the site or another host: fix the setting, not the code.
    ['a platform address without Ginko', ['export'], 2, 'USAGE', { env: PLATFORM, fetch: async () => new Response('<h1>Not found</h1>', { status: 404 }) }],
    // The site's code is not at fault, so not exit 1.
    ['a platform answer that is not an export', ['export'], 3, 'UNAVAILABLE', { env: PLATFORM, fetch: async () => Response.json({ ok: true }) }],
    ['config that cannot be loaded', ['check', '--config', 'missing/ginko.config.ts'], 1, 'INVALID'],
    // Exit 3 tells CI that a rerun can help; the codes below come from the real throw sites, not from a hand-built error.
    ['an unreachable platform', ['export'], 3, 'UNAVAILABLE', { env: PLATFORM, fetch: async () => { throw new TypeError('fetch failed') } }],
    ['git ls-remote fails', ['release'], 3, 'UNAVAILABLE', { env: RELEASE, git: async () => { throw new Error('network') } }],
    ['the release branch does not exist', ['release'], 2, 'USAGE', { env: RELEASE, git: async () => '' }],
    ['release with a key of another site', ['release', '--config', RESTAURANT], 4, 'FORBIDDEN', { env: RELEASE, git: head, fetch: otherSite }],
    ['check with a key of another site', ['check', '--config', RESTAURANT], 4, 'FORBIDDEN', { env: PLATFORM, fetch: otherSite }],
  ])('%s (%j): exit %i, one JSON line with error.code %s', async (_name, argv, exit, code, deps = {}, message = expect.any(String)) => {
    const result = await run(argv, deps)
    expect(result.code).toBe(exit)
    expect(result.stdout.split('\n')).toEqual([expect.any(String), ''])
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: { code, message } })
    // The human text goes to stderr.
    expect(result.log.join('\n')).toContain(JSON.parse(result.stdout).error.message)
  })

  it.each([
    ['a platform rejection', 1, new PlatformError('SCHEMA_REJECTED', 'no', 400)],
    ['a server error of the platform', 3, new PlatformError('INTERNAL', 'try later', 500)],
    ['a site that kept changing', 3, new PlatformError('CHANGED_SINCE', 'changed', 409)],
    ['a revoked key', 4, new PlatformError('UNAUTHORIZED', 'no key', 401)],
    ['a key without the scope', 4, new PlatformError('FORBIDDEN', 'not allowed', 403)],
    ['a proxy that refuses access', 4, new PlatformError('HTTP_401', 'HTTP 401', 401)],
    ['an unexpected error', 1, new Error('EACCES')],
  ])('%s exits with %i', (_name, exit, error) => {
    expect(exitCodeOf(error)).toBe(exit)
  })

  // Wrong behaviour caught: a script that adds --json to ginko and ginko-i18n alike fails on ginko with USAGE.
  it('accepts --json on every command (the output is JSON anyway)', async () => {
    const result = await run(['check', '--offline', '--json', '--config', RESTAURANT])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true })
  })

  it('prints help and the version as plain text with exit 0', async () => {
    const help = await run(['export', '--help'])
    expect([help.code, help.stdout]).toEqual([0, expect.stringContaining('Usage: ginko <command>')])
    const version = await run(['--version'])
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
    expect([version.code, version.stdout]).toEqual([0, `${pkg.version}\n`])
  })
})

// Wrong behaviour caught: pnpm runs root scripts in the repository root, so a default ./ginko.config.ts made
// local:dev start the platform and `nuxt dev` there instead of in a site.
describe('pnpm local:dev', () => {
  it('needs --config: exit 2 with USAGE, nothing started', async () => {
    const { code, stdout } = await run(['dev'], {}, monorepoMain)
    expect(code).toBe(2)
    expect(JSON.parse(stdout)).toEqual({ ok: false, error: { code: 'USAGE', message: 'local:dev needs --config <site>/ginko.config.ts.' } })
  })
})
