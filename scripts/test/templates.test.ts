import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { type Result, sync, syncCheck, withUnrun } from '../templates.ts'
import { studioJob } from '../templates/e2e/studio.ts'
import { recoverCrashedRun, restoreBackend, studioSpecDirs } from '../templates/platform.ts'

const work = mkdtempSync(join(tmpdir(), 'templates-script-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
let n = 0

const TODAY = '2026-10-15'
/** A small repository: the fixed group at 0.4.0, a feature with a component, and one template that uses it. */
function repo(change: (files: Record<string, string>) => void = () => {}) {
  const files: Record<string, string> = {
    '.changeset/config.json': JSON.stringify({ fixed: [['@lupinum/ginko', 'create-ginko']] }),
    'packages/ginko/package.json': JSON.stringify({ name: '@lupinum/ginko', version: '0.4.0' }),
    'packages/create-ginko/package.json': JSON.stringify({ name: 'create-ginko', version: '0.4.0' }),
    'templates/_features/site/files.json': JSON.stringify(['app/components/SiteHeader.vue', 'app/lib/utils.ts', 'app/assets/css/base.css', 'content/legal/1.privacy.md']),
    'templates/_features/site/app/components/SiteHeader.vue': '<template><header /></template>\n',
    'templates/_features/site/app/lib/utils.ts': 'export const cn = () => \'\'\n',
    'templates/_features/site/app/assets/css/base.css': ':root { color: black; }\n',
    'templates/_features/site/content/legal/1.privacy.md': '---\ntitle: Privacy\n---\n',
    'templates/demo/package.json': JSON.stringify({ name: 'demo', dependencies: { '@lupinum/ginko': '^0.4.0', nuxt: '^4.6.1' }, ginko: { sampleAnchor: TODAY, features: ['site'] } }),
    // A config without imports: the check needs only its bricks.
    'templates/demo/ginko.config.ts': "export default { locales: ['en'], bricks: { events: { visible: { mode: 'until', field: 'when' }, fields: { when: { type: 'daterange' } } } } }\n",
    'templates/demo/content/events/1.fair.md': '---\nwhen:\n  from: 2027-03-01\n  to: 2027-03-02\n---\n',
  }
  change(files)
  const root = join(work, String(n++))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('templates sync', () => {
  it('copies the feature files, with a source comment in code files only, and sets the next minor range', () => {
    const root = repo()
    expect(sync(root, '0.5.0').sort()).toEqual([
      'templates/demo/app/assets/css/base.css', 'templates/demo/app/components/SiteHeader.vue', 'templates/demo/app/lib/utils.ts',
      'templates/demo/content/legal/1.privacy.md', 'templates/demo/package.json',
    ])
    const read = (path: string) => readFileSync(join(root, 'templates/demo', path), 'utf8')
    expect(read('app/components/SiteHeader.vue')).toBe('<!-- Synced from templates/_features/site/app/components/SiteHeader.vue by `pnpm templates sync`. Edit the source, not this copy. -->\n<template><header /></template>\n')
    expect(read('app/lib/utils.ts')).toMatch(/^\/\/ Synced from templates\/_features\/site\/app\/lib\/utils\.ts /)
    expect(read('app/assets/css/base.css')).toMatch(/^\/\* Synced from .* \*\/\n:root/)
    // Content carries no comment: the manifest knows where it came from.
    expect(read('content/legal/1.privacy.md')).toBe('---\ntitle: Privacy\n---\n')
    expect(JSON.parse(read('package.json')).dependencies).toEqual({ '@lupinum/ginko': '^0.5.0', nuxt: '^4.6.1' })
    expect(sync(root, '0.5.0')).toEqual([])
  })
})

describe('templates sync --check', () => {
  const synced = () => {
    const root = repo()
    sync(root, null)
    return root
  }

  it('passes right after sync', async () => {
    expect(await syncCheck(synced(), { next: null, today: TODAY })).toEqual([])
  })

  // Wrong behaviour caught: each of these reaches a user who copies the template, and the check lets it through.
  it.each([
    ['a synced file edited in the template', (root: string) => writeFileSync(join(root, 'templates/demo/app/lib/utils.ts'), 'export const cn = 1\n'), 'demo: app/lib/utils.ts differs from its source'],
    ['a synced file deleted', (root: string) => rmSync(join(root, 'templates/demo/app/components/SiteHeader.vue')), 'demo: app/components/SiteHeader.vue is missing'],
    ['a range older than the current version', (root: string) => {
      const path = join(root, 'templates/demo/package.json')
      writeFileSync(path, readFileSync(path, 'utf8').replace('^0.4.0', '^0.3.0'))
    }, 'demo: @lupinum/ginko is "^0.3.0"; expected ^0.4.0 or ^0.5.0'],
    ['a lockfile in the template', (root: string) => writeFileSync(join(root, 'templates/demo/package-lock.json'), '{}'), 'demo: package-lock.json must not be committed'],
    ['sample dates less than 90 days ahead', (root: string) => {
      const path = join(root, 'templates/demo/content/events/1.fair.md')
      writeFileSync(path, readFileSync(path, 'utf8').replace('2027-03-02', '2026-12-01').replace('2027-03-01', '2026-11-30'))
    }, 'demo: the last sample date (2026-12-01) is 47 days ahead of 2026-10-15; it must be at least 90 days ahead'],
  ])('fails on %s', async (_name, breakIt, problem) => {
    const root = synced()
    breakIt(root)
    const problems = await syncCheck(root, { next: null, today: TODAY })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(problem)
  })

  it('accepts the next minor range while the release is pending', async () => {
    const root = repo()
    sync(root, '0.5.0')
    expect(await syncCheck(root, { next: '0.5.0', today: TODAY })).toEqual([])
    expect(await syncCheck(root, { next: null, today: TODAY })).toEqual([])
  })
})

describe('test --only', () => {
  // Wrong behaviour caught: `--only 4 --mode single` or `--only 3` after a failed setup prints "0 passed, 0 failed"
  // and exits 0, though the requested gate never ran.
  const setupFailed: Result = { gate: 1, mode: 'both', check: 'create-ginko build + pack', ok: false }
  const gate3: Result = { gate: 3, mode: 'multi', check: 'e2e', ok: true }
  it.each([
    { gates: [4], modes: ['single'] as const, results: [], failed: ['gate 4 did not run: needs multi mode'] },
    { gates: [3], modes: ['single', 'multi'] as const, results: [setupFailed], failed: [undefined, 'gate 3 did not run: a setup step it needs failed'] },
    { gates: [3], modes: ['multi'] as const, results: [gate3], failed: [] },
  ])('gates $gates in $modes', ({ gates, modes, results, failed }) => {
    expect(withUnrun(results, gates, [...modes]).filter((r) => !r.ok).map((r) => r.detail)).toEqual(failed)
  })
})

describe('test --platform', () => {
  // Wrong behaviour caught: gate 7 runs the Studio specs of a feature the template does not sync (a failing job it
  // does not have), or skips the template's own folder (templates/_studio/<name>, not a feature folder of the same name), or counts a folder without a spec as a proven job.
  it('picks the Studio specs of the synced features and of the template itself', () => {
    const root = repo((files) => {
      files['templates/_features/site/e2e/studio/notice.spec.ts'] = ''
      files['templates/_features/pages/e2e/studio/page.spec.ts'] = ''
      files['templates/_features/menu/e2e/studio/dish.spec.ts'] = ''
      files['templates/_features/hours/e2e/studio/README.md'] = ''
      files['templates/_studio/demo/own.spec.ts'] = ''
      files['templates/_features/demo/e2e/studio/other.spec.ts'] = ''
    })
    expect(studioSpecDirs(root, 'demo', ['site', 'pages', 'hours'])).toEqual([
      'templates/_features/site/e2e/studio', 'templates/_features/pages/e2e/studio', 'templates/_studio/demo',
    ])
  })

  // Wrong behaviour caught: a template without the names for a shared job runs the spec on `undefined` (a page or label
  // that does not exist) and fails with an error about the page, not about the missing jobs.json entry.
  it('names the missing entry when a template does not say what its content is called', () => {
    const all = { notice: { brick: 'notice', textField: '^Text' }, page: { brick: 'pages', title: 'About' } }
    expect(studioJob(all, 'notice', ['brick', 'textField'])).toEqual({ brick: 'notice', textField: '^Text' })
    expect(() => studioJob(all, 'page', ['brick', 'title', 'path', 'bodyField'])).toThrow('"page": { "path", "bodyField" }')
    expect(() => studioJob(all, 'menu', ['brick'])).toThrow('"menu": { "brick" }')
  })

  // Wrong behaviour caught: the end of a run leaves the fresh backend of the run in the developer's folders, or loses
  // the data that was there, or invents an .env.local that was not there.
  it('puts the backend folders back as they were, and removes what the run made', () => {
    const backendDir = join(work, `backend-${n++}`)
    const aside = join(work, `aside-${n++}`)
    const put = (dir: string, path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
    put(aside, '.convex/local/data.sqlite3', 'developer data')
    put(aside, 'convex/_generated/api.js', 'original api')
    put(backendDir, '.convex/local/data.sqlite3', 'data of the run')
    put(backendDir, '.convex/local/new-file', 'made by the run')
    put(backendDir, '.env.local', 'CONVEX_DEPLOYMENT=anonymous:run')
    put(backendDir, 'convex/_generated/api.js', 'api of the run')
    put(backendDir, 'convex/schema.ts', 'kept')
    restoreBackend({ backendDir, aside, kept: ['.convex', 'convex/_generated'] })
    expect(readFileSync(join(backendDir, '.convex/local/data.sqlite3'), 'utf8')).toBe('developer data')
    expect(existsSync(join(backendDir, '.convex/local/new-file'))).toBe(false)
    expect(existsSync(join(backendDir, '.env.local'))).toBe(false)
    expect(readFileSync(join(backendDir, 'convex/_generated/api.js'), 'utf8')).toBe('original api')
    expect(readFileSync(join(backendDir, 'convex/schema.ts'), 'utf8')).toBe('kept')
    expect(existsSync(aside)).toBe(false)
  })

  // Wrong behaviour caught: after a killed run the next one leaves the old dev servers running, restores nothing, or
  // stops an unrelated process that got the recorded process id since.
  it('cleans up after a killed run, and stops only the process it started', async () => {
    const started = (pid: number) => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim()
    const sleeper = () => { const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' }); child.unref(); return child.pid! }
    const ours = sleeper()
    const reused = sleeper()
    const gone = spawnSync('true').pid // a process id that no longer runs
    const backendDir = join(work, `backend-${n++}`)
    const aside = join(work, `aside-${n++}`)
    mkdirSync(join(aside, '.convex'), { recursive: true })
    writeFileSync(join(aside, '.convex/data'), 'developer data')
    mkdirSync(join(backendDir, '.convex'), { recursive: true })
    writeFileSync(join(backendDir, '.convex/data'), 'data of the run')
    const lockFile = join(work, `lock-${n++}.json`)
    writeFileSync(lockFile, JSON.stringify({
      pid: gone, aside, backendDir, kept: ['.convex'],
      groups: [{ pid: ours, started: started(ours) }, { pid: reused, started: 'Thu Jan  1 00:00:00 1970' }],
    }))
    const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
    try {
      expect(await recoverCrashedRun(lockFile)).toBeUndefined()
      await new Promise((done) => setTimeout(done, 500))
      expect(alive(ours)).toBe(false)
      expect(alive(reused)).toBe(true)
      expect(readFileSync(join(backendDir, '.convex/data'), 'utf8')).toBe('developer data')
      expect(existsSync(lockFile)).toBe(false)
    } finally {
      for (const pid of [ours, reused]) try { process.kill(-pid, 'SIGKILL') } catch { /* gone */ }
    }
    // A run that is still going is left alone.
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, aside, backendDir, kept: [], groups: [] }))
    expect(await recoverCrashedRun(lockFile)).toContain(`(process ${process.pid}) is active`)
  })
})
