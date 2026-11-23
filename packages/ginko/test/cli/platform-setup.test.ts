import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { main } from '../../src/cli/ginko-platform.ts'
import { commandLine, StepError, type Step } from '../../src/cli/platform-run.ts'
import { QUESTIONS } from '../../src/cli/platform-setup.ts'

const DEPLOY_KEY = 'prod:happy-cat-123|deploy-key-secret-value'
const RESEND_KEY = 're_resend-secret-value'

/**
 * Convex and Vercel as far as setup sees them: env values per side, the Vercel link in .vercel/, and every step that
 * ran with its stdin. `failing` makes the first step whose command line starts with it fail. `teams` are the slugs
 * `npx convex login status` lists (on stderr; setup asks the runner for it).
 */
function world(dir: string, teams = ['my-team']) {
  const convex = new Map<string, string>()
  const vercel = new Map<string, string>()
  const steps: { line: string; input?: string }[] = []
  const files: { path: string; mode: number; text: string }[] = []
  let failing: string | undefined
  const run = async (step: Step) => {
    const line = commandLine(step)
    steps.push({ line, input: step.input })
    if (failing && line.startsWith(failing)) throw new StepError(step, 'exit code 1: the service said no')
    const [command, ...args] = [step.command, ...step.args]
    const force = args.includes('--force')
    if (args[0] === 'convex' && args[1] === 'login') return `Status: Logged in\nTeams: ${teams.length} teams accessible\n${teams.map((slug) => `  - The ${slug} team (${slug})\n`).join('')}`
    if (command === 'vercel' && args[0] === 'link') {
      mkdirSync(join(dir, '.vercel'), { recursive: true })
      writeFileSync(join(dir, '.vercel', 'project.json'), '{"projectId":"prj_1","orgId":"team_1"}')
    }
    if (command === 'vercel' && args[0] === 'project' && args[1] === 'inspect') return JSON.stringify({ name: args[2], targets: { production: { alias: [`${args[2]}-team.vercel.app`] } } })
    if (command === 'vercel' && args[0] === 'env' && args[1] === 'list') return JSON.stringify({ envs: [...vercel.keys()].map((key) => ({ key, type: 'encrypted' })) })
    if (command === 'vercel' && args[0] === 'env' && args[1] === 'add') {
      if (vercel.has(args[2]!) && !force) throw new StepError(step, 'exit code 1: already exists')
      vercel.set(args[2]!, step.input!)
    }
    if (args[0] === 'convex' && args[1] === 'deployment' && args[2] === 'token') return `${DEPLOY_KEY}\n`
    // The deployment's own address, with its region in the host (the key's name alone would give the wrong host).
    if (args[0] === 'convex' && args[1] === 'function-spec') return `${JSON.stringify({ url: 'https://happy-cat-123.eu-west-1.convex.cloud', functions: [] }, null, 2)}\n`
    if (args[0] === 'convex' && args[1] === 'env' && args[2] === 'list') return [...convex.keys()].join('\n')
    if (args[0] === 'convex' && args[1] === 'env' && args[2] === 'get') return `${convex.get(args[3]!)}\n`
    if (args[0] === 'convex' && args[1] === 'env' && args[2] === 'set') {
      const path = args[args.indexOf('--from-file') + 1]!
      const text = readFileSync(path, 'utf8')
      files.push({ path, mode: statSync(path).mode & 0o777, text })
      for (const row of text.trim().split('\n')) {
        const [name, ...value] = row.split('=')
        if (convex.has(name!) && convex.get(name!) !== value.join('=') && !force) throw new StepError(step, 'exit code 1: differs')
        convex.set(name!, value.join('='))
      }
    }
    if (args[0] === 'convex' && args[1] === 'run') return '{"kid":"k1"}\n'
    return ''
  }
  return { convex, vercel, steps, files, run, fail: (prefix?: string) => { failing = prefix } }
}

let dir: string
beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), 'ginko-setup-')), 'my-cms')
  mkdirSync(dir)
  writeFileSync(join(dir, 'convex.json'), '{}')
})
afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }))

async function setup(fake: ReturnType<typeof world>, argv: string[] = [], answers?: Partial<Record<keyof typeof QUESTIONS, string>>) {
  const log: string[] = []
  const error: string[] = []
  const asked: string[] = []
  const ask = answers && (async (question: string) => {
    asked.push(question)
    const key = (Object.keys(QUESTIONS) as (keyof typeof QUESTIONS)[]).find((name) => QUESTIONS[name] === question)!
    return answers[key] ?? ''
  })
  const code = await main(['setup', ...argv], { cwd: dir, log: (line) => log.push(line), error: (line) => error.push(line), run: fake.run, env: {}, ask })
  return { code, log: log.join('\n'), error: error.join('\n'), asked }
}

