import { describe, expect, it } from 'vitest'
import { explainChanges, explainRejected } from '../../src/cli/report.ts'
import { collection, defineSite, diffSchema, f, serializeSchema } from '../../src/core/index.ts'

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
        "  + New field “menu.c”.",
      ]
    `)
  })
})
