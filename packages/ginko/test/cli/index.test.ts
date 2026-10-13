import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { main } from '../../src/cli/index.ts'
import { main as monorepoMain } from '../../src/cli/monorepo.ts'
import { CliError } from '../../src/cli/model.ts'
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
  it.each<[string, string[], number, string, NodeJS.ProcessEnv?]>([
    ['no command', [], 2, 'USAGE'],
    ['unknown command', ['dev'], 2, 'USAGE'],
    ['unknown option', ['export', '--out', 'x'], 2, 'USAGE'],
    ['option of another command', ['release', '--offline'], 2, 'USAGE'],
    ['folder on a command without one', ['check', 'x'], 2, 'USAGE'],
    ['missing environment variable', ['export'], 2, 'USAGE'],
    ['invalid platform address', ['export'], 2, 'USAGE', { NUXT_PUBLIC_GINKO_PLATFORM: 'not a url', GINKO_KEY: KEY }],
    ['config that cannot be loaded', ['check', '--config', 'missing/ginko.config.ts'], 1, 'INVALID'],
  ])('%s: exit %i, one JSON line with error.code %s', async (_name, argv, exit, code, env = {}) => {
    const result = await run(argv, { env })
    expect(result.code).toBe(exit)
    expect(result.stdout.split('\n')).toEqual([expect.any(String), ''])
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: { code, message: expect.any(String) } })
    // The human text goes to stderr.
    expect(result.log.join('\n')).toContain(JSON.parse(result.stdout).error.message)
  })

  it('reads the platform from NUXT_PUBLIC_GINKO_PLATFORM when GINKO_PLATFORM is not set', async () => {
    const { stdout } = await run(['export'], { env: { NUXT_PUBLIC_GINKO_PLATFORM: 'not a url', GINKO_KEY: KEY } })
    expect(JSON.parse(stdout).error.message).toBe('GINKO_PLATFORM is not a valid URL.')
  })

  it.each([
    ['a rejected schema', new CliError('menu.allergens is missing'), 1],
    ['a platform rejection', new PlatformError('SCHEMA_REJECTED', 'no', 400), 1],
    ['an unreachable platform', new CliError('The platform is not reachable.', 'UNAVAILABLE'), 3],
    ['a server error of the platform', new PlatformError('INTERNAL', 'try later', 500), 3],
    ['a site that kept changing', new PlatformError('CHANGED_SINCE', 'changed', 409), 3],
    ['a revoked key', new PlatformError('UNAUTHORIZED', 'no key', 401), 4],
    ['a key without the scope', new PlatformError('FORBIDDEN', 'not allowed', 403), 4],
    ['a proxy that refuses access', new PlatformError('HTTP_401', 'HTTP 401', 401), 4],
    ['a key of another site', new CliError('The key belongs to the site “b”.', 'FORBIDDEN'), 4],
    ['an unexpected error', new Error('EACCES'), 1],
  ])('%s exits with %i', (_name, error, exit) => {
    expect(exitCodeOf(error)).toBe(exit)
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
