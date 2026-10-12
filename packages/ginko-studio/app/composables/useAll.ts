// What a person may edit in Alles bearbeiten. Owners and admins: everything. Staff: the bricks of
// their granted tasks, through the granted edit task with the most fields (the server checks one task per save).
import type { Brick, Task } from '@lupinum/ginko'
import { taskRef } from '../utils/content'

export function allAccess(s: Awaited<ReturnType<typeof useSiteData>>) {
  const editable = computed(() => s.bricks.value.filter(([key, brick]) => s.isManager.value || (brick.tasks ?? []).some((t) => s.may(key, t))))
  function tasksFor(key: string, brick: Brick) {
    if (s.isManager.value) return { all: true as const }
    const mine = (brick.tasks ?? []).filter((t) => s.may(key, t))
    const edits = mine.filter((t): t is Extract<Task, { kind: 'edit' }> => t.kind === 'edit').sort((a, b) => b.fields.length - a.fields.length)
    const create = mine.find((t) => t.kind === 'create')
    const remove = mine.find((t) => t.kind === 'remove')
    return {
      all: false as const,
      save: edits[0] ? taskRef(key, edits[0]) : undefined,
      fields: edits[0]?.fields ?? [],
      create: create ? taskRef(key, create) : undefined,
      remove: remove ? taskRef(key, remove) : undefined,
    }
  }
  return { editable, tasksFor }
}
