// `ginko check`: SPEC 5.3. Steps 2–4 of the release against production, plus the budget.
// It reads the state and never writes.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SiteInput } from '../core/index.ts'
import { siteProblems } from '../core/site-keys.ts'
import type { Fetch } from '../nuxt/external-links.ts'
import { checkFileLinks } from './content-links.ts'
import { CliError } from './model.ts'
import { plan } from './plan.ts'
import type { Platform } from './platform.ts'
import { explainChanges, explainProblems, explainRejected, kib } from './report.ts'

/**
 * Prints the report and returns true when the config is valid, the content files have no broken links and a
 * release with this schema and content would go through. Without `connect` (a site of file bricks only, or
 * --offline) the release part is skipped. `connect` runs only after the local checks, and when those failed a platform
 * failure (a missing GINKO_PLATFORM, an unreachable platform) is only logged: the result stays a code problem. `root` is the folder of ginko.config.ts (content/ and public/ are below it).
 * `fetch` sends the external-link checks.
 */
export async function check(input: {
  config: SiteInput
  connect: (() => Platform) | undefined
  root: string
  fetch: Fetch
  log: (line: string) => void
}): Promise<boolean> {
  // The same check as the Nuxt build, first: an invalid config fails here in CI, not later in `nuxt build`.
  const problems = siteProblems(input.config)
  if (problems.length > 0) {
    input.log('ginko.config.ts is invalid:')
    for (const problem of problems) input.log(`  ✗ ${problem}`)
    return false
  }
  const image = checkSeoImage(input.config, input.root, input.log)
  const links = await checkFileLinks({ config: input.config, root: input.root, log: input.log, fetch: input.fetch }) && image
  if (!input.connect) {
    if (links) input.log('OK: schema and links are fine.')
    return links
  }
  try {
    return await checkRelease({ config: input.config, platform: input.connect(), log: input.log }) && links
  } catch (error) {
    // A local problem needs a code fix (exit 1). A platform failure must not replace it with an exit code that says
    // a rerun helps.
    if (links) throw error
    input.log(`Skipped the comparison with production: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/** `seo.image` as a path (`/og.png`) must exist in public/: otherwise every page points its share image at a 404. Absolute URLs are not fetched. */
function checkSeoImage(config: SiteInput, root: string, log: (line: string) => void): boolean {
  const image = config.seo?.image
  if (!image || !image.startsWith('/') || image.startsWith('//')) return true
  const file = image.split(/[?#]/)[0]!
  if (existsSync(join(root, 'public', file))) return true
  log(`ginko.config.ts: seo.image "${image}" is missing. Fix: add the file public${file}, or change seo.image.`)
  return false
}

async function checkRelease(input: { config: SiteInput; platform: Platform; log: (line: string) => void }): Promise<boolean> {
  const state = await input.platform.state(input.config.site)
  if (state.site !== input.config.site) throw new CliError(`The key belongs to the site “${state.site}”, not to “${input.config.site}”.`, 'FORBIDDEN')
  const result = await plan(state, input.config)
  input.log(`Site “${state.site}”: schema version ${state.schemaRev}, content ${state.contentRev}.`)
  if (result.rejected.length > 0) {
    for (const line of explainRejected(result.rejected)) input.log(line)
    return false
  }
  if (result.changes.length > 0) {
    input.log('Allowed changes:')
    for (const line of explainChanges(result.changes)) input.log(line)
  } else {
    input.log('No schema changes.')
  }
  const candidate = result.candidate!
  const migrations = result.schema.migrations.filter((m) => !state.migrations.some((s) => s.id === m.id)
    && !state.schema.migrations.some((s) => s.id === m.id))
  if (migrations.length > 0) input.log(`New migrations: ${migrations.map((m) => m.id).join(', ')}. Writes: ${candidate.writes.length} entries.`)
  input.log(`Size: site ${kib(candidate.bytes.site)} of 4 MiB, largest entry ${kib(candidate.bytes.largest)} (limit 256 KiB).`)
  if (candidate.problems.length > 0) {
    for (const line of explainProblems(candidate.problems)) input.log(line)
    return false
  }
  input.log('OK: A release with this schema would be accepted.')
  return true
}
