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

describe('tree: a collection states its navigation tree', () => {
  const bundle = {
    format: 3, site: 'x', locale: 'de', locales: ['de'], mainLocale: 'de', currency: 'EUR', schemaRev: 1, contentRev: 1, generatedAt: '2026-10-11T00:00:00.000Z',
    bricks: { docs: { kind: 'collection', items: [
      { id: 'a', data: { title: 'Start' }, fallback: [], urls: { de: '/start' } },
      { id: 'b', data: { title: 'Schlüssel', oben: 'a', parent: 'a' }, fallback: [], urls: { de: '/schluessel' } },
    ] } },
  } as unknown as Bundle
  const docs = (tree?: CollectionBrick['tree']) => ({ bricks: { docs: {
    kind: 'collection', label: 'Doku', order: 'manual', listing: { title: 'title' }, ...(tree ? { tree } : {}),
    fields: { title: { type: 'text', label: 'Titel' }, oben: { type: 'ref', label: 'Oben', to: 'docs' }, parent: { type: 'ref', label: 'Oben', to: 'docs' } },
  } as unknown as Brick } })
  const shape = (schema: ReturnType<typeof docs>) => navTree(bundle, ['docs'], 'de', schema).map((n) => [n.title, n.children.map((c) => c.title)])

  // Wrong (guess 6): a field called `parent` nests the pages of any collection, and a field with another name never does.
  it('nests pages by the field tree.parent names, and not at all without tree', () => {
    expect(shape(docs({ parent: 'oben' }))).toEqual([['Start', ['Schlüssel']]])
    expect(shape(docs())).toEqual([['Start', []], ['Schlüssel', []]])
  })

  // Wrong: a tree whose parent field points to another brick, holds several entries, or whose order is not the owner's
  // is accepted, and the Studio moves pages in an order the site does not show.
  it('needs a ref to the collection itself and the owner\'s order', () => {
    const schema = stored()
    const events = schema.bricks.events as CollectionBrick
    events.fields.up = { type: 'ref', label: 'Oben', to: 'menu' }
    events.tree = { parent: 'up', section: 'title' }
    events.order = { field: 'title' }
    expect(checkSchema(schema)).toEqual([
      'events.tree.parent: “up” is not a ref field to events itself (one entry).',
      'events.tree: a navigation tree is sorted by hand. Write `order: \'manual\'`.',
    ])
  })
})

describe('one address field per collection', () => {
  // Wrong (guess 8): a collection with two slug fields is accepted, and the first one in field order silently becomes
  // the address of every entry.
  it('refuses a second live slug field; a retired one may stay', () => {
    const schema = stored()
    const events = schema.bricks.events as CollectionBrick
    events.fields.short = { type: 'slug', label: 'Kurzadresse', from: 'title' }
    expect(checkSchema(schema)).toEqual(['events: a collection has one address (slug) field, not 2 (slug, short). Keep one and retire the others.'])
    ;(events.fields.short as { retired?: true }).retired = true
    schema.retired['events.short'] = { from: 'slug' }
    expect(checkSchema(schema)).toEqual([])
  })
})

describe('task ids', () => {
  const withTasks = (tasks: unknown[]) => {
    const schema = stored()
    ;(schema.bricks.events as unknown as { tasks: unknown[] }).tasks = tasks
    return checkSchema(schema)
  }
  const edit = (id: string, fields = ['title']) => ({ id, label: 'Bearbeiten', kind: 'edit', pick: true, fields })

  // Wrong (guess 11): the Studio cannot rely on the id `edit` (what a row opens) when any task may carry it, two tasks
  // may share an id (a grant then names both), or a task names a field the brick does not have.
  it.each([
    ['a pattern', [edit('Preis-ändern')], 'events.tasks: “Preis-ändern” is not a task id. Write a letter, then letters and digits, such as “price”.'],
    ['unique in the brick', [edit('fix'), edit('fix')], 'events.tasks: the id “fix” is used by two tasks. Give one of them another id.'],
    ['the standard ids for their kind', [{ id: 'edit', label: 'Neu', kind: 'create' }], 'events.edit: “edit” is the id of the standard edit task. Give this add task another id.'],
    ['fields that exist', [edit('fix', ['title', 'subtitle'])], 'events.fix.fields: “subtitle” is not a field of this brick.'],
  ])('are checked: %s', (_rule, tasks, problem) => {
    expect(withTasks(tasks)).toEqual([problem])
  })
})
