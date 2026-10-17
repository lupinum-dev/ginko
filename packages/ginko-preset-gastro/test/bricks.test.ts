// Every label comes in German and English, so an English café owner sees English and an Austrian one German; the Austrian demo must keep its schema (`pnpm check:contracts`).
import { defineSite } from '@lupinum/ginko'
import { checkSchema, serializeSchema } from '@lupinum/ginko/internal'
import { describe, expect, it } from 'vitest'
import { allergensEU, events, gallery, hourPlans, hours, lunch, lunchPlans, menu, notices } from '../src/index.ts'

const siteWith = (bricks: Record<string, any>) =>
  defineSite({ site: 'cafe', name: 'Café', url: 'https://cafe.example', timeZone: 'Asia/Singapore', locales: ['en'], currency: 'EUR', pages: { home: '/' }, bricks })

describe('labels', () => {
  it('brick, field, task and option labels come in German and English, whatever the site locales are', () => {
    const schema = JSON.stringify(serializeSchema(siteWith({ hours: hours(), lunch: lunch(), menu: menu() })))
    expect(schema).toContain('{"de":"Öffnungszeiten","en":"Opening hours"}')
    expect(schema).toContain('{"de":"Heute geschlossen","en":"Closed today"}')
    expect(schema).toContain('{"de":"Mittagsmenü","en":"Lunch menu"}')
    expect(schema).toContain('{"de":"Montag","en":"Monday"}')
    expect(schema).toContain('{"de":"Geplanter Preis","en":"Planned price"}')
  })
  it('the lunch plan task has both languages', () => {
    expect(JSON.stringify(serializeSchema(siteWith({ lunchPlans: lunchPlans() })))).toContain('{"de":"Nächste Woche planen","en":"Plan next week"}')
  })
  // Wrong behaviour caught: an English site stores the German placeholder, or a German one the English text.
  it('prefilled texts keep the site locales only', () => {
    const english = JSON.stringify(serializeSchema(siteWith({ lunch: lunch(), notices: notices() })))
    expect(english).toContain('{"en":"To be announced"}')
    expect(english).toContain('{"en":"We are fully booked today."}')
    expect(english).not.toContain('Wird noch bekannt gegeben')
    const german = JSON.stringify(serializeSchema({ ...siteWith({ lunch: lunch(), notices: notices() }), locales: ['de'] }))
    expect(german).toContain('{"de":"Heute sind wir ausgebucht."}')
    expect(german).not.toContain('To be announced')
    // A main locale the preset has no text for: the prefilled texts are left out, not stored without the main language,
    // even when the site has both of the preset's languages as well.
    const swiss = serializeSchema({ ...siteWith({ lunch: lunch(), notices: notices() }), locales: ['fr', 'de', 'en'], timeZone: 'Europe/Zurich' })
    expect(swiss.bricks.lunch!.fields.days!.default).toBeUndefined()
    expect(checkSchema(swiss)).toEqual([])
  })
  it('a Spanish site built from the preset passes checkSchema (labels fall back to English)', () => {
    const site = defineSite({
      site: 'cafe', name: 'Café', url: 'https://cafe.example', timeZone: 'Europe/Madrid', locales: ['es'], currency: 'EUR', pages: { home: '/' },
      bricks: {
        hours: hours(), hourPlans: hourPlans(), notices: notices(), lunch: lunch(), lunchPlans: lunchPlans(), menu: menu(),
        events: events({ route: { es: '/eventos/[slug]' } }), gallery: gallery(),
      },
    })
    expect(checkSchema(serializeSchema(site))).toEqual([])
  })
})

describe('allergens', () => {
  const fieldsOf = (bricks: Record<string, any>) => JSON.stringify(serializeSchema(siteWith(bricks)))
  it('"none" leaves the field out of menu and lunch, and the schema is valid', () => {
    const site = siteWith({ menu: menu({ allergens: 'none' }), lunch: lunch({ allergens: 'none' }), lunchPlans: lunchPlans({ allergens: 'none' }), notices: notices() })
    expect(JSON.stringify(serializeSchema(site))).not.toMatch(/llergen/)
    expect(checkSchema(serializeSchema(site))).toEqual([])
  })
  it('a custom list replaces the EU codes', () => {
    const json = fieldsOf({ menu: menu({ allergens: [{ value: 'nut', label: 'Nuts' }] }) })
    expect(json).toContain('"Nuts"')
    expect(json).not.toContain('Gluten')
  })
  // Wrong behaviour caught: without a `none` option a dish with no allergens can only be saved as an empty list, which a
  // site cannot tell from "not filled in" and would show as "no allergens" by accident.
  // The `allergens` field of a brick, found anywhere in the serialized schema; its option values in order.
  const allergenValues = (brick: Record<string, any>): string[] => {
    const walk = (node: any): any => {
      if (node === null || typeof node !== 'object') return undefined
      if (node.allergens?.options) return node.allergens
      return Object.values(node).map(walk).find((found) => found !== undefined)
    }
    return walk(serializeSchema(siteWith({ b: brick }))).options.map((o: { value: string }) => o.value)
  }
  it('every allergen set offers `none` first, so "no allergens" is a choice', () => {
    for (const [allergens, first] of [[undefined, 'A'], ['EU', 'A'], [[{ value: 'nut', label: 'Nuts' }], 'nut']] as const) {
      for (const brick of [menu({ allergens }), lunch({ allergens })]) {
        const values = allergenValues(brick)
        expect(values.indexOf('none')).toBeGreaterThanOrEqual(0)
        expect(values.indexOf('none')).toBeLessThan(values.indexOf(first))
      }
    }
  })
  it('a custom set with its own `none` does not get a second one', () => {
    const own = [{ value: 'none', label: 'Nothing' }, { value: 'nut', label: 'Nuts' }]
    for (const brick of [menu({ allergens: own }), lunch({ allergens: own })]) {
      expect(allergenValues(brick)).toEqual(['none', 'nut'])
    }
  })
  it('the default keeps the 14 EU codes', () => {
    expect(fieldsOf({ menu: menu() })).toContain('{"de":"B Krebstiere","en":"B Crustaceans"}')
    expect(fieldsOf({ menu: menu() })).toContain('A Gluten')
    expect(allergensEU).toHaveLength(14)
  })
})

describe('options', () => {
  it('source: files reaches the brick on every factory, and no source means the platform', () => {
    const files = { source: 'files' } as const
    const bricks = { hours: hours(files), hourPlans: hourPlans(files), notices: notices(files), lunch: lunch(files), lunchPlans: lunchPlans(files), menu: menu(files), events: events({ ...files, route: { en: '/events/[slug]' } }), gallery: gallery(files) }
    expect(Object.values(bricks).map((b) => b.source)).toEqual(Array(8).fill('files'))
    expect(hours()).not.toHaveProperty('source')
  })
})
