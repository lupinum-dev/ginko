// The person's unsaved input that this browser kept (N2), one row per form with the way back to it: Today's
// "Wartet auf dich" tiles and Content's list (LocalDraftList). Restoring stays the form's own offer (LocalDraftOffer).
import type { Locale, Task } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { listLocalDrafts } from './useLocalDraft'
import { entryPath } from '../utils/basics'
import { shownLabel } from '../utils/labels'
import { deviceZone, whenText } from '../utils/when'

export interface LocalDraftRow {
  /** The draft's target: an entry id, `new:<brick>` or `task:<brick>.<task>`. */
  key: string
  /** "„title“ · time", or "area: new entry · time". */
  text: string
  /** The same without the time: "„title“", or "area: new entry". */
  label: string
  name: string
  area: string
  time: string
  /** Where the input was typed: an entry or a new entry in Content… */
  to?: string
  /** …or a create task's sheet. */
  task?: { brick: string; task: Task }
}

export function useLocalDraftRows(props: {
  slug: string
  schema: Schema
  main: Locale
  /** The areas the person may open in Content. */
  bricks: readonly string[]
  /** The person's create task `id` of area `brick`, for input typed in its sheet; undefined when they may not use it. */
  taskOf: (brick: string, id: string) => Task | undefined
}) {
  const { t, format } = useI18n()
  const auth = useConvexAuth()
  // Browser storage exists only in the browser: read once mounted, and again when the signed-in person becomes known.
  const mounted = ref(false)
  onMounted(() => { mounted.value = true })
  return computed<LocalDraftRow[]>(() => {
    const user = auth.user.value?.id
    if (!mounted.value || !user) return []
    return listLocalDrafts(props.slug, user).flatMap((d): LocalDraftRow[] => {
      // `task:<brick>.<task>` (a create task's sheet), `new:<brick>` (a new entry), else the entry id.
      const [kind, rest = ''] = d.target.includes(':') ? d.target.split(/:(.*)/) : ['entry', d.target]
      const brickKey = kind === 'task' ? rest.slice(0, rest.lastIndexOf('.')) : kind === 'new' ? rest : d.brick
      const brick = brickKey ? props.schema.bricks[brickKey] : undefined
      if (!brickKey || !brick) return []
      const area = shownLabel(brick.label, props.main)
      const time = whenText(d.savedAt, deviceZone(), format)
      const name = kind === 'entry' ? (d.title ?? area) : d.title
      const text = name ? t('site.quick.drafts.titled', { title: name, time }) : t('site.quick.drafts.untitled', { area, time })
      const label = name ? t('site.quick.drafts.name', { title: name }) : t('site.quick.drafts.newIn', { area })
      if (kind === 'task') {
        const task = props.taskOf(brickKey, rest.slice(rest.lastIndexOf('.') + 1))
        return task ? [{ key: d.target, text, label, name: name || area, area, time, task: { brick: brickKey, task } }] : []
      }
      if (!props.bricks.includes(brickKey)) return []
      return [{ key: d.target, text, label, name: name || area, area, time, to: kind === 'new' ? `/s/${props.slug}/all/${brickKey}/new` : entryPath(props.slug, props.schema, brickKey, d.target) }]
    })
  })
}
