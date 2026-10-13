import { describe, expect, it } from 'vitest'
import { collection, defineSite, f, single, type DataOf, type Money, type Query } from '../../src/index.ts'

// The authoring types reject input the validator would only reject at `ginko release`. `pnpm typecheck`
// runs this file: each `@ts-expect-error` fails the check when a type is widened again.

const base = { site: 'linde', name: 'Linde', url: 'https://linde.example', timezone: 'Europe/Vienna', locales: ['de'], currency: 'EUR', pages: { home: '/' } } as const

describe('authoring types', () => {
  it('retired takes only bricks and fields of the config', () => {
    const bricks = { menu: collection({ label: 'Karte', fields: { name: f.text('Name'), old: f.text('Alt', { optional: true }) }, max: 5, order: 'manual' }), hours: single({ label: 'Zeiten', fields: { note: f.text('Hinweis') } }) }
    defineSite({ ...base, bricks, retired: { 'menu.old': { drop: true }, hours: { drop: true } } })
    // @ts-expect-error a field that does not exist
    defineSite({ ...base, bricks, retired: { 'menu.gone': { drop: true } } })
    // @ts-expect-error the empty rule from before 0.4
    defineSite({ ...base, bricks, retired: { 'menu.old': {} } })
    // @ts-expect-error a retired brick takes { drop: true }
    defineSite({ ...base, bricks, retired: { hours: { from: 'note' } } })
    expect(true).toBe(true)
  })

  it('builders take no platform keys and only the options their type uses', () => {
    // @ts-expect-error `pos` is set by the platform
    f.text('Name', { pos: 3 })
    // @ts-expect-error `retired` is set through the site's `retired`
    f.text('Name', { retired: true })
    // @ts-expect-error a slug always has one value per language
    f.slug('Adresse', { from: 'name', translate: false })
    // @ts-expect-error several entries need f.refs
    f.ref('Autor', { to: 'people', multiple: true })
    // @ts-expect-error max counts entries, so only f.refs has it
    f.ref('Autor', { to: 'people', max: 2 })
    expect(true).toBe(true)
  })

  it('default has the type of the field', () => {
    f.text('Name', { default: 'Linde' })
    f.text('Name', { default: { de: 'Linde', en: 'Linden' } })
    f.money('Preis', { default: { amount: 1250 } })
    const kind = f.choice('Art', { options: ['a', 'b'], default: 'a' })
    // @ts-expect-error the value type keeps the option values
    const notAnOption: DataOf<{ kind: typeof kind }>['kind'] = 'c'
    f.choices('Arten', { options: ['a', 'b'], default: ['b'] })
    // @ts-expect-error a number field takes a number
    f.number('Anzahl', { min: 0, max: 9, step: 1, default: '3' })
    // @ts-expect-error a value that is not an option
    f.choice('Art', { options: ['a', 'b'], default: 'c' })
    // @ts-expect-error markdown has no default
    f.markdown('Text', { default: 'Hallo' })
    // @ts-expect-error a mistyped option
    f.text('Name', { max: 80, maxx: 90 })
    // @ts-expect-error an e-mail address is not translated, so its default is one text
    f.text('E-Mail', { format: 'email', default: { de: 'a@linde.example' } })
    // @ts-expect-error a text with translate: false has one text
    f.text('Ort', { translate: false, default: { de: 'Salzburg' } })
    f.text('Ort', { translate: false, default: 'Salzburg' })
    expect(notAnOption).toBe('c')
  })

  it('list rows keep the types of their columns', () => {
    const fields = { days: f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht'), price: f.money('Preis') } }) }
    const row = {} as DataOf<typeof fields>['days'][number]
    const dish: string = row.dish
    // @ts-expect-error money is no text
    const price: string = row.price
    f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht'), price: f.money('Preis') }, default: [{ _id: 'r000000001', dish: 'Suppe', price: { amount: 950 } }] })
    // @ts-expect-error a list default cell has its column's type
    f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht'), price: f.money('Preis') }, default: [{ _id: 'r000000001', price: 950 }] })
    // @ts-expect-error a list default names only its columns
    f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht') }, default: [{ _id: 'r000000001', dsh: 'Suppe' }] })
    // @ts-expect-error a row needs every column that is not optional
    f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht') }, default: [{ _id: 'r000000001' }] })
    f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht'), body: f.markdown('Text'), note: f.text('Hinweis', { optional: true }) }, default: [{ _id: 'r000000001', dish: 'Suppe', body: { de: '# Suppe' } }] })
    expect([dish, price]).toHaveLength(2)
  })

  it('ref is one ID, refs a list of IDs', () => {
    const fields = { author: f.ref('Autor', { to: 'people' }), tags: f.refs('Tags', { to: 'tags', max: 3 }) }
    const data = {} as DataOf<typeof fields>
    const one: string = data.author
    const many: string[] = data.tags
    // @ts-expect-error not a list
    const wrong: string[] = data.author
    expect([one, many, wrong]).toHaveLength(3)
  })

  it('tasks, visible and route name what the brick has', () => {
    const fields = { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), until: f.date('Bis') }
    collection({ label: 'News', fields, max: 5, order: 'manual', route: { de: '/news/[slug]' }, visible: { mode: 'until', field: 'until' }, tasks: [{ id: 'e', label: 'E', kind: 'edit', fields: ['title'], prefill: { until: '@today' } }] })
    // @ts-expect-error the visibility field does not exist
    collection({ label: 'News', fields, max: 5, order: 'manual', visible: { mode: 'until', field: 'untill' } })
    // @ts-expect-error visibility needs a date or daterange field
    collection({ label: 'News', fields, max: 5, order: 'manual', visible: { mode: 'until', field: 'title' } })
    // @ts-expect-error plans needs a date field
    collection({ label: 'News', fields, max: 5, order: 'manual', plans: { brick: 'lunch', field: 'title' } })
    // @ts-expect-error a task field that does not exist
    collection({ label: 'News', fields, max: 5, order: 'manual', tasks: [{ id: 'e', label: 'E', kind: 'edit', fields: ['titel'] }] })
    // @ts-expect-error a prefill for a field that does not exist
    single({ label: 'S', fields, tasks: [{ id: 'c', label: 'C', kind: 'edit', fields: ['title'], prefill: { titel: 'x' } }] })
    // @ts-expect-error a prefill has the type of its field
    single({ label: 'S', fields: { price: f.money('Preis') }, tasks: [{ id: 'c', label: 'C', kind: 'create', prefill: { price: 'x' } }] })
    // @ts-expect-error a token needs a date field
    single({ label: 'S', fields: { seats: f.number('Plätze', { min: 0, max: 99, step: 1 }) }, tasks: [{ id: 'c', label: 'C', kind: 'create', prefill: { seats: '@today' } }] })
    // @ts-expect-error a route without [slug]
    collection({ label: 'News', fields, max: 5, order: 'manual', route: { de: '/news' } })
    expect(true).toBe(true)
  })

  it('a query names fields of the brick and compares with their values', () => {
    type Dish = { name: string; price: Money; tags: string[] }
    const ok: Query<Dish> = { where: { price: { lte: { amount: 1500 } }, tags: 'veg', name: { contains: 'suppe' } }, order: { field: 'price' }, facets: ['tags'] }
    // @ts-expect-error a field the brick does not have
    const typo: Query<Dish> = { where: { prise: { lte: 1500 } } }
    // @ts-expect-error a text compared with a number
    const wrong: Query<Dish> = { where: { name: { gt: 3 } } }
    expect([ok, typo, wrong]).toHaveLength(3)
  })
})
