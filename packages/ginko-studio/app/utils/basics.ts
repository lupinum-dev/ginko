// Small rules of the Studio basics (UI.md 10.6) as plain functions, so they can be tested without a Nuxt app.
import type { Brick } from '@lupinum/ginko'
import { ordered, type Schema } from '@lupinum/ginko/internal'
import { taskRef } from './content'

/** The collections where this person may create entries: owners and admins everywhere, staff where a `create` task is granted. */
export function creatableBricks(schema: Schema, role: string | undefined, grants: readonly string[]): [string, Brick][] {
  const manager = role === 'owner' || role === 'admin'
  return ordered(schema.bricks).filter(([key, brick]) => {
    if (brick.retired || brick.kind !== 'collection') return false
    return manager || (brick.tasks ?? []).some((task) => task.kind === 'create' && grants.includes(taskRef(key, task)))
  }) as [string, Brick][]
}

/** The path of an entry in Alles bearbeiten (a single has no entry id in its path). */
export function entryPath(slug: string, schema: Schema | undefined, brick: string, entry: string): string {
  return schema?.bricks[brick]?.kind === 'single' ? `/s/${slug}/all/${brick}` : `/s/${slug}/all/${brick}/${entry}`
}

/** Fields a list can be sorted by, in schema order. */
const SORTABLE = new Set(['text', 'number', 'date', 'daterange', 'money'])
export function sortableFields(brick: Brick): [string, Brick['fields'][string]][] {
  return ordered(brick.fields).filter(([, field]) => !field.retired && SORTABLE.has(field.type))
}
