import type { Brick, Field, Fields, Schema } from '../core/index.ts'
import type { AttributeRegistry } from '../core/markdown.ts'

/**
 * The schema the site's app imports (`#ginko/schema`, rendered on the server and shipped to the browser): the
 * serialized schema without the texts only editors and agents read: labels, descriptions, hints, groups, tasks and
 * slash-menu entries. No page code reads them, and they were most of the schema's weight in every page's script.
 * Required labels stay, as ''. The Markdown `components` registry is left out too: the one client reader, `GinkoMarkdown`,
 * imports the slim `#ginko/components` (componentsForMarkdown). Server routes (sitemap, llms.txt, Markdown) import the full schema.
 */
export function appSchema(schema: Schema): Schema {
  const { components: _components, ...schemaRest } = schema
  return {
    ...schemaRest,
    bricks: Object.fromEntries(Object.entries(schema.bricks).map(([key, brick]) => [key, appBrick(brick)])),
  }
}

function appBrick(brick: Brick): Brick {
  const { describe: _describe, tasks: _tasks, ...rest } = brick
  return { ...rest, label: '', fields: appFields(brick.fields) }
}

/**
 * The Markdown registry for the browser (`#ginko/components`): per tag the kind and each declared prop's type, which is
 * all `attributeProblem` reads. Labels, slots and editor settings stay on the server.
 */
export function componentsForMarkdown(schema: Schema): AttributeRegistry {
  return Object.fromEntries(Object.entries(schema.components ?? {}).map(([tag, def]) => [
    tag,
    { kind: def.kind, props: Object.fromEntries(Object.entries(def.props).map(([name, field]) => [name, { type: field.type }])) },
  ]))
}

function appFields(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, appField(field)]))
}

function appField(field: Field): Field {
  const { hint: _hint, group: _group, ...rest } = field
  if (rest.type === 'list') return { ...rest, label: '', itemLabel: '', of: appFields(rest.of) }
  return { ...rest, label: '' }
}
