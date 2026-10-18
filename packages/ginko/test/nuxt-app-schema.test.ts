// The schema shipped to the browser leaves out the editors' texts. Wrong behaviour caught: a page gets other content
// from the smaller schema (a default, a list row, an order or a component prop lost with the texts), or the texts
// still reach every page's script.
import { describe, expect, test } from 'vitest'
import { applyDefaults, collection, defineComponents, defineSite, f, query, serializeSchema, single, type Bundle } from '../src/internal.ts'
import { attributeProblem } from '../src/core/markdown.ts'
import { appSchema, componentsForMarkdown } from '../src/nuxt/app-schema.ts'

const site = defineSite({
  site: 'cafe',
  name: 'Café',
  url: 'https://cafe.example',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  currency: 'EUR',
  pages: { home: { de: '/', en: '/en' } },
  bricks: {
    about: single({
      label: { de: 'Über uns', en: 'About us' },
      describe: { de: 'Wer wir sind.', en: 'Who we are.' },
      fields: {
        title: f.text({ de: 'Titel', en: 'Title' }, { hint: { de: 'Kurz halten.', en: 'Keep it short.' } }),
        tone: f.choice({ de: 'Ton', en: 'Tone' }, { options: [{ value: 'calm', label: { de: 'Ruhig', en: 'Calm' } }, { value: 'loud', label: { de: 'Laut', en: 'Loud' } }], default: 'calm' }),
      },
      tasks: [{ id: 'edit', kind: 'edit', label: { de: 'Text ändern', en: 'Change the text' }, fields: ['title'] }],
    }),
    dishes: collection({
      label: { de: 'Speisen', en: 'Dishes' },
      max: 50,
      order: { field: 'price', dir: 'desc' },
      fields: {
        name: f.text({ de: 'Name', en: 'Name' }, { group: { de: 'Grundlagen', en: 'Basics' } }),
        price: f.number({ de: 'Preis', en: 'Price' }, { min: 0, max: 100, step: 0.5 }),
        sides: f.list({ de: 'Beilagen', en: 'Sides' }, { itemLabel: { de: 'Beilage', en: 'Side' }, max: 5, optional: true, fields: { side: f.text({ de: 'Beilage', en: 'Side' }) } }),
      },
    }),
  },
  components: defineComponents({
    card: { kind: 'block', label: { de: 'Karte', en: 'Card' }, describe: { de: 'Eine Karte mit Bild.', en: 'A card with an image.' }, props: { image: f.image({ de: 'Bild', en: 'Image' }) }, slots: { default: { label: { de: 'Text', en: 'Text' } } }, editor: { icon: 'card', example: '::card\nText\n::' } },
  }),
})
const full = serializeSchema(site)
const app = appSchema(full)

const bundle: Bundle = {
  format: 3, site: 'cafe', locale: 'en', mainLocale: 'de', schemaRev: 1, contentRev: 1, generatedAt: '2026-10-15T10:00:00Z',
  bricks: {
    about: { kind: 'single', data: { title: 'Hello' }, fallback: [] },
    dishes: { kind: 'collection', items: [
      { id: 'a', data: { name: 'Soup', price: 6, sides: [{ _id: 'r1', side: 'Bread' }] }, fallback: [] },
      { id: 'b', data: { name: 'Stew', price: 12 }, fallback: [] },
    ] },
  },
} as unknown as Bundle

describe('appSchema', () => {
  test('pages get the same content, order and component props from it', () => {
    expect(applyDefaults(bundle, app)).toEqual(applyDefaults(bundle, full))
    expect(query(bundle, 'dishes', {}, app)).toEqual(query(bundle, 'dishes', {}, full))
    for (const value of ['/img/a.webp', 'javascript:alert(1)']) {
      expect(attributeProblem('card', 'image', value, componentsForMarkdown(full))).toBe(attributeProblem('card', 'image', value, full.components))
    }
  })

  // Wrong behaviour caught: the registry ships in every page's script again, or the slim one drops what attributeProblem reads.
  test('the registry is not in the client schema; the Markdown module holds the declared props with their types', () => {
    expect(app).not.toHaveProperty('components')
    expect(componentsForMarkdown(full)).toEqual({ card: { kind: 'block', props: { image: { type: 'image' } } } })
  })

  test('carries no editor texts, but the choice options', () => {
    const json = JSON.stringify(app)
    for (const text of ['Über uns', 'Wer wir sind.', 'Keep it short.', 'Change the text', 'Speisen', 'Grundlagen', 'Beilage', 'Eine Karte mit Bild.', '::card']) expect(json).not.toContain(text)
    expect(app.bricks.about!.fields.tone).toMatchObject({ options: [{ value: 'calm', label: { de: 'Ruhig', en: 'Calm' } }, { value: 'loud', label: { de: 'Laut', en: 'Loud' } }] })
  })
})
