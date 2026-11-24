import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { platformImport } from '../../src/cli/platform-import.ts'
import { convex, fetch, project, tempDir } from './convex-fake.ts'

/** An export folder with one single entry and no files. */
function exportFolder() {
  const dir = tempDir()
  writeFileSync(join(dir, 'export.json'), JSON.stringify({
    format: 1, site: 'linde', name: 'Linde',
    schema: { site: 'linde', name: 'Linde', locales: ['de'], bricks: { page: { kind: 'single', label: 'Seite', fields: { title: { type: 'text', label: 'Titel' } } } } },
    schemaRev: 1, contentRev: 1, exportedAt: '2026-10-11T00:00:00.000Z',
    entries: [{ id: 'page', brick: 'page', kind: 'single', order: 0, data: { title: { de: 'Willkommen' } }, prints: {}, rev: 1 }],
    folders: [], files: [],
  }))
  return dir
}
const released = { 'seed:importStatus': { bricks: ['page'] } }
const input = (cwd: string, prod: boolean, extra = {}) => ({ cwd, folder: exportFolder(), site: 'my-site', prod, log: () => undefined, fetch, ...extra })

describe('ginko-platform import', () => {
  // Wrong behaviour caught: the public import replaces the content of a site (devPush, importClear) instead of filling
  // an empty one, so a second run or a wrong identifier deletes someone's work.
  it('local: fills an empty site that has the released schema; it never pushes a schema or clears', async () => {
    const { exec, functions } = convex(released)
    expect(await platformImport(input(project(), false, { exec }))).toEqual({ entries: 1, files: 0 })
    expect(functions()).toEqual(expect.arrayContaining(['seed:importStatus', 'seed:importOpen', 'seed:importBatch', 'seed:importDone']))
    expect(functions()).not.toContain('release:devPush')
    expect(functions()).not.toContain('seed:importClear')
  })

  // Wrong behaviour caught: a second run or a site with content shows the platform's raw German error.
  it('a site with content: one English sentence, nothing imported', async () => {
    const { exec, functions } = convex(released)
    const refusing = async (command: string, args: string[]) => {
      if (args.includes('seed:importOpen')) throw new Error('npx convex run exited with code 1: Uncaught ConvexError: {"code":"INVALID","message":"Nur eine leere Seite …","key":"errors.importNeedsEmptySite"}')
      return exec(command, args)
    }
    await expect(platformImport(input(project(), false, { exec: refusing }))).rejects.toThrow('The site “my-site” has content already (entries, changes or edits). The import takes only a site without content. Nothing was imported.')
    expect(functions()).not.toContain('seed:importBatch')
  })

  // Wrong behaviour caught: --prod writes to whatever deployment the Convex CLI selects (.env.local or the login's default).
  it('--prod: every call names the deployment of ginko-platform.json', async () => {
    const dir = project()
    writeFileSync(join(dir, 'ginko-platform.json'), JSON.stringify({ convex: { deployment: 'acme:my-cms:prod', url: 'https://a.convex.cloud', siteUrl: 'https://a.convex.site' } }))
    const { exec, calls } = convex(released)
    await platformImport(input(dir, true, { exec }))
    expect(calls.length).toBeGreaterThan(0)
    for (const args of calls) expect(args.slice(0, 4)).toEqual(['convex', 'run', '--deployment', 'acme:my-cms:prod'])
  })

  // Wrong behaviour caught: before setup, --prod falls back to some other deployment instead of stopping.
  it('--prod before setup: a usage error, no call', async () => {
    const { exec, calls } = convex(released)
    await expect(platformImport(input(project(), true, { exec }))).rejects.toMatchObject({ code: 'USAGE' })
    expect(calls).toEqual([])
  })

  // Wrong behaviour caught: without --prod, a cloud deployment selected in .env.local receives the import.
  it('local with a cloud target in .env.local: refused before any call', async () => {
    const { exec, calls } = convex(released)
    await expect(platformImport(input(project('prod:happy-otter-123'), false, { exec }))).rejects.toThrow(/not the local backend/)
    expect(calls).toEqual([])
  })

  // Wrong behaviour caught: with `npm run dev` stopped, the person gets a raw connection error from the Convex CLI.
  it('local with no backend running: says to start it, no call', async () => {
    const { exec, calls } = convex(released)
    const refused = async () => { throw new TypeError('fetch failed') }
    await expect(platformImport(input(project(), false, { exec, fetch: refused }))).rejects.toThrow(/does not answer at http:\/\/127\.0\.0\.1:3210\. Start it with `npm run dev`/)
    expect(calls).toEqual([])
  })
})
