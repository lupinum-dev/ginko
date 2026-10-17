// Field groups (display only): the Studio form shows grouped fields under a heading or in tabs.
import type { Field, Fields, Label } from '@lupinum/ginko'

export interface FieldGroup {
  /** Id of the group, safe in a DOM id (tab values become element ids): `group-1`, `group-2` … in the order of each group's first field. */
  id: string
  label: Label
  fields: [string, Field][]
}

/**
 * Splits fields into the ones without a `group` and the groups, in the order of each group's first field.
 * A group without fields cannot appear; callers filter `fields` first (hidden or task-less fields).
 */
export function groupFields(fields: Fields): { ungrouped: [string, Field][]; groups: FieldGroup[] } {
  const ungrouped: [string, Field][] = []
  const groups = new Map<string, FieldGroup>()
  for (const entry of Object.entries(fields)) {
    const label = entry[1].group
    if (label === undefined) { ungrouped.push(entry); continue }
    // The same label, also as a Label object, is the same group.
    const key = typeof label === 'string' ? label : JSON.stringify(Object.entries(label).sort(([a], [b]) => a.localeCompare(b)))
    const group = groups.get(key)
    if (group) group.fields.push(entry)
    else groups.set(key, { id: `group-${groups.size + 1}`, label, fields: [entry] })
  }
  return { ungrouped, groups: [...groups.values()] }
}
