import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_FILE, demoSource } from '../../scripts/demo-site.ts'
import { loadDemo } from '../../src/cli/demo.ts'
import { convex, fetch, project } from './convex-fake.ts'

const load = (backendDir: string, exec: ReturnType<typeof convex>['exec']) => loadDemo({ backendDir, command: 'ginko-platform dev', log: () => undefined, fetch, exec })

describe('the bundled demo site', () => {
  // Wrong behaviour caught: templates/starter changes (a field, a text) and new platform projects still get the old demo,
  // which the Studio may refuse or show with fields the starter no longer has.
  it('is templates/starter as files-export writes it; run `node packages/ginko/scripts/demo-site.ts` after a change', async () => {
    expect(await demoSource()).toBe(readFileSync(DEMO_FILE, 'utf8'))
  }, 30_000)
})

describe('loadDemo', () => {
  // Wrong behaviour caught: a new project shows an empty Studio, or the demo lands under another name than `demo`.
  it('loads the demo into a local backend without sites, then never looks again', async () => {
    const dir = project()
    const { exec, functions, calls } = convex()
    expect(await load(dir, exec)).toBe(true)
    expect(functions()).toContain('seed:importBatch')
    expect(calls.find((args) => args.includes('release:devPush'))?.at(-1)).toContain('"site":"demo"')
    const before = calls.length
    expect(await load(dir, exec)).toBe(false)
    expect(calls.length).toBe(before)
  })

  // Wrong behaviour caught: the demo is pushed into a backend that already holds the person's own sites.
  it('loads nothing when a site exists, and remembers that', async () => {
    const dir = project()
    const { exec, functions } = convex({ inline: true })
    expect(await load(dir, exec)).toBe(false)
    expect(functions()).toEqual(['inline'])
    expect(existsSync(join(dir, '.convex', 'ginko-demo'))).toBe(true)
  })

  // Wrong behaviour caught: with .env.local pointing at a cloud deployment, the demo goes into production.
  it('refuses a target that is not the local backend before any call', async () => {
    const { exec, calls } = convex()
    await expect(load(project('prod:happy-otter-123'), exec)).rejects.toThrow(/not the local backend/)
    expect(calls).toEqual([])
  })
})
