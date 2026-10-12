import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { f, neighbors, query, type Bundle, type BundleItem, type QuerySchema, type Schema } from '../../src/core/index.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../../contracts/restaurant/${path}`, import.meta.url), 'utf8'))
const bundle = read('bundle.format3.de.json') as Bundle
const schema = read('schema.json') as Schema
const ids = (items: BundleItem[]) => items.map((i) => i.id)

const item = (id: string, data: Record<string, unknown>): BundleItem => ({ id, data, fallback: [] })
const mini = (bricks: Bundle['bricks']): Bundle => ({ ...bundle, bricks })

describe('query where', () => {
  // Wrong behaviour caught: an operator comparing wrongly (money amount, ISO date, case, array membership).
  it.each([
    ['plain equality', { category: 'mains' }, ['menu-schnitzel', 'menu-risotto', 'menu-dal']],
    ['eq / ne', { veg: { ne: 'none' }, category: { eq: 'mains' } }, ['menu-risotto', 'menu-dal']],
    ['array equality means contains', { allergens: 'G' }, ['menu-saibling', 'menu-schnitzel', 'menu-risotto', 'menu-marillen', 'menu-topfen']],
    ['in', { category: { in: ['soups', 'drinks'] } }, ['menu-frittaten', 'menu-veltliner']],
    ['gte / lt on money', { price: { gte: 1490, lt: 1700 } }, ['menu-risotto', 'menu-dal']],
    ['gt / lte on money', { price: { gt: 1490, lte: 1690 } }, ['menu-risotto']],
    ['contains is case-insensitive', { name: { contains: 'SCHNITZEL' } }, ['menu-schnitzel']],
    ['array value no item has', { allergens: 'Z' }, []],
  ])('%s', (_name, where, expected) => {
    expect(ids(query(bundle, 'menu', { where }, schema).items)).toEqual(expected)
  })

  it('compares dates as ISO strings and skips items without the value', () => {
    expect(ids(query(bundle, 'events', { where: { when: { gte: '2026-10-01' } } }, schema).items)).toEqual(['weinabend', 'martinigans'])
    expect(ids(query(bundle, 'events', { where: { price: { gt: 0 } } }, schema).items)).toEqual(['weinabend', 'martinigans'])
  })

  it('throws on a field the brick does not have, in where, order, fields, facets', () => {
    expect(() => query(bundle, 'menu', { where: { colour: 'red' } }, schema)).toThrow(/brick "menu" has no field "colour"/)
    expect(() => query(bundle, 'menu', { order: 'colour' }, schema)).toThrow(/colour/)
    expect(() => query(bundle, 'menu', { fields: ['colour'] }, schema)).toThrow(/colour/)
    expect(() => query(bundle, 'menu', { facets: ['colour'] })).toThrow(/colour/)
  })

  it('throws for a brick that is not a collection', () => {
    expect(() => query(bundle, 'hours')).toThrow(/not a collection/)
  })
})

describe('query order', () => {
  it('keeps the bundle order by default', () => {
    expect(ids(query(bundle, 'menu').items)).toEqual(ids((bundle.bricks.menu as { items: BundleItem[] }).items))
  })

  it('sorts by money, with missing values last in both directions', () => {
    expect(ids(query(bundle, 'events', { order: 'price desc' }, schema).items)).toEqual(['martinigans', 'weinabend', 'sommerfest'])
    expect(ids(query(bundle, 'events', { order: 'price asc' }, schema).items)).toEqual(['weinabend', 'martinigans', 'sommerfest'])
  })

  it('uses several keys and is stable for equal keys', () => {
    expect(ids(query(bundle, 'menu', { order: 'veg desc, price asc' }, schema).items).slice(0, 3)).toEqual(['menu-frittaten', 'menu-topfen', 'menu-marillen'])
    // equal category keeps the bundle order of the mains
    expect(ids(query(bundle, 'menu', { where: { category: 'mains' }, order: 'category' }, schema).items)).toEqual(['menu-schnitzel', 'menu-risotto', 'menu-dal'])
  })

  it('rejects an invalid order', () => {
    expect(() => query(bundle, 'menu', { order: 'price sideways' }, schema)).toThrow(/invalid order/)
  })
})

