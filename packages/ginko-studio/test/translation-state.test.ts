// The translation state of one field in the English view of the Studio form: what the hint under the German text says.
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f, type CollectionBrick } from '@lupinum/ginko'
import { printOf, serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import { hidesUntranslated, languageLabel, leafTranslation, missingNote, pageOf, translationLines, translationNote, type StoredTranslation, type TranslationPage } from '../app/utils/content'

describe('leafTranslation', () => {
  const base = { locale: 'en', main: 'de', confirmed: false }
  // Wrong behaviour caught: an optional field that is empty in German too said "Noch nicht übersetzt" in English; the
  // first English text typed for a field said "Deutsch geändert seit Übersetzung" although nobody changed it (romi-9).
  it.each([
    ['German text, no English', { de: 'Hallo' }, 'Hallo', undefined, printOf('Hallo'), 'missing'],
    ['empty in both languages', {}, undefined, undefined, undefined, 'fine'],
    ['empty German string, no English', { de: '' }, '', undefined, undefined, 'fine'],
    ['English made from the current German', { de: 'Hallo', en: 'Hello' }, 'Hallo', 'Hello', printOf('Hallo'), 'fine'],
    ['German changed since the translation', { de: 'Hallo!', en: 'Hello' }, 'Hallo!', 'Hello', printOf('Hallo'), 'stale'],
    ['first English text typed, never translated', { de: 'Hallo', en: 'Hel' }, 'Hallo', undefined, undefined, 'fine'],
    ['outdated English text edited', { de: 'Hallo!', en: 'Hello!' }, 'Hallo!', 'Hello', printOf('Hallo'), 'fine'],
  ] as const)('%s', (_, draft, storedMain, storedForeign, print, expected) => {
    expect(leafTranslation({ ...base, draft, storedMain, storedForeign, print })).toBe(expected)
  })

  it('a confirmed translation is fine although German changed', () => {
    expect(leafTranslation({ ...base, draft: { de: 'Hallo!', en: 'Hello' }, storedMain: 'Hallo!', storedForeign: 'Hello', print: printOf('Hallo'), confirmed: true })).toBe('fine')
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

  // Wrong behaviour caught: a Spanish heading or language button reads "inglés", as the name stands inside a sentence.
  it('a language name standing alone starts with a capital in every language', () => {
    expect([languageLabel('en', 'es'), languageLabel('en', 'de'), languageLabel('de', 'en')]).toEqual(['Inglés', 'Englisch', 'German'])
  })
})

describe('the address line of a translation', () => {
  const schema = serializeSchema(defineSite({
    site: 'wirt', name: 'Wirt', url: 'https://wirt.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: {
      events: collection({
        label: 'Veranstaltungen', max: 30, order: { field: 'when', dir: 'asc' }, visible: { mode: 'until', field: 'when' },
        route: { de: '/veranstaltungen/[slug]', en: '/en/events/[slug]' },
        fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), when: f.date('Wann') },
      }),
    },
  }))
  const events = schema.bricks.events as CollectionBrick
  const entry = (when: string, extra: { state?: 'draft' | 'live'; title?: Record<string, string> } = {}) => ({
    _id: 'e1', state: extra.state, prints: { title: { en: printOf('Wildwoche') } },
    data: { title: extra.title ?? { de: 'Wildwoche', en: 'Game week' }, slug: { de: 'wildwoche', en: 'game-week' }, when },
  })
  const site = { released: true, today: '2026-10-08' }

  // Wrong behaviour caught: "Seite ansehen" links a past event or a site before its first release, which opens a 404.
  it.each([
    ['an upcoming event of a released site', entry('2026-11-20'), site, { path: '/en/events/game-week', online: true }],
    ['a past event', entry('2026-06-20'), site, { path: '/en/events/game-week', online: false }],
    ['a draft', entry('2026-11-20', { state: 'draft' }), site, { path: '/en/events/game-week', online: false }],
    ['a site that was never released', entry('2026-11-20'), { ...site, released: false }, { path: '/en/events/game-week', online: false }],
    ['an event not translated yet', entry('2026-11-20', { title: { de: 'Wildwoche' } }), site, undefined],
  ])('%s', (_, stored, where, page) => {
    expect(pageOf(schema, 'events', events, stored, 'en', where)).toEqual(page)
  })
})

describe('hidesUntranslated', () => {
  const fields = {
    title: f.text('Titel'),
    slug: f.slug('Adresse', { from: 'title' }),
    note: f.text('Hinweis', { optional: true }),
    image: f.image('Bild', { optional: true }),
    program: f.list('Programm', { itemLabel: 'Punkt', max: 10, fields: { what: f.text('Was'), extra: f.text('Zusatz', { optional: true }) } }),
  }
  const { bricks } = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: {
      events: collection({ label: 'Veranstaltungen', max: 30, order: 'manual', fields, route: { de: '/termine/[slug]', en: '/en/events/[slug]' } }),
      notices: collection({ label: 'Hinweise', max: 30, order: 'manual', fields: { title: f.text('Text') } }),
    },
  }))
  // Wrong behaviour caught (WS-8): the hint under an English event title said the website shows the German text, while
  // the English site leaves the event out until its required texts are translated.
  it.each([
    ['required title of a page', 'events', 'title', true],
    ['optional text of a page', 'events', 'note', false],
    ['the web address', 'events', 'slug', false],
    ['an image description', 'events', 'image.alt', false],
    ['required column in a list of a page', 'events', 'program.r1.what', true],
    ['optional column in a list of a page', 'events', 'program.r1.extra', false],
    ['required text of a collection without pages', 'notices', 'title', false],
  ] as const)('%s', (_, brick, leaf, expected) => {
    expect(hidesUntranslated(bricks[brick]!, leaf)).toBe(expected)
  })
})
