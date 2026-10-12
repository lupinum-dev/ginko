// Small rules of the Studio basics (UI.md 10.6) as plain functions, so they can be tested without a Nuxt app.
import type { Brick } from '@lupinum/ginko'
import { ordered, type Schema } from '@lupinum/ginko/internal'
import { textIn } from '@lupinum/ginko-editor'
import { searchable, taskRef, type Data } from './content'

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

/** All words of an entry's text fields in every language, lower case without accents ("schnitz" finds "Schnitzel"). */
export function haystackOf(brick: Brick, data: Data, locales: readonly string[]): string {
  const parts: string[] = []
  for (const [key, field] of ordered(brick.fields)) {
    if (field.retired || (field.type !== 'text' && field.type !== 'longtext')) continue
    for (const locale of locales) parts.push(textIn(data[key], locale))
  }
  return searchable(parts.join(' '))
}

/** The comparable value of a field: text in the main language, a number, or a date string. */
function sortKey(field: Brick['fields'][string], value: unknown, main: string): string | number {
  if (value === undefined || value === null) return ''
  switch (field.type) {
    case 'number': return Number(value)
    case 'money': return (value as { amount: number }).amount
    case 'daterange': return (value as { from: string }).from
    case 'date': return String(value)
    default: return searchable(textIn(value as never, main))
  }
}

/** A sorted copy. Entries without a value come last, in either direction. */
export function sortRows<T extends { data: Data }>(rows: T[], brick: Brick, sort: { field: string; dir: 'asc' | 'desc' }, main: string): T[] {
  const field = brick.fields[sort.field]
  if (!field) return rows
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = sortKey(field, a.data[sort.field], main)
    const y = sortKey(field, b.data[sort.field], main)
    if (x === '' || x === undefined) return y === '' ? 0 : 1
    if (y === '' || y === undefined) return -1
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)))
  })
}