const FRESH = { siteUrl: '', admin: 'admin@example.org', resendKey: RESEND_KEY, mailFrom: 'Studio <login@example.org>' }

describe('ginko-platform setup', () => {
  // Wrong behaviour caught: a step out of order (the default address read before the Vercel project exists, the
  // signing key before the functions are deployed), a missing value, or a value on the wrong side.
  it('a fresh run: these commands in this order, every value on both sides, no secret in any argument or output', async () => {
    const fake = world(dir)
    const result = await setup(fake, [], FRESH)
    expect(result.error).toBe('')
    expect(result.code).toBe(0)
    const file = fake.files[0]!
    expect(fake.steps.map((step) => step.line)).toEqual([
      'npx convex login status',
      'vercel whoami',
      'vercel project create my-cms',
      'vercel link --yes --project my-cms',
      'vercel project inspect my-cms --format json',
      'npx convex project create my-cms --team my-team',
      'npx convex deployment create my-team:my-cms:production --type prod --default',
      'npx convex function-spec --deployment my-team:my-cms:prod',
      'npx convex deployment token create ginko-platform-vercel --deployment my-team:my-cms:prod',
      `npx convex env set --from-file ${file.path} --deployment my-team:my-cms:prod`,
      'vercel env add CONVEX_DEPLOY_KEY production --sensitive',
      'vercel env add BCN_AUTH_PROXY_IP_SECRET production --sensitive',
      'vercel env add NUXT_PUBLIC_CONVEX_URL production --no-sensitive',
      'vercel env add NUXT_PUBLIC_CONVEX_SITE_URL production --no-sensitive',
      'vercel env add CONVEX_SITE_URL production --no-sensitive',
      'vercel env add SITE_URL production --no-sensitive',
      'vercel env add BCN_AUTH_TRUSTED_CLIENT_IP_HEADER production --no-sensitive',
      'vercel deploy --prod --yes',
      "npx convex run auth:ensureSigningKey '{}' --deployment my-team:my-cms:prod",
    ])
    expect(Object.fromEntries(fake.convex)).toMatchObject({
      SITE_URL: 'https://my-cms-team.vercel.app',
      GINKO_ADMIN_EMAILS: 'admin@example.org',
      GINKO_MAIL: 'resend',
      GINKO_MAIL_FROM: 'Studio <login@example.org>',
      RESEND_API_KEY: RESEND_KEY,
    })
    expect(fake.convex.get('BETTER_AUTH_SECRETS')).toMatch(/^1:\S{40,}$/)
    expect(Object.fromEntries(fake.vercel)).toEqual({
      CONVEX_DEPLOY_KEY: DEPLOY_KEY,
      // Wrong behaviour caught: different proxy secrets on the two sides, and every sign-in fails with 403.
      BCN_AUTH_PROXY_IP_SECRET: fake.convex.get('BCN_AUTH_PROXY_IP_SECRET'),
      NUXT_PUBLIC_CONVEX_URL: 'https://happy-cat-123.eu-west-1.convex.cloud',
      NUXT_PUBLIC_CONVEX_SITE_URL: 'https://happy-cat-123.eu-west-1.convex.site',
      CONVEX_SITE_URL: 'https://happy-cat-123.eu-west-1.convex.site',
      SITE_URL: 'https://my-cms-team.vercel.app',
      BCN_AUTH_TRUSTED_CLIENT_IP_HEADER: 'x-real-ip',
    })
    // The temp file: readable by its owner only, and gone afterwards.
    expect(file.mode).toBe(0o600)
    expect(existsSync(file.path)).toBe(false)
    // Wrong behaviour caught: a secret in a command line (visible in `ps` and shell history) or in the output.
    const secrets = [DEPLOY_KEY, RESEND_KEY, fake.convex.get('BETTER_AUTH_SECRETS')!, fake.convex.get('BCN_AUTH_PROXY_IP_SECRET')!]
    const seen = [...fake.steps.map((step) => step.line), result.log, result.error].join('\n')
    for (const value of secrets) expect(seen).not.toContain(value)
    expect(result.log).toContain('The Studio runs on https://my-cms-team.vercel.app')
    // Wrong behaviour caught: the backend addresses are guessed and the person has nothing to compare with the dashboard.
    expect(result.log).toContain('The backend: https://happy-cat-123.eu-west-1.convex.cloud (HTTP actions: https://happy-cat-123.eu-west-1.convex.site).')
    expect(JSON.parse(readFileSync(join(dir, 'ginko-platform.json'), 'utf8'))).toEqual({
      created: { vercelProject: 'my-cms', convexProject: 'my-cms', deployment: 'my-team:my-cms:prod' },
      convex: { deployment: 'my-team:my-cms:prod', url: 'https://happy-cat-123.eu-west-1.convex.cloud', siteUrl: 'https://happy-cat-123.eu-west-1.convex.site' },
      siteUrl: 'https://my-cms-team.vercel.app',
      deployed: true,
    })
  })

  // Wrong behaviour caught: a second run rotates BETTER_AUTH_SECRETS (everyone is signed out) or the deploy key, or asks
  // again for what the backend has.
  it('a second run sets nothing again, rotates no secret, asks only for the address and deploys nothing', async () => {
    const fake = world(dir)
    await setup(fake, [], FRESH)
    const before = { convex: Object.fromEntries(fake.convex), vercel: Object.fromEntries(fake.vercel) }
    fake.steps.length = 0
    const result = await setup(fake, [], {})
    expect(result.code).toBe(0)
    expect(result.asked).toEqual([QUESTIONS.siteUrl])
    expect(fake.steps.map((step) => step.line)).toEqual([
      'npx convex login status',
      'vercel whoami',
      'npx convex env list --names-only --deployment my-team:my-cms:prod',
      'npx convex env get SITE_URL --deployment my-team:my-cms:prod',
      'vercel env list production --format json',
    ])
    expect({ convex: Object.fromEntries(fake.convex), vercel: Object.fromEntries(fake.vercel) }).toEqual(before)
    expect(result.log).toContain('Nothing changed, so nothing was deployed.')
  })

  // Wrong behaviour caught: the new address on one side only, and sign-in fails; or the change replaces secrets too.
  it('a changed address changes SITE_URL on both sides and deploys again, nothing else', async () => {
    const fake = world(dir)
    await setup(fake, [], FRESH)
    const secrets = [fake.convex.get('BETTER_AUTH_SECRETS'), fake.convex.get('BCN_AUTH_PROXY_IP_SECRET'), fake.vercel.get('CONVEX_DEPLOY_KEY')]
    fake.steps.length = 0
    fake.files.length = 0
    const result = await setup(fake, ['--site-url', 'https://cms.example.org/'])
    expect(result.code).toBe(0)
    expect(fake.files.map((file) => file.text)).toEqual(['SITE_URL=https://cms.example.org\n'])
    expect(fake.steps.map((step) => step.line)).toContain('vercel env add SITE_URL production --no-sensitive --force')
    expect(fake.steps.map((step) => step.line)).toContain('vercel deploy --prod --yes')
    expect(fake.steps.filter((step) => step.line.startsWith('vercel env add'))).toHaveLength(1)
    expect(fake.convex.get('SITE_URL')).toBe('https://cms.example.org')
    expect(fake.vercel.get('SITE_URL')).toBe('https://cms.example.org')
    expect([fake.convex.get('BETTER_AUTH_SECRETS'), fake.convex.get('BCN_AUTH_PROXY_IP_SECRET'), fake.vercel.get('CONVEX_DEPLOY_KEY')]).toEqual(secrets)
  })

  // Wrong behaviour caught: a failure that hides what was done, gives no command to continue, exits 0, or leaves the
  // file with the secrets in the temp folder.
  it('a failing step stops, names what was done and the failed command, exits 1 and leaves no temp file', async () => {
    const fake = world(dir)
    fake.fail('npx convex env set')
    const result = await setup(fake, [], FRESH)
    expect(result.code).toBe(1)
    expect(result.error).toContain('Setup stopped at step 10: Set SITE_URL, BETTER_AUTH_SECRETS')
    expect(result.error).toContain('Done before it: Check the Convex login; Check the Vercel login; Create the Vercel project my-cms;')
    expect(result.error).toMatch(/\n {2}npx convex env set --from-file \S+values\.env --deployment my-team:my-cms:prod\n/)
    expect(fake.steps.at(-1)!.line).toMatch(/^npx convex env set/)
    const path = /--from-file (\S+)/.exec(fake.steps.at(-1)!.line)![1]!
    expect(existsSync(path)).toBe(false)
    for (const value of [DEPLOY_KEY, RESEND_KEY]) expect(result.error + result.log).not.toContain(value)
    // A second run continues: the projects are not created again.
    fake.fail(undefined)
    fake.steps.length = 0
    const again = await setup(fake, [], FRESH)
    expect(again.code).toBe(0)
    expect(fake.steps.map((step) => step.line).filter((line) => line.includes('create'))).toEqual(['npx convex deployment token create ginko-platform-vercel --deployment my-team:my-cms:prod'])
  })

  // Wrong behaviour caught: "run setup again to continue from here" creates the project a second time (Convex and
  // Vercel refuse a taken name, or a second project appears) after a creation step half-way through failed.
  it.each([
    ['Create its production deployment', 'npx convex deployment create', ['npx convex project create my-cms --team my-team']],
    ['Link this folder to it', 'vercel link', ['vercel project create my-cms']],
  ])('a failure at "%s": the second run creates nothing twice and finishes', async (title, failing, once) => {
    const fake = world(dir)
    fake.fail(failing)
    const first = await setup(fake, [], FRESH)
    expect(first.code).toBe(1)
    expect(first.error).toContain(`: ${title}.`)
    fake.fail(undefined)
    const second = await setup(fake, [], FRESH)
    expect(second.code).toBe(0)
    const lines = fake.steps.map((step) => step.line)
    for (const line of once) expect(lines.filter((ran) => ran === line)).toHaveLength(1)
    expect(lines.at(-1)).toBe("npx convex run auth:ensureSigningKey '{}' --deployment my-team:my-cms:prod")
  })

  // Wrong behaviour caught: --dry-run creates a project, writes a file, or asks for the Resend key.
  it('--dry-run runs nothing, asks nothing, writes nothing, and prints every step with secrets hidden', async () => {
    const fake = world(dir)
    const result = await setup(fake, ['--dry-run', '--project', 'ginko-setup-test', '--team', 'lupinum'], FRESH)
    expect(result.code).toBe(0)
    expect(fake.steps).toEqual([])
    expect(result.asked).toEqual([])
    expect(readdirSync(dir)).toEqual(['convex.json'])
    expect(result.log).toContain('npx convex deployment create lupinum:ginko-setup-test:production --type prod --default')
    expect(result.log).toContain('vercel env add CONVEX_DEPLOY_KEY production --sensitive < <hidden>')
    expect(result.log).toContain('   RESEND_API_KEY=<hidden>')
    expect(result.log).toContain('npx convex function-spec --deployment lupinum:ginko-setup-test:prod')
    expect(result.log).toContain('The backend: https://<deployment>.convex.cloud (HTTP actions: https://<deployment>.convex.site).')
  })

  // Wrong behaviour caught: with several teams, setup picks one of them, or builds `project:prod`, which `deployment
  // create` refuses and which other commands resolve in the team of the folder's selected project.
  it('without --team, the only team of the account; with several, it stops and names them before anything is created', async () => {
    const one = world(dir)
    expect((await setup(one, [], FRESH)).code).toBe(0)
    expect(one.steps.find((step) => step.line.startsWith('npx convex deployment create'))!.line).toBe('npx convex deployment create my-team:my-cms:production --type prod --default')
    rmSync(join(dir, 'ginko-platform.json'))
    rmSync(join(dir, '.vercel'), { recursive: true })
    const several = world(dir, ['lupinum', 'romi'])
    const result = await setup(several, [], FRESH)
    expect(result.code).toBe(2)
    expect(result.error).toBe('The Convex account has 2 teams (lupinum, romi); run setup again with --team and one of them.')
    expect(several.steps.map((step) => step.line)).toEqual(['npx convex login status', 'vercel whoami'])
    const chosen = world(dir, ['lupinum', 'romi'])
    expect((await setup(chosen, ['--team', 'romi'], FRESH)).code).toBe(0)
    expect(chosen.steps.map((step) => step.line)).toContain('npx convex project create my-cms --team romi')
  })

  // Wrong behaviour caught: run in CI without a terminal, setup waits forever for an answer, or takes the key from argv.
  it('without a terminal a missing value stops with the option to give, before anything runs', async () => {
    const fake = world(dir)
    const result = await setup(fake, ['--admin', 'admin@example.org', '--mail-from', 'login@example.org'])
    expect(result.code).toBe(2)
    expect(result.error).toBe('Without a terminal, setup reads the Resend API key only from the environment variable RESEND_API_KEY.')
    expect(fake.steps.map((step) => step.line)).not.toContain('vercel project create my-cms')
  })
})
