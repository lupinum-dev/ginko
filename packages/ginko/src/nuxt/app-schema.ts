import type { Brick, ComponentDef, Field, Fields, Schema } from '../core/index.ts'

/**
 * The schema the site's app imports (`#ginko/schema`, rendered on the server and shipped to the browser): the
 * serialized schema without the texts only editors and agents read: labels, descriptions, hints, groups, tasks and
 * slash-menu entries. No page code reads them, and they were most of the schema's weight in every page's script.
 * Required labels stay, as ''. Server routes (sitemap, llms.txt, Markdown) import the full schema.
 */
export function appSchema(schema: Schema): Schema {
  return {
    ...schema,
    bricks: Object.fromEntries(Object.entries(schema.bricks).map(([key, brick]) => [key, appBrick(brick)])),
    ...(schema.components && { components: Object.fromEntries(Object.entries(schema.components).map(([tag, def]) => [tag, appComponent(def)])) }),
  }
}

function appBrick(brick: Brick): Brick {
  const { describe: _describe, tasks: _tasks, ...rest } = brick
  return { ...rest, label: '', fields: appFields(brick.fields) }
}

function appComponent(def: ComponentDef): ComponentDef {
  const { editor: _editor, ...rest } = def
  return {
    ...rest,
    label: '',
    describe: '',
    props: appFields(def.props),
    ...(def.slots && { slots: Object.fromEntries(Object.entries(def.slots).map(([name, slot]) => [name, { ...slot, label: '' }])) }),
  }
}

function appFields(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, appField(field)]))
}

function appField(field: Field): Field {
  const { hint: _hint, group: _group, ...rest } = field
  if (rest.type === 'list') return { ...rest, label: '', itemLabel: '', of: appFields(rest.of) }
  return { ...rest, label: '' }
}