describe('query paging', () => {
  const five = mini({ n: { kind: 'collection', items: [1, 2, 3, 4, 5].map((i) => item(`i${i}`, { n: i })) } })
  it.each([
    [{ limit: 2 }, ['i1', 'i2'], 5, 1, 3],
    [{ limit: 2, page: 3 }, ['i5'], 5, 3, 3],
    [{ limit: 2, page: 4 }, [], 5, 4, 3],
    [{ limit: 5 }, ['i1', 'i2', 'i3', 'i4', 'i5'], 5, 1, 1],
    [{ page: 2 }, [], 5, 2, 1],
    [{ where: { n: { gt: 9 } }, limit: 2 }, [], 0, 1, 1],
  ])('%j', (q, expected, total, page, pages) => {
    const r = query(five, 'n', q)
    expect({ ids: ids(r.items), total: r.total, page: r.page, pages: r.pages }).toEqual({ ids: expected, total, page, pages })
  })
})

describe('query projection and facets', () => {
  it('fields keeps only those data keys, id/urls/fallback stay', () => {
    const r = query(bundle, 'events', { fields: ['title'], where: { slug: 'martini-gansl' } }, schema)
    expect(r.items[0]).toMatchObject({ id: 'martinigans', data: { title: 'Martini-Gansl' }, fallback: [], urls: { de: '/veranstaltungen/martini-gansl' } })
    expect(Object.keys(r.items[0]!.data)).toEqual(['title'])
  })

  it('facets count over the filtered set before paging, arrays count each value', () => {
    const r = query(bundle, 'menu', { where: { category: 'mains' }, facets: ['veg', 'allergens'], limit: 1 }, schema)
    expect(r.items).toHaveLength(1)
    expect(r.facets).toEqual({ veg: { none: 1, vegetarian: 1, vegan: 1 }, allergens: { A: 1, C: 1, G: 2 } })
  })
})

describe('query include', () => {
  // `ref` does not exist in core yet: a hand-written schema carries the agreed shape.
  const refSchema: QuerySchema = { bricks: { posts: { fields: { author: f.ref('Autor', 'people'), tags: f.ref('Tags', 'tags', { multiple: true }), title: f.text('Titel') } } } }
  const b = mini({
    people: { kind: 'collection', items: [item('ann', { name: 'Ann' })] },
    tags: { kind: 'collection', items: [item('t1', { label: 'One' }), item('t2', { label: 'Two' })] },
    posts: { kind: 'collection', items: [item('p1', { title: 'A', author: 'ann', tags: ['t2', 'gone', 't1'] }), item('p2', { title: 'B', author: 'nobody' })] },
  })

  it('replaces single and multiple ids with the referenced items, keeps unknown ids', () => {
    const [p1, p2] = query(b, 'posts', { include: ['author', 'tags'] }, refSchema).items
    expect(p1!.data.author).toEqual(item('ann', { name: 'Ann' }))
    expect(p1!.data.tags).toEqual([item('t2', { label: 'Two' }), 'gone', item('t1', { label: 'One' })])
    expect(p2!.data.author).toBe('nobody')
  })

  it('leaves ids when there is no schema', () => {
    expect(query(b, 'posts', { include: ['author'] }).items[0]!.data.author).toBe('ann')
  })
})

describe('neighbors', () => {
  it('returns prev and next in bundle order, one side only at the ends', () => {
    const mid = neighbors(bundle, 'menu', 'menu-frittaten')
    expect([mid.prev?.id, mid.next?.id]).toEqual(['menu-saibling', 'menu-schnitzel'])
    expect(neighbors(bundle, 'menu', 'menu-saibling').prev).toBeUndefined()
    expect(neighbors(bundle, 'menu', 'menu-saibling').next?.id).toBe('menu-frittaten')
    expect(neighbors(bundle, 'menu', 'menu-topfen').next).toBeUndefined()
    expect(neighbors(bundle, 'menu', 'nope')).toEqual({})
  })

  it('uses the given order', () => {
    const n = neighbors(bundle, 'events', 'weinabend', 'price desc')
    expect([n.prev?.id, n.next?.id]).toEqual(['martinigans', 'sommerfest'])
  })
})
