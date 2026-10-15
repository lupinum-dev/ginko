// The translation state of one field in the English view of the Studio form: what the hint under the German text says.
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { printOf, serializeSchema } from '@lupinum/ginko/internal'
import { hidesUntranslated, leafTranslation } from '../app/utils/content'

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
