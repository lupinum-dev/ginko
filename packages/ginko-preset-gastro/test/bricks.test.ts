// Every label comes in German and English, so an English café owner sees English and an Austrian one German; the Austrian demo must keep its schema (`pnpm check:contracts`).
import { defineSite } from '@lupinum/ginko'
import { checkSchema, serializeSchema } from '@lupinum/ginko/internal'
import { describe, expect, it } from 'vitest'
import { allergensEU, events, gallery, hourPlans, hours, lunch, lunchPlans, menu, notices } from '../src/index.ts'

const siteWith = (bricks: Record<string, any>) =>
  defineSite({ site: 'cafe', name: 'Café', url: 'https://cafe.example', timezone: 'Asia/Singapore', locales: ['en'], currency: 'EUR', pages: { home: '/' }, bricks })

describe('labels', () => {
  it('brick, field, task and option labels come in German and English, whatever lang is', () => {
    const schema = JSON.stringify(serializeSchema(siteWith({ hours: hours({ lang: 'en' }), lunch: lunch({ lang: 'en' }), menu: menu({ lang: 'en' }) })))
    expect(schema).toContain('{"de":"Öffnungszeiten","en":"Opening hours"}')
    expect(schema).toContain('{"de":"Heute geschlossen","en":"Closed today"}')
    expect(schema).toContain('{"de":"Mittagsmenü","en":"Lunch menu"}')
    expect(schema).toContain('{"de":"Montag","en":"Monday"}')
    expect(schema).toContain('{"de":"Preis ab …","en":"Price from …"}')
  })
  it('the lunch plan task has both languages', () => {
    expect(JSON.stringify(serializeSchema(siteWith({ lunchPlans: lunchPlans() })))).toContain('{"de":"Nächste Woche planen","en":"Plan next week"}')
  })
  it('lang only changes default content, not the labels', () => {
    expect(JSON.stringify(serializeSchema(siteWith({ lunch: lunch() })))).toContain('Wird noch bekannt gegeben')
    expect(JSON.stringify(serializeSchema(siteWith({ lunch: lunch({ lang: 'en' }) })))).toContain('To be announced')
    expect(JSON.stringify(serializeSchema(siteWith({ notices: notices({ lang: 'en' }) })))).toContain('We are fully booked today.')
  })
  it('a Spanish site built from the preset passes checkSchema (labels fall back to English)', () => {
    const site = defineSite({
      site: 'cafe', name: 'Café', url: 'https://cafe.example', timezone: 'Europe/Madrid', locales: ['es'], currency: 'EUR', pages: { home: '/' },
      bricks: {
        hours: hours(), hourPlans: hourPlans(), notices: notices(), lunch: lunch({ lang: 'es' }), lunchPlans: lunchPlans({ lang: 'es' }), menu: menu(),
        events: events({ route: { es: '/eventos/[slug]' } }), gallery: gallery(),
      },
    })
    expect(checkSchema(serializeSchema(site))).toEqual([])
  })
})

describe('allergens', () => {
  const fieldsOf = (bricks: Record<string, any>) => JSON.stringify(serializeSchema(siteWith(bricks)))
  it('"none" leaves the field out of menu and lunch, and the schema is valid', () => {
    const site = siteWith({ menu: menu({ allergens: 'none' }), lunch: lunch({ lang: 'en', allergens: 'none' }), lunchPlans: lunchPlans({ lang: 'en', allergens: 'none' }), notices: notices() })
    expect(JSON.stringify(serializeSchema(site))).not.toMatch(/llergen/)
    expect(checkSchema(serializeSchema(site))).toEqual([])
  })
  it('a custom list replaces the EU codes', () => {
    const json = fieldsOf({ menu: menu({ allergens: [{ value: 'nut', label: 'Nuts' }] }) })
    expect(json).toContain('"Nuts"')
    expect(json).not.toContain('Gluten')
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
