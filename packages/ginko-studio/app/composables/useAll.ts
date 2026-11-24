// What a person may edit in Alles bearbeiten. Owners and admins: everything. Staff: the bricks of
// their granted tasks, through the granted edit task with the most fields (the server checks one task per save).
// That choice is a rights search, not "the standard task": any held edit task gives the right to the fields it names,
// and the widest one leaves the most fields editable. A new entry here is the standard add task (id `add`, D85).
// An entry the staff member created (`own`, from entries.get) shows every field, as their create task made it (SPEC 2.7,
// lib/access.ts `authorize`: any held create task gives that right, so this is a rights search too). Its saves still go
// through a held edit task when one covers the changed fields, and through the create task only otherwise, as in the
// agent door (lib/agentTools.ts `taskFor`): the approval rule of an edit task stays the same for the fields it covers.
import type { Brick, Task } from '@lupinum/ginko'
import { taskRef } from '../utils/content'

export function allAccess(s: Awaited<ReturnType<typeof useSiteData>>) {
  const editable = computed(() => s.bricks.value.filter(([key, brick]) => s.isManager.value || (brick.tasks ?? []).some((t) => s.may(key, t))))
  function tasksFor(key: string, brick: Brick, entry?: { own?: boolean }) {
    if (s.isManager.value) return { all: true as const }
    const mine = (brick.tasks ?? []).filter((t) => s.may(key, t))
    const edits = mine.filter((t): t is Extract<Task, { kind: 'edit' }> => t.kind === 'edit').sort((a, b) => b.fields.length - a.fields.length)
    const add = mine.find((t) => t.id === 'add' && t.kind === 'create')
    const anyCreate = mine.find((t) => t.kind === 'create')
    const remove = mine.find((t) => t.id === 'remove' && t.kind === 'remove')
    const own = !!entry?.own && !!anyCreate
    const save = own ? taskRef(key, anyCreate) : edits[0] ? taskRef(key, edits[0]) : undefined
    return {
      all: false as const,
      save,
      /** An own entry: the task one save of these root fields goes through. */
      saveFor: own
        ? (roots: readonly string[]) => {
            const edit = edits.find((e) => roots.every((k) => e.fields.includes(k)))
            return edit ? taskRef(key, edit) : save
          }
        : undefined,
      // Undefined: every field (the create task made the whole entry).
      fields: own ? undefined : edits[0]?.fields ?? [],
      create: add ? taskRef(key, add) : undefined,
      remove: remove ? taskRef(key, remove) : undefined,
      /** The tasks of this brick the person holds: the read-only note names them. */
      held: mine,
    }
  }
  return { editable, tasksFor }
}
