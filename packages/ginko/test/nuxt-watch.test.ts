import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { configFilesToWatch, keepConfigWatchedAcrossFailures } from '../src/nuxt/watch.ts'

// Wrong behaviour caught: editing ginko.config.ts during `nuxt dev` does nothing until a manual restart.
test('the existing ginko.config file is watched, a missing one is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'ginko-watch-'))
  mkdirSync(join(root, 'content'))
  expect(configFilesToWatch(root)).toEqual([])
  writeFileSync(join(root, 'ginko.config.ts'), '')
  expect(configFilesToWatch(root)).toEqual([join(root, 'ginko.config.ts')])
})

// macOS reports changes made in the first moments of a new folder watch late or not at all.
const watcherLive = () => new Promise((done) => setTimeout(done, 100))

afterEach(() => {
  globalThis.__ginkoConfigWatch?.watcher?.close()
  globalThis.__ginkoConfigWatch = undefined
})

// Wrong behaviour caught: after a save that broke the config, the fixed save reaches nobody and the dev server keeps
// answering 500 until a manual restart.
test('after a failed load, saving ginko.config.ts asks for a restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ginko-watch-'))
  writeFileSync(join(root, 'ginko.config.ts'), 'export default broken(')
  // The Nuxt instance's hooks: only the lifecycle the watcher listens to.
  const hooks: Record<string, () => void> = {}
  const calls: string[][] = []
  keepConfigWatchedAcrossFailures({ hook: (name, fn) => { hooks[name] = fn } }, root, (file) => { calls.push([file]) })
  hooks.ready!()
  hooks.close!() // the reload after the broken save failed: no instance is up
  await watcherLive()
  writeFileSync(join(root, 'ginko.config.ts'), 'export default defineSite({})')
  await new Promise((done) => setTimeout(done, 400))
  expect(calls).toEqual([[join(root, 'ginko.config.ts')]])
})

// Wrong behaviour caught: every healthy save restarts the whole fork on top of Nuxt's own reload, and a save that
// breaks the config starts a fork that fails before this watcher exists, so the fixed save again reaches nobody.
test('a save while healthy does not ask for a restart when Nuxt closes the instance for its own reload', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ginko-watch-'))
  writeFileSync(join(root, 'ginko.config.ts'), 'export default defineSite({})')
  const hooks: Record<string, () => void> = {}
  const calls: string[][] = []
  keepConfigWatchedAcrossFailures({ hook: (name, fn) => { hooks[name] = fn } }, root, (file) => { calls.push([file]) })
  hooks.ready!()
  await watcherLive()
  writeFileSync(join(root, 'ginko.config.ts'), 'export default defineSite({ languages: [] })')
  // Nuxt reacts to the same save and closes the instance well before the watcher's 200 ms debounce ends.
  setTimeout(() => hooks.close!(), 100)
  await new Promise((done) => setTimeout(done, 400))
  expect(calls).toEqual([])
})
