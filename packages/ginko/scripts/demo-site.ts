// Writes src/cli/demo-site.json, the demo site that `ginko-platform dev` loads into a new local backend: the starter
// template (templates/starter) as `ginko files-export` writes it, named "Demo" (identifier `demo`). Run after a change
// to the starter's config or content (test/cli/demo.test.ts fails until then):
//   node packages/ginko/scripts/demo-site.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filesExport } from '../src/cli/files-export.ts'
import type { SiteExport } from '../src/cli/model.ts'

const STARTER = fileURLToPath(new URL('../../../templates/starter/ginko.config.ts', import.meta.url))
export const DEMO_FILE = fileURLToPath(new URL('../src/cli/demo-site.json', import.meta.url))
/** The starter's site address comes from these when they are set (site-url.ts); the demo keeps its fallback. */
const ADDRESS_ENV = ['NUXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL'] as const

/** The demo export as JSON text, the same on every machine (fixed export time, no address from the environment). */
export async function demoSource(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ginko-demo-'))
  const saved = ADDRESS_ENV.map((name) => [name, process.env[name]] as const)
  for (const name of ADDRESS_ENV) delete process.env[name]
  try {
    await filesExport({ config: STARTER, dir: join(dir, 'out'), log: () => undefined })
    const data = JSON.parse(await readFile(join(dir, 'out', 'export.json'), 'utf8')) as SiteExport
    // The demo ships inside @lupinum/ginko as one JSON file; image bytes would make the package large.
    if (data.files.length > 0) throw new Error('templates/starter now uses images; the bundled demo takes none. Change scripts/demo-site.ts first.')
    const demo: SiteExport = { ...data, site: 'demo', name: 'Demo', schema: { ...data.schema, site: 'demo', name: 'Demo' }, exportedAt: '2026-01-01T00:00:00.000Z' }
    return `${JSON.stringify(demo, null, 2)}\n`
  } finally {
    for (const [name, value] of saved) if (value !== undefined) process.env[name] = value
    await rm(dir, { recursive: true, force: true })
  }
}

if (process.argv[1]?.endsWith('demo-site.ts')) {
  await writeFile(DEMO_FILE, await demoSource())
}
