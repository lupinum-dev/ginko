// A stored-form brick as a brick of the written form. The ready-made bricks ('@lupinum/ginko/patterns', the gastro
// preset) are made with it from the brick functions of 0.18, so each has exactly the stored names, limits and tasks
// its function has: a site that takes the pattern in place of the function call keeps its model. `defineSite` turns
// the result back into the same stored brick (test/patterns.test.ts proves it for every pattern).
//
// Where a brick lives and its address are not taken over: they are facts of the site file (`studio`, `entries`).
import type { Brick, CollectionBrick, Fields, Label, SingleBrick, Task } from '../core/types.ts'
import { DEF, type BrickDef, type CollectionDef, type CollectionStatusInput, type SingleDef, type TaskInput } from './bricks.ts'

/** The written task for a stored task: its id, label, kind and fields are stated, so nothing is made up from a default. */
function taskOf(task: Task, collection: boolean): TaskInput {
  const more = { ...('prefill' in task && task.prefill ? { prefill: task.prefill } : {}), ...(task.needsApproval ? { needsApproval: true } : {}) }
  if (task.kind === 'remove') return { id: task.id, label: task.label, kind: 'remove', ...more }
  if (task.kind === 'create') return { id: task.id, label: task.label, kind: 'add', ...(task.fields ? { fields: task.fields } : {}), ...more }
  // The written form asks "which entry" before every edit of a collection; a stored task without `pick` would change.
  if (collection !== (task.pick === true)) throw new Error(`defOf: the edit task “${task.id}” ${collection ? 'of a collection has no `pick: true`' : 'of a single has `pick`'}.`)
  return { id: task.id, label: task.label, kind: 'edit', fields: task.fields, ...more }
}

/** The brick `brick` in the written form. `item` is the word for one entry, for the standard tasks of a site that changes the brick with `extend`. */
export function defOf<const F extends Fields>(brick: SingleBrick<F>): SingleDef<F>
export function defOf<const F extends Fields>(brick: CollectionBrick<F>, more?: { item?: Label }): CollectionDef<F>
export function defOf(brick: Brick, more: { item?: Label } = {}): BrickDef {
  const common = {
    [DEF]: true as const,
    label: brick.label,
    ...(brick.describe !== undefined ? { describe: brick.describe } : {}),
    fields: brick.fields,
    ...(brick.body !== undefined ? { body: brick.body } : {}),
    ...(brick.preview !== undefined ? { preview: brick.preview } : {}),
    ...(brick.layout ? { layout: brick.layout } : {}),
    ...(brick.tasks ? { tasks: brick.tasks.map((task) => taskOf(task, brick.kind === 'collection')) } : {}),
    ...(brick.planned ? { planned: brick.planned } : {}),
  }
  if (brick.kind === 'single') {
    const hours = brick.status?.hours
    return { ...common, kind: 'single', ...(hours ? { status: { show: 'opening-hours' as const, ...(hours === true ? {} : { plans: hours.plans }) } } : {}) }
  }
  const { visible, status } = brick
  if (visible && visible.mode !== 'until') throw new Error('defOf: `visible: { mode: \'always\' }` has no written form; leave it out.')
  const line: CollectionStatusInput | undefined = !status ? undefined
    : 'next' in status ? { show: 'next', field: status.next }
    : 'count' in status ? { show: 'ending' }
    : 'missing' in status ? { show: 'missing', field: status.missing }
    : { show: 'newest', field: status.age }
  return {
    ...common,
    kind: 'collection',
    ...(more.item !== undefined ? { item: more.item } : {}),
    max: brick.max,
    order: brick.order,
    listing: brick.listing,
    ...(brick.tree ? { tree: brick.tree } : {}),
    ...(visible ? { showUntil: { field: visible.field, ...(visible.days !== undefined ? { plusDays: visible.days } : {}), ...(visible.deleteExpired ? { thenDelete: true } : {}) } } : {}),
    ...(brick.untranslated ? { untranslated: brick.untranslated } : {}),
    ...(brick.publishedOn ? { publishedOn: brick.publishedOn } : {}),
    ...(brick.plans ? { plans: brick.plans } : {}),
    ...(line ? { status: line } : {}),
  }
}
