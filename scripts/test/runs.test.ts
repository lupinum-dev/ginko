import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { heavyLock, recoverCrashedRun, restoreAside, startedAt } from '../lib/runs.ts'

const work = mkdtempSync(join(tmpdir(), 'runs-script-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
let n = 0

/** A process of our own that runs until killed, in its own process group. */
const sleeper = () => { const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' }); child.unref(); return child.pid! }
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
/** A process id that no longer runs. */
const gone = () => spawnSync('true').pid

describe('heavy-run lock', () => {
  // Wrong behaviour caught: a run that was killed leaves its lock, and every later heavy run waits for it forever; or a
  // lock whose process id now belongs to another process (same id, other start time) still blocks.
  it.each([
    ['its process has ended', () => ({ pid: gone(), started: 'Thu Oct 15 21:00:00 2026' })],
    ['its process id belongs to another process now', () => { const pid = sleeper(); return { pid, started: 'Thu Jan  1 00:00:00 1970' } }],
  ])('takes over a stale lock: %s', async (_name, holder) => {
    const file = join(work, `heavy-${n++}.lock`)
    const stale = holder()
    writeFileSync(file, JSON.stringify({ ...stale, what: 'pnpm templates test starter', cwd: '/elsewhere', since: '2026-10-15T21:00:00Z' }))
    const lines: string[] = []
    try {
      const release = await heavyLock('test', { file, pollMs: 20, log: (line) => lines.push(line) })
      expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(process.pid)
      expect(lines).toEqual([`heavy-run lock: took over the lock of pnpm templates test starter (process ${stale.pid} has ended).`])
      release()
      expect(existsSync(file)).toBe(false)
    } finally {
      try { process.kill(-stale.pid, 'SIGKILL') } catch { /* gone */ }
    }
  })

  // Wrong behaviour caught: two heavy runs start at once because the second does not see the lock of a run that is
  // still going, or it waits without saying who holds the lock.
  it('waits for a live lock, says who holds it, and takes it once that run ends', async () => {
    const file = join(work, `heavy-${n++}.lock`)
    const pid = sleeper()
    writeFileSync(file, JSON.stringify({ pid, started: startedAt(pid), what: 'pnpm e2e:platform', cwd: '/other/worktree', since: '2026-10-15T21:00:00Z' }))
    const lines: string[] = []
    let taken = false
    const waiting = heavyLock('test', { file, pollMs: 20, log: (line) => lines.push(line) }).then((release) => { taken = true; return release })
    try {
      await new Promise((done) => setTimeout(done, 300))
      expect(taken).toBe(false)
      expect(lines).toEqual([`heavy-run lock: waiting for pnpm e2e:platform (process ${pid} in /other/worktree, since 2026-10-15T21:00:00Z). One heavy run at a time per machine.`])
      process.kill(-pid, 'SIGKILL')
      const release = await waiting
      expect(JSON.parse(readFileSync(file, 'utf8')).what).toBe('test')
      release()
    } finally {
      try { process.kill(-pid, 'SIGKILL') } catch { /* gone */ }
    }
  })
})

describe('platform run state', () => {
  // Wrong behaviour caught: the end of a run leaves the fresh backend of the run in the developer's folders, or loses
  // the data that was there, or invents an .env.local that was not there.
  it('puts the backend folders back as they were, and removes what the run made', () => {
    const base = join(work, `backend-${n++}`)
    const aside = join(work, `aside-${n++}`)
    const put = (dir: string, path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
    put(aside, '.convex/local/data.sqlite3', 'developer data')
    put(aside, 'convex/_generated/api.js', 'original api')
    put(base, '.convex/local/data.sqlite3', 'data of the run')
    put(base, '.convex/local/new-file', 'made by the run')
    put(base, '.env.local', 'CONVEX_DEPLOYMENT=anonymous:run')
    put(base, 'convex/_generated/api.js', 'api of the run')
    put(base, 'convex/schema.ts', 'kept')
    restoreAside({ base, aside, touched: ['.convex', '.env.local', 'convex/_generated'], kept: ['.convex', 'convex/_generated'] })
    expect(readFileSync(join(base, '.convex/local/data.sqlite3'), 'utf8')).toBe('developer data')
    expect(existsSync(join(base, '.convex/local/new-file'))).toBe(false)
    expect(existsSync(join(base, '.env.local'))).toBe(false)
    expect(readFileSync(join(base, 'convex/_generated/api.js'), 'utf8')).toBe('original api')
    expect(readFileSync(join(base, 'convex/schema.ts'), 'utf8')).toBe('kept')
    expect(existsSync(aside)).toBe(false)
  })

  // Wrong behaviour caught: after a killed run the next one leaves the old dev servers running, restores nothing, or
  // stops an unrelated process that got the recorded process id since.
  it('cleans up after a killed run, and stops only the process it started', async () => {
    const ours = sleeper()
    const reused = sleeper()
    const base = join(work, `backend-${n++}`)
    const aside = join(work, `aside-${n++}`)
    mkdirSync(join(aside, '.convex'), { recursive: true })
    writeFileSync(join(aside, '.convex/data'), 'developer data')
    mkdirSync(join(base, '.convex'), { recursive: true })
    writeFileSync(join(base, '.convex/data'), 'data of the run')
    const file = join(work, `state-${n++}.json`)
    writeFileSync(file, JSON.stringify({
      pid: gone(), started: 'Thu Oct 15 21:00:00 2026', aside, base, touched: ['.convex'], kept: ['.convex'],
      groups: [{ pid: ours, started: startedAt(ours) }, { pid: reused, started: 'Thu Jan  1 00:00:00 1970' }],
    }))
    try {
      expect(await recoverCrashedRun(file)).toBeUndefined()
      await new Promise((done) => setTimeout(done, 500))
      expect(alive(ours)).toBe(false)
      expect(alive(reused)).toBe(true)
      expect(readFileSync(join(base, '.convex/data'), 'utf8')).toBe('developer data')
      expect(existsSync(file)).toBe(false)
    } finally {
      for (const pid of [ours, reused]) try { process.kill(-pid, 'SIGKILL') } catch { /* gone */ }
    }
    // A run that is still going is left alone.
    writeFileSync(file, JSON.stringify({ pid: process.pid, started: startedAt(process.pid), aside, base, touched: [], kept: [], groups: [] }))
    expect(await recoverCrashedRun(file)).toContain(`(process ${process.pid}) is active`)
  })
})
