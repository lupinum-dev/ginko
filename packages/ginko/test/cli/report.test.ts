import { describe, expect, it } from 'vitest'
import { explainChanges, explainRejected } from '../../src/cli/report.ts'
import { checkSchema, collection, defineSite, diffSchema, f, serializeSchema } from '../../src/core/index.ts'

const site = (fields: Parameters<typeof collection>[0]['fields']) => serializeSchema(defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.example', timeZone: 'Europe/Vienna',
  locales: ['de'], currency: 'EUR', pages: { home: '/' },
  bricks: { menu: collection({ label: 'Karte', max: 50, order: 'manual', fields }) },
}))

describe('ginko check report', () => {
  // The core's `message` is German; the terminal renders `key`/`params` in English.
  it('prints schema changes and fixes in English', () => {
    const prod = site({ a: f.text('A'), b: f.text('B') })
    const { rejected } = diffSchema(prod, site({ a: f.text('A') }))
    const { changes } = diffSchema(prod, site({ a: f.text('A'), b: f.text('B'), c: f.text('C', { optional: true }) }))
    expect([...explainRejected(rejected), ...explainChanges(changes)]).toMatchInlineSnapshot(`
      [
        "The schema changes in a way that is not allowed:",
        "  ✗ menu.b: Field “menu.b” is missing.",
        "    → Add a new field, fill it with a migration and list the old field under \`retired\`.",
        "      // Keep “b” in bricks.menu.fields as it is in production; retired, it leaves the Studio.",
        "      retired: { 'menu.b': { value: … } }, // required: a valid value that old site code reads",
        "  + New field “menu.c”.",
      ]
    `)
  })

  // Wrong behaviour caught: the fix said only "add a new field…", or the snippet mirrored a field whose values the old
  // definition cannot hold, which the next check refuses.
  it('spells out the allowed way with the site’s names: a mirror only where the old definition holds every new value', () => {
    const prod = site({ price: f.text('Preis'), note: f.text('Notiz', { max: 300 }), tag: f.text('Tag', { optional: true }) })
    const next = site({ price: f.number('Preis', { min: 0, max: 1000, step: 1 }), note: f.text('Notiz', { max: 100 }), tag: f.number('Tag', { min: 0, max: 100, step: 1, optional: true }) })
    expect(explainRejected(diffSchema(prod, next).rejected)).toMatchInlineSnapshot(`
      [
        "The schema changes in a way that is not allowed:",
        "  ✗ menu.price: “menu.price”: type text → number.",
        "    → Add a new field, fill it with a migration and list the old field under \`retired\`.",
        "      // To change it: keep “price” in bricks.menu.fields as it is in production and add the new definition as “price2” (any new name).",
        "      migrations: {",
        "        'YYYY-MM-menu-price2': { brick: 'menu', fills: 'price2', compute: (entry) => entry.price }, // convert text to number",
        "      },",
        "      retired: { 'menu.price': { value: … } }, // required: a valid value that old site code reads",
        "  ✗ menu.note: “menu.note”: max cannot be lowered.",
        "    → Keep max.",
        "      // To change it: keep “note” in bricks.menu.fields as it is in production and add the new definition as “note2” (any new name).",
        "      migrations: {",
        "        'YYYY-MM-menu-note2': { brick: 'menu', fills: 'note2', compute: (entry) => entry.note },",
        "      },",
        "      retired: { 'menu.note': { from: 'note2' } },",
        "  ✗ menu.tag: “menu.tag”: type text → number.",
        "    → Add a new field, fill it with a migration and list the old field under \`retired\`.",
        "      // To change it: keep “tag” in bricks.menu.fields as it is in production and add the new definition as “tag2” (any new name).",
        "      migrations: {",
        "        'YYYY-MM-menu-tag2': { brick: 'menu', fills: 'tag2', compute: (entry) => entry.tag }, // convert text to number",
        "      },",
        "      retired: { 'menu.tag': { drop: true } },",
      ]
    `)
  })

  // Wrong behaviour caught: a config written as the snippet says is refused by the next release.
  it('a config that follows the snippets is accepted', () => {
    const prod = site({ price: f.text('Preis'), note: f.text('Notiz', { max: 300 }) })
    const next = serializeSchema(defineSite({
      site: 'linde', name: 'Linde', url: 'https://linde.example', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR', pages: { home: '/' },
      bricks: { menu: collection({ label: 'Karte', max: 50, order: 'manual', fields: { price: f.text('Preis'), note: f.text('Notiz', { max: 300 }), price2: f.number('Preis', { min: 0, max: 1000, step: 1 }), note2: f.text('Notiz', { max: 100 }) } }) },
      migrations: {
        '2026-11-menu-price2': { brick: 'menu', fills: 'price2', compute: (entry) => Number(entry.price) },
        '2026-11-menu-note2': { brick: 'menu', fills: 'note2', compute: (entry) => entry.note },
      },
      retired: { 'menu.price': { value: { de: 'auf Anfrage' } }, 'menu.note': { from: 'note2' } },
    }))
    expect(checkSchema(next)).toEqual([])
    expect(diffSchema(prod, next).rejected).toEqual([])
  })
})
