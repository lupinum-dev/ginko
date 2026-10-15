// What a person may edit in Alles bearbeiten. Owners and admins: everything. Staff: the bricks of
// their granted tasks, through the granted edit task with the most fields (the server checks one task per save).
// An entry the staff member created (`own`, from entries.get) they change with their create task, every field
// (SPEC 2.7, lib/access.ts `authorize`).
import type { Brick, Task } from '@lupinum/ginko'
import { taskRef } from '../utils/content'

export function allAccess(s: Awaited<ReturnType<typeof useSiteData>>) {
  const editable = computed(() => s.bricks.value.filter(([key, brick]) => s.isManager.value || (brick.tasks ?? []).some((t) => s.may(key, t))))
  function tasksFor(key: string, brick: Brick, entry?: { own?: boolean }) {
    if (s.isManager.value) return { all: true as const }
    const mine = (brick.tasks ?? []).filter((t) => s.may(key, t))
    const edits = mine.filter((t): t is Extract<Task, { kind: 'edit' }> => t.kind === 'edit').sort((a, b) => b.fields.length - a.fields.length)
    const create = mine.find((t) => t.kind === 'create')
    const remove = mine.find((t) => t.kind === 'remove')
    const own = !!entry?.own && !!create
    return {
      all: false as const,
      save: own ? taskRef(key, create) : edits[0] ? taskRef(key, edits[0]) : undefined,
      // Undefined: every field (the create task made the whole entry).
      fields: own ? undefined : edits[0]?.fields ?? [],
      create: create ? taskRef(key, create) : undefined,
      remove: remove ? taskRef(key, remove) : undefined,
      /** The tasks of this brick the person holds: the read-only note names them. */
      held: mine,
    }
  }
  return { editable, tasksFor }
}
