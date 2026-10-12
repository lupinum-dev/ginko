// useGinko filters collections by useGinkoToday (SPEC 8). '#imports' and '#ginko/schema' are test shims.
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test } from 'vitest'
import { BUNDLE_STATE, TODAY_STATE, useGinko } from '../src/nuxt/runtime/composables.ts'
import { resetStates, useState } from './shims/imports.ts'

const bundle = JSON.parse(readFileSync(new URL('../../../contracts/restaurant/bundle.format3.de.json', import.meta.url), 'utf8'))

beforeEach(() => resetStates())

// Break-it 9: a tab open across midnight kept "Heute sind wir ausgebucht." of the day before.
test('a list already shown drops a notice once today moves past its last day', () => {
  useState(BUNDLE_STATE).value = { de: bundle }
  useState(TODAY_STATE).value = '2026-10-08'
  const notices = useGinko('notices')
  const texts = () => (notices.value as unknown as { items: { data: { text: string } }[] }).items.map((i) => i.data.text)
  expect(texts()).toContain('Heute sind wir ausgebucht.')
  useState(TODAY_STATE).value = '2026-10-09'
  expect(texts()).not.toContain('Heute sind wir ausgebucht.')
})
