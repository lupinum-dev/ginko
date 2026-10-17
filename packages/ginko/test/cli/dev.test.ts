import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { knownTargetError, localDeploymentError, parseOutput, prepareLocalBackend } from '../../src/cli/local.ts'

describe('localDeploymentError', () => {
  it.each([
    ['anonymous deployment', { deployment: 'anonymous-agent', url: 'http://127.0.0.1:3210' }, undefined],
    ['anonymous deployment without url', { deployment: 'anonymous-agent' }, undefined],
    ['anonymous deployment as Convex 1.46 writes it', { deployment: 'anonymous:anonymous-agent' }, undefined],
    ['localhost url without deployment', { url: 'http://localhost:3210' }, undefined],
    ['cloud deployment chosen by the Convex CLI', { deployment: 'dev:review-cloud-example', url: 'https://review.convex.cloud' }, 'dev:review-cloud-example'],
    ['cloud deployment with a local-looking url', { deployment: 'dev:review-cloud-example', url: 'http://127.0.0.1:3210' }, 'dev:review-cloud-example'],
    ['nothing selected', {}, 'is not confirmed'],
    ['remote url without deployment', { url: 'https://review.convex.cloud' }, 'is not local'],
    ['unparsable url without deployment', { url: 'not a url' }, 'is not local'],
    // Astra 9: the Convex CLI prefers a deploy key over CONVEX_DEPLOYMENT, so the anonymous name proves nothing then.
    ['anonymous deployment but a deploy key is set', { deployment: 'anonymous-agent', cloudKeys: ['CONVEX_DEPLOY_KEY'] }, 'CONVEX_DEPLOY_KEY is set'],
  ])('%s', (_name, target, expected) => {
    const problem = localDeploymentError(target)
    if (expected === undefined) expect(problem).toBeUndefined()
    else expect(problem).toContain(expected)
  })
})

describe('knownTargetError (the check before `convex dev` starts)', () => {
  it.each([
    ['a fresh checkout has no target yet', {}, undefined],
    ['empty values are no target', { deployment: ' ', url: '' }, undefined],
    ['anonymous deployment', { deployment: 'anonymous-agent' }, undefined],
    ['cloud deployment', { deployment: 'dev:something-cloud' }, 'dev:something-cloud'],
    ['remote url', { url: 'https://review.convex.cloud' }, 'is not local'],
    ['a fresh checkout with a deploy key in the shell', { cloudKeys: ['CONVEX_DEPLOY_KEY'] }, 'CONVEX_DEPLOY_KEY is set'],
  ])('%s', (_name, target, expected) => {
    const problem = knownTargetError(target)
    if (expected === undefined) expect(problem).toBeUndefined()
    else expect(problem).toContain(expected)
  })
})

describe('parseOutput', () => {
  it.each([
    ['an object', '{"done":true}\n', { done: true }],
    ['a pretty-printed object after progress lines', 'Provisioning…\n{\n  "done": false\n}\n', { done: false }],
    ['a string result', '"http://127.0.0.1:3211/api/storage/upload?token=abc"\n', 'http://127.0.0.1:3211/api/storage/upload?token=abc'],
    ['a string result after progress lines', 'Provisioning…\n"http://127.0.0.1:3211/x"\n', 'http://127.0.0.1:3211/x'],
    ['no JSON', 'nothing here', undefined],
  ])('%s', (_name, output, expected) => {
    expect(parseOutput(output)).toEqual(expected)
  })
})

