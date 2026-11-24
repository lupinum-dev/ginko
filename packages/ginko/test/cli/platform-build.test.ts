import { describe, expect, it } from 'vitest'
import { build } from '../../src/cli/platform-build.ts'
import { commandLine, StepError, type Step } from '../../src/cli/platform-run.ts'

const DEPLOY = 'npx convex deploy'
const MIGRATE = 'npx convex run --prod migrations:runPending'
const STUDIO = 'npx nuxt build'

async function runBuild(env: Record<string, string>, failing?: string, reason = 'exit code 1') {
  const ran: string[] = []
  const log: string[] = []
  const run = async (step: Step) => {
    const line = commandLine(step)
    ran.push(line)
    if (line === failing) throw new StepError(step, reason)
    return line === MIGRATE ? 'Migrations: all 5 done.\n"Migrations: all 5 done."\n' : ''
  }
  try {
    await build({ cwd: '/studio', convexDir: '/convex', env, run, log: (line) => log.push(line) })
    return { ran, log, error: undefined }
  } catch (error) {
    return { ran, log, error: (error as Error).message }
  }
}

describe('ginko-platform build', () => {
  // Wrong behaviour caught: a preview deploys over production, a production build ships the Studio without its backend,
  // or a build without a production key deploys to some other deployment.
  it.each([
    ['Vercel production with a prod key', { VERCEL_ENV: 'production', CONVEX_DEPLOY_KEY: 'prod:happy-cat-1|x' }, [DEPLOY, MIGRATE, STUDIO], undefined],
    ['Vercel production without a key', { VERCEL_ENV: 'production' }, [] as string[], 'production deploy key'],
    ['Vercel production with a preview key', { VERCEL_ENV: 'production', CONVEX_DEPLOY_KEY: 'preview:team:proj|x' }, [] as string[], 'production deploy key'],
    ['Vercel preview with a prod key', { VERCEL_ENV: 'preview', CONVEX_DEPLOY_KEY: 'prod:happy-cat-1|x' }, [STUDIO], undefined],
    ['outside Vercel with a prod key', { CONVEX_DEPLOY_KEY: 'prod:happy-cat-1|x' }, [DEPLOY, MIGRATE, STUDIO], undefined],
    ['outside Vercel without a key', {}, [STUDIO], undefined],
    ['outside Vercel with a dev key', { CONVEX_DEPLOY_KEY: 'dev:happy-cat-1|x' }, [] as string[], 'production deploy key'],
  ])('%s', async (_name, env, commands, error) => {
    const result = await runBuild(env)
    expect(result.ran).toEqual(commands)
    if (error) expect(result.error).toContain(error)
    else expect(result.error).toBeUndefined()
    if (commands.includes(MIGRATE)) expect(result.log).toContain('Migrations: all 5 done.')
    if (commands.length === 1) expect(result.log.join('\n')).toMatch(/only the Studio is built/)
  })

  // Wrong behaviour caught: the backend is live already, and a failed migration start would keep the old Studio in front of it.
  it('a failed migration start warns and still builds the Studio', async () => {
    const result = await runBuild({ CONVEX_DEPLOY_KEY: 'prod:happy-cat-1|x' }, MIGRATE)
    expect(result.ran).toEqual([DEPLOY, MIGRATE, STUDIO])
    expect(result.error).toBeUndefined()
    expect(result.log.join('\n')).toContain('Warning: the data migrations could not be started.')
  })

  // Wrong behaviour caught: a deploy key made in the Convex dashboard without the migration right gives only the general
  // warning, so nobody learns which right to add, and the migrations never run.
  it('a deploy key without the right to run migrations is named, with both ways out, and the Studio still builds', async () => {
    const convex = 'exit code 1: ✖ You do not have permission to perform this operation (deployment:functions:runInternalMutations). | This is determined by the permissions granted to CONVEX_DEPLOY_KEY.'
    const result = await runBuild({ CONVEX_DEPLOY_KEY: 'prod:happy-cat-1|x' }, MIGRATE, convex)
    expect(result.ran).toEqual([DEPLOY, MIGRATE, STUDIO])
    expect(result.error).toBeUndefined()
    expect(result.log).toEqual(['Warning: CONVEX_DEPLOY_KEY may deploy but may not start the data migrations. The backend is deployed and the Studio builds. To fix it, make a new deploy key with the rights deployment:deploy and deployment:functions:runInternalMutations and set it as CONVEX_DEPLOY_KEY, or start them once with your own login: npx convex run --prod migrations:runPending'])
  })

  // Wrong behaviour caught: a failed backend deploy still ships the new Studio against the old backend.
  it('a failed backend deploy stops before the Studio', async () => {
    const result = await runBuild({ CONVEX_DEPLOY_KEY: 'prod:happy-cat-1|x' }, DEPLOY)
    expect(result.ran).toEqual([DEPLOY])
    expect(result.error).toContain('npx convex deploy failed')
  })
})
