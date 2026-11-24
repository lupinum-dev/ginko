// Shared by the tests of `ginko-platform import` and the demo site: a platform project in a temp folder and a fake
// `npx convex …` that answers like the platform.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** A temp folder, removed after the test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ginko-cli-test-'))
  dirs.push(dir)
  return dir
}

/** A platform project whose .env.local selects `deployment` (the local anonymous backend by default). */
export function project(deployment = 'anonymous:anonymous-agent', url = 'http://127.0.0.1:3210'): string {
  const dir = tempDir()
  writeFileSync(join(dir, 'convex.json'), '{}')
  writeFileSync(join(dir, '.env.local'), `CONVEX_DEPLOYMENT=${deployment}\nCONVEX_URL=${url}\n`)
  return dir
}

/** The function a `convex` call runs, or `inline` for an inline query. */
const nameOf = (args: string[]) => (args.includes('--inline-query') ? 'inline' : args.find((arg) => /^[a-zA-Z]+:[a-zA-Z]+$/.test(arg)) ?? '')

/** Records each call's arguments; `answers` (by function name, `inline` for the inline query) override the defaults. */
export function convex(answers: Record<string, unknown> = {}) {
  const calls: string[][] = []
  const defaults: Record<string, unknown> = {
    inline: false,
    'seed:uploadUrl': 'http://127.0.0.1:3210/upload',
    'seed:importClear': { done: true },
    'seed:importBatch': { ids: [] },
    'seed:importRefs': { done: true },
    'release:devPush': { warnings: [] },
  }
  const exec = async (_command: string, args: string[]) => {
    calls.push(args)
    const fn = nameOf(args)
    return `${JSON.stringify(fn in answers ? answers[fn] : defaults[fn] ?? {})}\n`
  }
  return { calls, exec, functions: () => calls.map(nameOf) }
}

/** The platform's upload answer. */
export const fetch = async () => new Response(JSON.stringify({ storageId: 's1' }))
