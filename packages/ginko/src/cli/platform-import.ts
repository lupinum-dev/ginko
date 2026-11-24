// `ginko-platform import <folder> --site <slug> [--prod]`: loads an export folder (from `ginko files-export` or
// `ginko export`) into a site of this platform that has no content yet. Run in the platform project. The target is the
// local backend of `ginko-platform dev`, or with `--prod` the production deployment that `ginko-platform setup` made.
// Both run the same steps (importSite, empty site): the site must exist and have its schema from `ginko release`, and
// the platform refuses a site that has entries, changes or edits. Nothing here clears a site.
import { backendAt, confirmLocal, connectDeployment, connectLocal, runOnce, type Runner } from './local.ts'
import { importSite, postFile } from './import.ts'
import { CliError } from './model.ts'
import { productionDeployment, STATE_FILE } from './platform-setup.ts'

const COMMAND = 'ginko-platform import'

export interface PlatformImportInput {
  /** The platform project: the folder with convex.json. */
  cwd: string
  folder: string
  site: string
  /** The production deployment of ginko-platform.json instead of the local backend. */
  prod: boolean
  /** Wait for the imported images to be processed (default true). */
  wait?: boolean
  waitTimeoutMs?: number
  log: (line: string) => void
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  /** Tests replace the `npx convex` calls. */
  exec?: typeof runOnce
}

export async function platformImport(input: PlatformImportInput): Promise<{ entries: number; files: number }> {
  const { cwd, folder, site, prod, log, fetch = globalThis.fetch, exec = runOnce } = input
  const backendDir = backendAt(cwd, COMMAND)
  // The target is confirmed before the export is read: a wrong target stops before anything is written.
  let run: Runner
  let where: string
  if (prod) {
    const deployment = productionDeployment(backendDir)
    if (!deployment) throw new CliError(`${COMMAND} --prod stopped: ${STATE_FILE} names no production deployment. Run \`ginko-platform setup\` first. Nothing was imported.`, 'USAGE')
    run = connectDeployment(backendDir, deployment, exec)
    where = `the production deployment ${deployment}`
  } else {
    const { url } = confirmLocal(backendDir, COMMAND)
    // Without a running backend, `convex run` fails with a connection error that does not say what to do.
    if (url && !(await answers(fetch, url))) throw new CliError(`${COMMAND} stopped: the local backend does not answer at ${url}. Start it with \`npm run dev\` in another terminal, then run the import again. Nothing was imported.`, 'UNAVAILABLE')
    run = connectLocal(backendDir, COMMAND, exec)
    where = 'the local backend'
  }
  log(`Importing ${folder} into the site “${site}” on ${where}.`)
  let done: { entries: number; files: number }
  try {
    done = await importSite({
      dir: folder, run, log, empty: true, site,
      upload: (url, bytes, mime) => postFile(fetch, url, bytes, mime),
      ...(input.wait === undefined ? {} : { wait: input.wait }),
      ...(input.waitTimeoutMs === undefined ? {} : { waitTimeoutMs: input.waitTimeoutMs }),
    })
  } catch (error) {
    // The platform's refusal comes back as its raw error (in the platform's language); this one is common, so it gets a sentence.
    if (error instanceof Error && error.message.includes('errors.importNeedsEmptySite')) {
      throw new CliError(`The site “${site}” has content already (entries, changes or edits). The import takes only a site without content. Nothing was imported.`)
    }
    throw error
  }
  log(`Imported ${done.entries} entries and ${done.files} files into “${site}”. Open the site in the Studio to see them.`)
  return done
}

/** Whether anything answers HTTP at the address. */
async function answers(fetch: NonNullable<PlatformImportInput['fetch']>, url: string): Promise<boolean> {
  try {
    await fetch(new URL('/version', url).href, { signal: AbortSignal.timeout(5_000) })
    return true
  } catch {
    return false
  }
}
