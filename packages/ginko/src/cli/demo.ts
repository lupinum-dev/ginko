// The demo site of a new platform project. On the first `ginko-platform dev` whose local backend has no site, it loads
// demo-site.json (the starter template as `ginko files-export` writes it, made by scripts/demo-site.ts) as the site
// "Demo" (`demo`), so the Studio shows areas and entries at once. Local backend only; never when a site exists.
// After the first look, a mark in .convex/ (where the local backend keeps its data) skips the check on later starts:
// a person who deleted the demo does not get it back, and a new local backend (.convex/ removed) gets it again.
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import demo from './demo-site.json' with { type: 'json' }
import { importSite, postFile } from './import.ts'
import { confirmLocal, connectLocal, parseOutput, runOnce, targetEnv } from './local.ts'

export const DEMO_SITE = demo.site
/** Printed after the ready block when the demo was loaded. A site is deleted on its Team page ("Delete site"). */
export const DEMO_LOADED = 'Loaded a demo site. Delete it in the Studio when you do not need it: Team › Delete site.'

/** True while the backend has at least one site, also one that is being deleted. */
const ANY_SITE = '(await ctx.db.query("sites").first()) !== null'

export interface DemoInput {
  /** The platform project: the folder with convex.json and .convex/. */
  backendDir: string
  command: string
  log: (line: string) => void
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
  /** Tests replace the `npx convex` calls. */
  exec?: typeof runOnce
}

/** Loads the demo site when the local backend has no site yet. Returns whether it loaded it. */
export async function loadDemo({ backendDir, command, log, fetch = globalThis.fetch, exec = runOnce }: DemoInput): Promise<boolean> {
  const mark = join(backendDir, '.convex', 'ginko-demo')
  if (existsSync(mark)) return false
  // The local check comes before the first call: the demo never goes to a cloud deployment.
  const env = targetEnv(confirmLocal(backendDir, command))
  const hasSite = parseOutput(await exec('npx', ['convex', 'run', '--inline-query', ANY_SITE], backendDir, env))
  // An answer that is not `false` (also no answer) loads nothing: a site may exist.
  if (hasSite === true) await setMark(mark)
  if (hasSite !== false) return false
  const dir = await mkdtemp(join(tmpdir(), 'ginko-demo-'))
  try {
    await writeFile(join(dir, 'export.json'), JSON.stringify(demo))
    await importSite({ dir, run: connectLocal(backendDir, command, exec), upload: (url, bytes, mime) => postFile(fetch, url, bytes, mime), log, wait: false })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  await setMark(mark)
  return true
}

async function setMark(mark: string): Promise<void> {
  await mkdir(join(mark, '..'), { recursive: true })
  await writeFile(mark, 'The demo site was offered to this local backend. Remove this file to load it again into a backend without sites.\n')
}
