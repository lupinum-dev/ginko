// `ginko-platform build`: the build of a platform project, and of apps/platform (its vercel.json), so a fix reaches every
// platform project with a version bump and the hosted platform with the same commit. A production build deploys the
// Convex functions before it builds the Studio, so the Studio never ships ahead of its backend; a failed deploy fails
// the build and the previous release stays.
// Then it starts the data migrations the new backend brings (one line in the log); they run in the background.
import { parseOutput } from './local.ts'
import { CliError } from './model.ts'
import type { CommandRunner } from './platform-run.ts'

/**
 * `convex run` with only CONVEX_DEPLOY_KEY set, as the Vercel build passes it. `--prod` with a production deploy key
 * alone works: confirmed by a real build on 2026-11-23 (a Vercel production build of a platform project, with the key
 * from `convex deployment token create`, which also has the rights `convex deploy` needs).
 */
export const RUN_ON_PRODUCTION = ['--prod']

export type BuildDecision =
  | { deploy: true }
  | { deploy: false; note: string }
  | { error: string }

const NOT_PROD_KEY = 'CONVEX_DEPLOY_KEY must be a production deploy key (it starts with "prod:"); nothing was built.'

/**
 * On Vercel (VERCEL_ENV set) only a production build deploys the backend, and it needs a production deploy key.
 * Outside Vercel, a production deploy key deploys; no key builds the Studio only. Another kind of key (a preview or
 * dev key) is refused: a deploy to an unexpected deployment is worse than a stopped build.
 */
export function decideBuild(env: NodeJS.ProcessEnv): BuildDecision {
  const key = env.CONVEX_DEPLOY_KEY ?? ''
  if (env.VERCEL_ENV) {
    if (env.VERCEL_ENV !== 'production') return { deploy: false, note: `A ${env.VERCEL_ENV} build on Vercel: only the Studio is built, the backend is not deployed.` }
    return key.startsWith('prod:') ? { deploy: true } : { error: NOT_PROD_KEY }
  }
  if (!key) return { deploy: false, note: 'No CONVEX_DEPLOY_KEY: only the Studio is built, the backend is not deployed.' }
  return key.startsWith('prod:') ? { deploy: true } : { error: NOT_PROD_KEY }
}

export interface BuildInput {
  /** The Studio's folder, where `nuxt build` runs. */
  cwd: string
  /** The Convex project (the folder with convex.json), where `convex deploy` runs. */
  convexDir: string
  env: NodeJS.ProcessEnv
  run: CommandRunner
  log: (line: string) => void
}

/** Resolves when the Studio is built; throws a CliError (exit 1) when the key is wrong or a deploy or build failed. */
export async function build({ cwd, convexDir, env, run, log }: BuildInput): Promise<void> {
  const decision = decideBuild(env)
  if ('error' in decision) throw new CliError(decision.error)
  if (!decision.deploy) log(decision.note)
  else {
    await run({ command: 'npx', args: ['convex', 'deploy'], cwd: convexDir, show: true })
    // Warn, do not fail: the new backend is live already, and a failed build would only keep the old Studio in front
    // of it. The next deploy calls runPending again.
    try {
      const line = parseOutput(await run({ command: 'npx', args: ['convex', 'run', ...RUN_ON_PRODUCTION, 'migrations:runPending'], cwd: convexDir }))
      if (typeof line === 'string') log(line)
    } catch {
      log('Warning: the data migrations could not be started. The next deploy tries again; see ops:status.')
    }
  }
  await run({ command: 'npx', args: ['nuxt', 'build'], cwd, show: true })
}
