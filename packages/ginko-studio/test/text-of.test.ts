// Stored messages (history lines, stale reasons, errors, issues) show in the reader's language; anything the
// catalogs cannot translate shows the German text stored or sent with it.
import { createTranslator, type MessageTree } from '@lupinum/ginko-i18n/core'
import { compileCatalogs } from '@lupinum/ginko-i18n/compile'
import { describe, expect, it } from 'vitest'
import { textOf } from '../app/utils/textOf.ts'

const catalogs = compileCatalogs({
  de: { server: { history: { changedSingle: '{label}: {fields} geändert', undo: 'Rückgängig: {what}', revert: 'Zurück zur Version vom {when, date, ::ddMMyyyy} {when, time, ::HHmm}' }, errors: { siteNotFound: 'Diese Seite gibt es nicht.' } } },
  en: { server: { history: { changedSingle: '{label}: {fields} changed', undo: 'Undone: {what}', revert: 'Back to the version of {when, date, ::yMMMd}, {when, time, ::HHmm}' }, errors: { siteNotFound: 'This site does not exist.' } } },
})
const env = (locale: 'de' | 'en', timeZone = 'Europe/Vienna') => {
  const translator = createTranslator({ messages: catalogs[locale], fallback: catalogs.de, language: locale, timeZone: 'UTC' })
  return { t: translator.t, locale, timeZone, main: 'de' }
}

// 2026-10-08 10:00 UTC is 12:00 in Vienna and 06:00 in New York.
const at = Date.UTC(2026, 9, 8, 10)
const revert = { key: 'history.revert', params: { when: at } }
const undo = {
  sentence: 'Rückgängig: Zurück zur Version vom 08.10.2026 12:00',
  msg: { key: 'history.undo', params: { what: revert } },
}

describe('textOf', () => {
  it('translates a message with a nested message into the reader language, dates in the site zone', () => {
    expect(textOf(undo.msg, undo.sentence, env('de'))).toBe('Rückgängig: Zurück zur Version vom 08.10.2026 12:00')
    expect(textOf(undo.msg, undo.sentence, env('en'))).toBe('Undone: Back to the version of Oct 8, 2026, 12:00')
    expect(textOf(undo.msg, undo.sentence, env('en', 'America/New_York'))).toBe('Undone: Back to the version of Oct 8, 2026, 06:00')
  })

  it('takes a label param in the reader language, else the main language', () => {
    const line = { sentence: 'Speisekarte: Preis geändert', msg: { key: 'history.changedSingle', params: { label: { de: 'Speisekarte', en: 'Menu' }, fields: { de: 'Preis' } } } }
    expect(textOf(line.msg, line.sentence, env('en'))).toBe('Menu: Preis changed')
    expect(textOf(line.msg, line.sentence, env('de'))).toBe('Speisekarte: Preis geändert')
  })

  it('a row without msg shows its stored sentence', () => {
    expect(textOf(null, 'Eintrag „Saibling“ entfernt', env('en'))).toBe('Eintrag „Saibling“ entfernt')
  })

  it('a key this Studio does not know falls back to the stored sentence', () => {
    expect(textOf({ key: 'history.fromTheFuture' }, 'Etwas Neues', env('en'))).toBe('Etwas Neues')
  })

  it.each([
    ['server error', { key: 'errors.siteNotFound' }, 'This site does not exist.'],
    ['core issue', { key: 'issues.fieldMissing', params: { label: 'Title' } }, '“Title” is missing.'],
    ['key no catalog knows', { key: 'errors.fromTheFuture' }, 'Etwas Neues.'],
  ])('%s: server catalog, then core, then the German text', (_name, msg, expected) => {
    expect(textOf(msg, 'Etwas Neues.', env('en'))).toBe(expected)
  })
})
