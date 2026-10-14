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
  writeFileSync(join(root, 'ginko.config.ts'), 'export default defineSite({})')
  await new Promise((done) => setTimeout(done, 400))
  expect(calls).toEqual([[join(root, 'ginko.config.ts')]])
})
