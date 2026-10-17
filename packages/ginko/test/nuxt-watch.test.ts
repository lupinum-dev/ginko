import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import { restartOnConfigChange } from '../src/nuxt/watch.ts'

const CORE = pathToFileURL(join(import.meta.dirname, '../src/core/index.ts')).href
const config = (timeZone: string) => `import { collection, defineSite, f } from '${CORE}'
export default defineSite({
  site: 'demo', name: 'Demo', url: 'https://demo.example', timeZone: '${timeZone}',
  locales: ['de'], currency: 'EUR', pages: { home: { de: '/' } },
  bricks: { menu: collection({ label: 'Karte', fields: { name: f.text('Name', { max: 120 }) }, max: 20, order: 'manual' }) },
})
`

const closers: (() => void)[] = []
afterEach(() => {
  for (const close of closers.splice(0)) close()
  vi.restoreAllMocks()
})

// macOS reports changes made in the first moments of a new folder watch late or not at all.
const watcherLive = () => new Promise((done) => setTimeout(done, 100))
// File events are slow when the whole suite runs in parallel: allow 15 s per wait.
async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 300 && !check(); i++) await new Promise((done) => setTimeout(done, 50))
  if (!check()) throw new Error(`timeout waiting for ${what}`)
}

// Wrong behaviour caught: Node keeps the ginko.config.ts that nuxt.config.ts imported, so Nuxt's in-place reload served
// the old config and a broken save showed no error. A broken save must not restart (the server keeps the last good
// version and says why); the next good save must restart the dev process so the change applies.
test('a broken save of ginko.config.ts is reported without a restart, the next good save restarts the dev server', { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'ginko-watch-'))
  const file = join(root, 'ginko.config.ts')
  writeFileSync(file, config('Europe/Vienna'))
  const hooks: Record<string, () => void> = {}
  const restarts: unknown[] = []
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  restartOnConfigChange({ hook: (name, fn) => { hooks[name] = fn }, callHook: (_name, options) => { restarts.push(options) } }, root)
  closers.push(() => hooks.close?.())
  // The dev server is up: its first build is done (a restart asked for earlier waits for it).
  hooks.ready!()
  hooks['build:done']!()
  await watcherLive()

  writeFileSync(file, config('Europe/Vienna').slice(0, 120))
  await waitFor(() => errors.mock.calls.length === 1, 'the syntax error')
  writeFileSync(file, config('Mars/Olympus'))
  await waitFor(() => errors.mock.calls.length === 2, 'the invalid time zone')
  expect(errors.mock.calls.map(([line]) => String(line).replace(/:.*/s, ''))).toEqual([
    '[ginko] ginko.config.ts has an error, the dev server keeps the last good version',
    '[ginko] ginko.config.ts has an error, the dev server keeps the last good version',
  ])
  expect(String(errors.mock.calls[1]![0])).toContain('Invalid time zone “Mars/Olympus”')
  expect(restarts).toEqual([])

  writeFileSync(file, config('Europe/Berlin'))
  await waitFor(() => restarts.length > 0, 'the restart')
  expect(restarts).toEqual([{ hard: true }])
})
