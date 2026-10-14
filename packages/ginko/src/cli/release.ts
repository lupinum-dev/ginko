// `ginko release`: SPEC 5.1 steps 1–6. Pure with respect to the outside world: git, the platform,
// the clock and the log are injected. index.ts wires the real ones.
import type { SiteInput } from '../core/index.ts'
import { CliError } from './model.ts'
import { explainProblems, explainRejected } from './report.ts'
import { plan } from './plan.ts'
import { type Platform, PlatformError } from './platform.ts'

export type ReleaseOutcome =
  | { deploy: false; reason: 'superseded' }
  | { deploy: true; schemaRev: number; contentRev: number }

export interface ReleaseInput {
  config: SiteInput
  /** The commit this CI run builds (GINKO_COMMIT or GITHUB_SHA). */
  commit: string
  platform: Platform
  /** Head commit of the release branch on the remote (GINKO_BRANCH on GINKO_REMOTE, default origin/main). */
  branchHead: () => Promise<string>
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

/** SPEC 5.1 step 5: waits before the 1st to 5th retry. Six tries in all. */
export const RETRY_WAITS_MS = [2_000, 4_000, 8_000, 16_000, 32_000] as const

export async function release(input: ReleaseInput): Promise<ReleaseOutcome> {
  const site = input.config.site
  for (let attempt = 0; ; attempt++) {
    // 1. Only the newest commit of the release branch may release. The caller checks before the first try
    // (index.ts, before it loads the config); a retry checks again, as a newer commit may have arrived while waiting.
    if (attempt > 0 && (await input.branchHead()) !== input.commit) return { deploy: false, reason: 'superseded' }

    // 2–4. State, diff, candidate. Anything rejected stops here, before the platform is asked.
    const state = await input.platform.state(site)
    if (state.site !== site) throw new CliError(`The key belongs to the site “${state.site}”, not to “${site}”.`, 'FORBIDDEN')
    const result = await plan(state, input.config)
    if (result.rejected.length > 0) throw new CliError(explainRejected(result.rejected).join('\n'))
    if (!result.candidate) throw new Error('Internal error: candidate is missing.')
    if (result.candidate.problems.length > 0) throw new CliError(explainProblems(result.candidate.problems).join('\n'))

    // 5. The platform checks again and writes in one transaction.
    try {
      const answer = await input.platform.release({
        site,
        commit: input.commit,
        expectedSchemaRev: state.schemaRev,
        expectedContentRev: state.contentRev,
        schema: result.candidate.schema,
        writes: result.candidate.writes,
      })
      return { deploy: true, ...answer }
    } catch (error) {
      if (error instanceof PlatformError && error.code === 'CHANGED_SINCE' && attempt < RETRY_WAITS_MS.length) {
        const wait = RETRY_WAITS_MS[attempt]!
        input.log(`The site changed during the release. Retrying in ${wait / 1000} s.`)
        await input.sleep(wait)
        continue
      }
      throw error
    }
  }
}
