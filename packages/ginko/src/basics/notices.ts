// Short notices on the website ("Closed on Friday for a private party"), each until a date, then removed.
import { f } from '../core/fields.ts'
import { collection } from '../core/site.ts'
import type { Task } from '../core/types.ts'
import { both, sourceOf, type BasicsOptions } from './hours-bricks.ts'

const noticeFields = () => ({
  text: f.text(both('Text', 'Text'), { max: 140 }),
  until: f.date(both('Gilt bis', 'Shown until'), {
    optional: true,
    hint: both('Leer lassen, wenn der Hinweis bleiben soll, bis du ihn entfernst.', 'Leave empty to keep the notice until you remove it.'),
  }),
})

/** A task of the notices brick; a preset adds its own quick tasks first (the gastro preset: "Fully booked today"). */
export type NoticeTask = Task<ReturnType<typeof noticeFields>>

/** @internal The notices with a preset's tasks before the standard ones; sites use `notices()`. */
export function noticesBrick(opts: BasicsOptions, first: readonly NoticeTask[]) {
  return collection({
    label: both('Hinweise', 'Notices'),
    ...sourceOf(opts),
    fields: noticeFields(),
    max: 5,
    order: 'manual',
    visible: { mode: 'until', field: 'until', deleteExpired: true },
    tasks: [
      ...first,
      { id: 'add', label: both('Hinweis hinzufügen', 'Add a notice'), kind: 'create' },
      { id: 'remove', label: both('Hinweis entfernen', 'Remove a notice'), kind: 'remove' },
    ],
  })
}

/** At most 5 notices in the owner's order; a notice with `until` leaves the site after that day and is then deleted. */
export function notices(opts: BasicsOptions = {}) {
  return noticesBrick(opts, [])
}
