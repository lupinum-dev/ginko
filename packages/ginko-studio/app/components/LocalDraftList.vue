<!-- Heute: the person's unsaved input that this browser kept (N2) after a crash, a reload or a closed tab, with a way
     back to each form. Restoring stays the form's own offer (LocalDraftOffer); this list never applies anything. -->
<script setup lang="ts">
import type { Locale, Task } from '@lupinum/ginko'
import type { Schema } from '@lupinum/ginko/internal'
import { Button } from '@studio/components/ui/button'
import { listLocalDrafts } from '../composables/useLocalDraft'
import { entryPath } from '../utils/basics'
import { shownLabel } from '../utils/labels'
import { deviceZone, whenText } from '../utils/when'

const props = defineProps<{
  slug: string
  schema: Schema
  main: Locale
  /** The areas the person may open in Alles bearbeiten. */
  bricks: readonly string[]
  /** The person's create task `id` of area `brick`, for input typed in its sheet; undefined when they may not use it. */
  taskOf: (brick: string, id: string) => Task | undefined
}>()
const emit = defineEmits<{ task: [brick: string, task: Task] }>()
const { t, format } = useI18n()
const auth = useConvexAuth()

interface Row { key: string; text: string; to?: string; task?: { brick: string; task: Task } }
// Browser storage exists only in the browser: read once mounted, and again when the signed-in person becomes known.
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const rows = computed<Row[]>(() => {
  const user = auth.user.value?.id
  if (!mounted.value || !user) return []
  return listLocalDrafts(props.slug, user).flatMap((d): Row[] => {
    // `task:<brick>.<task>` (a create task's sheet), `new:<brick>` (a new entry), else the entry id.
    const [kind, rest = ''] = d.target.includes(':') ? d.target.split(/:(.*)/) : ['entry', d.target]
    const brickKey = kind === 'task' ? rest.slice(0, rest.lastIndexOf('.')) : kind === 'new' ? rest : d.brick
    const brick = brickKey ? props.schema.bricks[brickKey] : undefined
    if (!brickKey || !brick) return []
    const area = shownLabel(brick.label, props.main)
    const time = whenText(d.savedAt, deviceZone(), format)
    const name = kind === 'entry' ? (d.title ?? area) : d.title
    const text = name ? t('site.quick.drafts.titled', { title: name, time }) : t('site.quick.drafts.untitled', { area, time })
    if (kind === 'task') {
      const task = props.taskOf(brickKey, rest.slice(rest.lastIndexOf('.') + 1))
      return task ? [{ key: d.target, text, task: { brick: brickKey, task } }] : []
    }
    if (!props.bricks.includes(brickKey)) return []
    return [{ key: d.target, text, to: kind === 'new' ? `/s/${props.slug}/all/${brickKey}/new` : entryPath(props.slug, props.schema, brickKey, d.target) }]
  })
})
</script>

<template>
  <section v-if="rows.length" class="mb-7 grid gap-3" aria-labelledby="local-drafts">
    <h2 id="local-drafts" class="text-[17px] font-semibold">{{ t('site.quick.drafts.heading') }}</h2>
    <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="(row, i) in rows" :key="row.key" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0">
        <span :id="`local-draft-${i}`" class="min-w-0 flex-1 break-words">{{ row.text }}</span>
        <Button v-if="row.to" as-child variant="outline" size="sm"><NuxtLink :to="row.to" :aria-describedby="`local-draft-${i}`">{{ t('site.quick.drafts.continue') }}</NuxtLink></Button>
        <Button v-else-if="row.task" type="button" variant="outline" size="sm" :aria-describedby="`local-draft-${i}`" @click="emit('task', row.task.brick, row.task.task)">{{ t('site.quick.drafts.continue') }}</Button>
      </li>
    </ul>
  </section>
</template>