describe('prepareLocalBackend', () => {
  // The Convex CLI reads these from the shell first; the temp backend's .env.local must decide here.
  beforeEach(() => {
    for (const key of ['CONVEX_DEPLOYMENT', 'CONVEX_URL', 'CONVEX_DEPLOY_KEY', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_SELF_HOSTED_URL']) vi.stubEnv(key, '')
  })
  afterEach(() => { vi.unstubAllEnvs() })

  /** A backend folder with this .env.local and a fake `npx convex` (the process boundary) that records its args. */
  function backend(envLocal: string, envList = 'GINKO_LOCAL=1\n') {
    const dir = mkdtempSync(join(tmpdir(), 'ginko-backend-'))
    writeFileSync(join(dir, '.env.local'), envLocal)
    const calls: string[][] = []
    const run = async (_command: string, args: string[]) => {
      calls.push(args.slice(1))
      return args[1] === 'env' && args[2] === 'list' ? envList : ''
    }
    return { dir, calls, run }
  }

  // Wrong behaviour caught: local:dev starts a Studio where nobody can sign in (no mail way, no admin, no proxy secret).
  it('a fresh backend gets the sign-in variables and names the admin', async () => {
    const { dir, calls, run } = backend('CONVEX_DEPLOYMENT=anonymous-agent\n')
    const admin = await prepareLocalBackend(dir, 'local:dev', () => undefined, run)
    const sets = calls.filter((c) => c[0] === 'env' && c[1] === 'set')
    expect(sets.map((c) => c[2])).toEqual(['GINKO_MAIL', 'SITE_URL', 'GINKO_ADMIN_EMAILS', 'BETTER_AUTH_SECRETS', 'BCN_AUTH_PROXY_IP_SECRET'])
    expect(calls.some((c) => c.join(' ') === 'run auth:ensureSigningKey')).toBe(true)
    // The Nuxt side gets the very secret the backend got.
    const proxySecret = sets.find((c) => c[2] === 'BCN_AUTH_PROXY_IP_SECRET')![3]
    expect(readFileSync(join(dir, '.env.local'), 'utf8')).toBe(`CONVEX_DEPLOYMENT=anonymous-agent\nBCN_AUTH_PROXY_IP_SECRET=${proxySecret}\nSITE_URL=http://localhost:3100\n`)
    expect(admin).toBe('admin@example.test')
  })

  // Wrong behaviour caught: every local:dev start waits for Convex CLI calls that only repeat what `env list` showed.
  it('a prepared backend costs one env list and the signing key check, and keeps the operator\'s admin', async () => {
    const envLocal = 'CONVEX_DEPLOYMENT=anonymous-agent\nBCN_AUTH_PROXY_IP_SECRET=proxy-secret\nSITE_URL=http://localhost:3100\n'
    const envList = 'GINKO_LOCAL=1\nGINKO_MAIL=outbox\nSITE_URL=http://localhost:3100\nGINKO_ADMIN_EMAILS=owner@example.test,second@example.test\nBETTER_AUTH_SECRETS=0:abc\nBCN_AUTH_PROXY_IP_SECRET=proxy-secret\n'
    const { dir, calls, run } = backend(envLocal, envList)
    const admin = await prepareLocalBackend(dir, 'local:dev', () => undefined, run)
    expect(calls).toEqual([['env', 'list'], ['run', 'auth:ensureSigningKey']])
    expect(readFileSync(join(dir, '.env.local'), 'utf8')).toBe(envLocal)
    expect(admin).toBe('owner@example.test')
  })

  // Wrong behaviour caught: the sign-in setup writes secrets and settings into a cloud deployment.
  it.each([
    ['a cloud deployment', 'CONVEX_DEPLOYMENT=dev:review-cloud-example\n', 'dev:review-cloud-example'],
    ['a deploy key next to the anonymous deployment', 'CONVEX_DEPLOYMENT=anonymous-agent\nCONVEX_DEPLOY_KEY=prod:key\n', 'CONVEX_DEPLOY_KEY is set'],
  ])('stops before any Convex command when the target is %s', async (_name, envLocal, expected) => {
    const { dir, calls, run } = backend(envLocal)
    await expect(prepareLocalBackend(dir, 'local:dev', () => undefined, run)).rejects.toThrow(expected)
    expect(calls).toEqual([])
  })
})
