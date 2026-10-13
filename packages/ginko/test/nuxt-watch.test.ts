import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { configFilesToWatch } from '../src/nuxt/watch.ts'

// Wrong behaviour caught: editing ginko.config.ts during `nuxt dev` does nothing until a manual restart.
test('the existing ginko.config file is watched, a missing one is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'ginko-watch-'))
  mkdirSync(join(root, 'content'))
  expect(configFilesToWatch(root)).toEqual([])
  writeFileSync(join(root, 'ginko.config.ts'), '')
  expect(configFilesToWatch(root)).toEqual([join(root, 'ginko.config.ts')])
})
