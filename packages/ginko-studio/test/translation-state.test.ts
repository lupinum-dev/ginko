// The translation state of one field in the English view of the Studio form: what the hint under the German text says.
import { describe, expect, it } from 'vitest'
import { printOf } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import { leafTranslation, missingNote, translationLines, translationNote, type StoredTranslation, type TranslationPage } from '../app/utils/content'

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

describe('what the Studio says the website shows in another language', () => {
  const { t } = useI18n()
  const names = { lang: 'Englisch', main: 'Deutsch' }
  const stored = (page: TranslationPage, blocking: string[] = [], missing = blocking, outdated: string[] = []): StoredTranslation => ({ page, blocking, missing, outdated })

  // Wrong behaviour caught: an untranslated blog post said "Die Website zeigt hier den Text auf Deutsch" while the
  // page is missing on the English site (romi-4), or a FAQ question said the page does not appear without it.
  it.each([
    ['a needed text of a page that is not online', stored('hidden', ['title']), 'title', 'Noch nicht übersetzt. Ohne diesen Text erscheint die Seite nicht auf Englisch.'],
    ['an optional text of a page that is not online', stored('hidden', ['title'], ['title', 'teaser']), 'teaser', 'Noch nicht übersetzt.'],
    ['a needed text of a page that links to its German page', stored('mainPage', ['title']), 'title', 'Noch nicht übersetzt. Ohne diesen Text erscheint die Seite nicht auf Englisch.'],
    ['a needed text of a part of a page (a FAQ question)', stored('shown', ['question']), 'question', 'Noch nicht übersetzt. Die Website zeigt hier den Text auf Deutsch.'],
    ['a draft, which is not on the website', undefined, 'title', 'Noch nicht übersetzt.'],
  ])('field note: %s', (_, state, leaf, note) => {
    expect(missingNote(state, leaf, t, names)).toBe(note)
  })

  it.each([
    ['a page that is not online', stored('hidden', ['title'], ['title'], ['body']), ['Auf Englisch ist diese Seite noch nicht online. Sie erscheint, sobald die markierten Texte übersetzt sind.']],
    ['missing and outdated texts of a shown entry', stored('shown', [], ['teaser'], ['body']), [
      'Wo eine Übersetzung fehlt, zeigt die Website auf Englisch den Text auf Deutsch.',
      'Wo der Text auf Deutsch geändert wurde, zeigt die Website auf Englisch noch die alte Übersetzung.',
    ]],
    ['a translated entry', stored('shown'), []],
    ['a draft', undefined, []],
  ])('lines under the language switch: %s', (_, state, lines) => {
    expect(translationLines(state, t, names)).toEqual(lines)
  })

  // Wrong behaviour caught: after saving a new FAQ question in German the message says only "Auf der Website in etwa
  // einer Minute", although the English site shows it in German (onboard-3); or a language is named twice.
  it('the message after a save names the languages per kind, each once by its most important kind', () => {
    const notes = [
      { locale: 'en', page: 'shown', missing: 1, outdated: 1 },
      { locale: 'fr', page: 'shown', missing: 2, outdated: 0 },
      { locale: 'it', page: 'hidden', missing: 0, outdated: 1 },
      { locale: 'es', page: 'shown', missing: 0, outdated: 1 },
    ] as const
    expect(translationNote(notes, t, 'de', 'de')).toBe([
      'Auf Italienisch erscheint die Seite erst, wenn alle nötigen Texte übersetzt sind.',
      'Auf Englisch und Französisch zeigt die Website die neuen Texte auf Deutsch, bis sie übersetzt sind.',
      'Auf Spanisch zeigt die Website noch die alte Übersetzung, bis sie angepasst ist.',
    ].join(' '))
    expect(translationNote([], t, 'de', 'de')).toBe('')
  })
})
