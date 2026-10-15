// The translation state of one field in the English view of the Studio form: what the hint under the German text says.
import { describe, expect, it } from 'vitest'
import { printOf } from '@lupinum/ginko/internal'
import { leafTranslation } from '../app/utils/content'

describe('leafTranslation', () => {
  const base = { locale: 'en', main: 'de', confirmed: false }
  // Wrong behaviour caught: an optional field that is empty in German too said "Noch nicht übersetzt" in English.
  it.each([
    ['German text, no English', { de: 'Hallo' }, 'Hallo', printOf('Hallo'), 'missing'],
    ['empty in both languages', {}, undefined, undefined, 'fine'],
    ['empty German string, no English', { de: '' }, '', undefined, 'fine'],
    ['English made from the current German', { de: 'Hallo', en: 'Hello' }, 'Hallo', printOf('Hallo'), 'fine'],
    ['German changed since the translation', { de: 'Hallo!', en: 'Hello' }, 'Hallo!', printOf('Hallo'), 'stale'],
  ] as const)('%s', (_, draft, storedMain, print, expected) => {
    expect(leafTranslation({ ...base, draft, storedMain, print })).toBe(expected)
  })

  it('a confirmed translation is fine although German changed', () => {
    expect(leafTranslation({ ...base, draft: { de: 'Hallo!', en: 'Hello' }, storedMain: 'Hallo!', print: printOf('Hallo'), confirmed: true })).toBe('fine')
  })
})
