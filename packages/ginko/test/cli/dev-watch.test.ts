// `ginko dev` with fake child processes: no Convex, no dev server. Only the config watcher and the pushes are real.
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async (original) => ({ ...(await original<typeof import('node:child_process')>()), spawn }))
vi.mock('../../src/cli/local.ts', async (original) => ({ ...(await original<typeof import('../../src/cli/local.ts')>()), runOnce: vi.fn() }))

const { runDev } = await import('../../src/cli/dev.ts')
const { runOnce } = await import('../../src/cli/local.ts')

const CORE = pathToFileURL(join(import.meta.dirname, '../../src/core/index.ts')).href
const config = (extra = '') => `import { collection, defineSite, f } from '${CORE}'
export default defineSite({
  site: 'demo', name: 'Demo', url: 'https://demo.example', timezone: 'Europe/Vienna',
  locales: ['de', 'en'], currency: 'EUR', pages: { home: { de: '/', en: '/en' } },
  bricks: { menu: collection({ label: 'Karte', fields: { name: f.text('Name', { max: 120 })${extra} }, max: 20, order: 'manual' }) },
})
`
const withField = (name: string) => config(`, ${name}: f.text('${name}', { optional: true })`)

interface Push { fields: string[]; finish: () => void }

let dir: string
let configPath: string
let pushes: Push[]
let running: number
let maxRunning: number
let lines: string[]
let finished: Promise<number> | undefined

/** `convex run` is gated: the test decides when each push ends. */
function fakeConvex() {
  vi.mocked(runOnce).mockImplementation(async (_command, args) => {
    if (args[1] !== 'run') return ''
    const schema = JSON.parse(args[3]!).schema as { bricks: { menu: { fields: Record<string, unknown> } } }
    running++
    maxRunning = Math.max(maxRunning, running)
    await new Promise<void>((done) => { pushes.push({ fields: Object.keys(schema.bricks.menu.fields), finish: done }) })
    running--
    return JSON.stringify({ schemaRev: pushes.length, warnings: [] })
  })
  spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, pid: undefined })
    setImmediate(() => child.stdout.write('Convex functions ready!\n'))
    return child
  })
}

// File events and child processes are slow when the whole suite runs in parallel: allow 15 s per wait.
async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error(`timeout waiting for ${what}; log:\n${lines.join('\n')}`)
}
const settle = () => new Promise((done) => setTimeout(done, 600))

const atomicSave = (source: string) => {
  writeFileSync(`${configPath}.tmp`, source)
  renameSync(`${configPath}.tmp`, configPath)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ginko-dev-'))
  mkdirSync(join(dir, 'apps/platform'), { recursive: true })
  writeFileSync(join(dir, 'apps/platform/package.json'), '{"name":"@ginko/platform"}\n')
  mkdirSync(join(dir, 'sites/demo'), { recursive: true })
  configPath = join(dir, 'sites/demo/ginko.config.ts')
  writeFileSync(configPath, config())
  pushes = []
  running = 0
  maxRunning = 0
  lines = []
  vi.stubEnv('CONVEX_DEPLOYMENT', 'anonymous-test')
  fakeConvex()
})

const start = () => { finished = runDev({ configPath, log: (line) => lines.push(line) }) }

afterEach(async () => {
  process.emit('SIGINT')
  for (const push of pushes) push.finish()
  await finished
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('ginko dev watches the config', { timeout: 60_000 }, () => {
  it('a save during the first push is pushed afterwards', async () => {
    start()
    await waitFor(() => pushes.length === 1, 'first push')
    writeFileSync(configPath, withField('startup'))
    await settle()
    pushes[0]!.finish()
    await waitFor(() => pushes.length === 2, 'second push')
    expect(pushes[1]!.fields).toEqual(['name', 'startup'])
  })

  it('keeps watching after saves by temp file and rename', async () => {
    start()
    await waitFor(() => pushes.length === 1, 'first push')
    pushes[0]!.finish()
    await waitFor(() => lines.some((l) => l.includes('ginko dev is running')), 'ready')
    atomicSave(withField('second'))
    await waitFor(() => pushes.length === 2, 'push after the first rename')
    pushes[1]!.finish()
    await settle()
    atomicSave(withField('third'))
    await waitFor(() => pushes.length === 3, 'push after the second rename')
    expect(pushes[2]!.fields).toEqual(['name', 'third'])
  })

  it('runs one push at a time; saves during a push give one more push with the latest content', async () => {
    start()
    await waitFor(() => pushes.length === 1, 'first push')
    pushes[0]!.finish()
    await waitFor(() => lines.some((l) => l.includes('ginko dev is running')), 'ready')
    writeFileSync(configPath, withField('alpha'))
    await waitFor(() => pushes.length === 2, 'second push')
    writeFileSync(configPath, withField('beta'))
    await settle()
    writeFileSync(configPath, withField('gamma'))
    await settle()
    expect(pushes).toHaveLength(2)
    pushes[1]!.finish()
    await waitFor(() => pushes.length === 3, 'follow-up push')
    pushes[2]!.finish()
    await settle()
    expect(pushes.map((p) => p.fields)).toEqual([['name'], ['name', 'alpha'], ['name', 'gamma']])
    expect(maxRunning).toBe(1)
  })

  it('tells that changes in imported helper files need a restart', async () => {
    start()
    await waitFor(() => pushes.length === 1, 'first push')
    pushes[0]!.finish()
    await waitFor(() => lines.some((l) => l.includes('ginko dev is running')), 'ready')
    expect(lines.join('\n')).toMatch(/imports.*restarting/)
  })
})

describe('ginko dev with another target than the local one', () => {
  it('stops before it starts any process', async () => {
    vi.stubEnv('CONVEX_DEPLOYMENT', 'dev:something-cloud')
    await expect(runDev({ configPath, log: () => undefined })).rejects.toThrow(/stopped.*dev:something-cloud/)
    expect(spawn).not.toHaveBeenCalled()
    expect(runOnce).not.toHaveBeenCalled()
  })
})
