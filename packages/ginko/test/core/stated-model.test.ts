// The stored model states what Ginko once concluded from shape, order or name (design V2, section 3.2). Each test names
// the wrong behaviour it catches: the behaviour coming back from the shape instead of its key.
import { describe, expect, it } from 'vitest'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'
import { checkSchema, diffSchema, entryTitle, navTree, serializeSchema, type Brick, type Bundle, type CollectionBrick, type Schema } from '../../src/core/index.ts'

const stored = (): Schema => structuredClone(serializeSchema(restaurant))

describe('format: the form of the stored model', () => {
  // Wrong: a platform takes a schema of another form and reads its keys as if they meant what they mean in its own,
  // or answers with a wall of problems that are not the real one.
  it.each([
    [undefined, 'The schema has no format number, so it was written by a Ginko older than this one. Update @lupinum/ginko in the site to the version of the platform (format 2) and release again.'],
    [1, 'The schema has format 1, and this Ginko reads format 2 only. Use the same version of Ginko in the site and on the platform.'],
    [3, 'The schema has format 3, and this Ginko reads format 2 only. Use the same version of Ginko in the site and on the platform.'],
  ])('refuses format %j with one sentence', (format, sentence) => {
    const schema = stored() as unknown as Record<string, unknown>
    if (format === undefined) delete schema.format
    else schema.format = format
    expect(checkSchema(schema)).toEqual([sentence])
  })

  // Wrong: a release moves a stored model of the old form to the new one without the platform's upgrade, so its
  // stored content is read with the rules of a form it was never written in.
  it('is never changed by a release', () => {
    const old = stored() as unknown as Record<string, unknown>
    delete old.format
    expect(diffSchema(old as unknown as Schema, stored()).rejected.map((r) => r.path)).toEqual(['format'])
  })
})

describe('listing: how an entry appears in lists', () => {
  const menu = (listing: CollectionBrick['listing']): CollectionBrick => ({ ...(stored().bricks.menu as CollectionBrick), listing })
  const dish = { category: 'mains', name: { de: 'Gulasch' }, description: { de: 'Vom Rind, mit Knödel' } }

  // Wrong (guess 4): an entry is named by its first filled text field, so moving a field up renames every entry in
  // the Studio, in history lines and in search hits.
  it('names an entry by the field of listing.title, not by the first text field', () => {
    expect(entryTitle(menu({ title: 'name' }), dish, 'de')).toBe('Gulasch')
    expect(entryTitle(menu({ title: 'description' }), dish, 'de')).toBe('Vom Rind, mit Knödel')
  })

  // Wrong (guess 4): the navigation tree names a page by a field called `title`, else by its last path segment.
  it('names a page in the navigation tree by the field of listing.title', () => {
    const bundle = {
      format: 3, site: 'x', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '2026-10-11T00:00:00.000Z',
      bricks: { pages: { kind: 'collection', items: [{ id: 'about', data: { title: 'Seite 1', name: 'Über uns' }, fallback: [], urls: { de: '/ueber-uns' } }] } },
    } as unknown as Bundle
    const pages = (title: string) => ({ bricks: { pages: { kind: 'collection', label: 'Seiten', listing: { title }, fields: { title: { type: 'text', label: 'Kicker' }, name: { type: 'text', label: 'Name' } } } as unknown as Brick } })
    expect(navTree(bundle, ['pages'], 'de', pages('name')).map((n) => n.title)).toEqual(['Über uns'])
    expect(navTree(bundle, ['pages'], 'de', pages('title')).map((n) => n.title)).toEqual(['Seite 1'])
  })

  // Wrong: a collection without `listing` is accepted and its entries are named by a guess again.
  it('is required on a collection, and each key names a field of the fitting type', () => {
    const schema = stored()
    delete (schema.bricks.menu as Partial<CollectionBrick>).listing
    expect(checkSchema(schema)).toEqual(['menu: listing is missing. Write `listing: { title: \'<field>\' }` with the field that names an entry (a text, longtext or date field).'])
    const grouped = stored()
    ;(grouped.bricks.menu as CollectionBrick).listing = { title: 'price', group: 'name' }
    expect(checkSchema(grouped)).toEqual([
      'menu.listing.title: “price” is a money field. Name a text, longtext or date field.',
      'menu.listing.group: “name” is a text field. Name a choice field.',
    ])
  })
})
