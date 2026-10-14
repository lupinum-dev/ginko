<!-- One entry of a collection, or a new one (/new). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Skeleton } from '@studio/components/ui/skeleton'

definePageMeta({ layout: 'site', convexAuth: true })
const route = useRoute()
const { t } = useI18n()
const s = await useSiteData()
const { editable, tasksFor } = allAccess(s)
const key = computed(() => String(route.params.brick))
const id = computed(() => String(route.params.entry))
const brick = computed(() => s.schema.value?.bricks[key.value])
const access = computed(() => (brick.value ? tasksFor(key.value, brick.value) : undefined))
// Only this entry is read: a save of another entry sends this page nothing.
const read = useConvexQuery(api.entries.get, () => (id.value === 'new' ? 'skip' : { site: s.slug.value, entry: id.value }))
// Kept after someone else removes it, so the editor and the person's input stay (N1).
const { entry, removed: entryRemoved } = useKeptEntry(
  () => (id.value === 'new' ? undefined : id.value),
  () => { const e = read.data.value; return e && !e.deleted && e._id === id.value ? e : undefined },
)
/** The entry is still on its way (the answer may still be the one for the entry opened before): placeholders, not "this entry does not exist". */
const answered = computed(() => read.data.value === null || read.data.value?._id === id.value || !!read.error.value)
const loading = computed(() => id.value !== 'new' && !entry.value && !answered.value)
const back = computed(() => ({ to: `/s/${s.slug.value}/all/${key.value}`, label: brick.value ? shownLabel(brick.value.label, s.main.value) : t('site.common.back') }))
const { shown } = useStudioSite()
useHead(() => ({ title: t('site.title.area', { area: brick.value ? shown(brick.value.label) : t('site.fallback.entry') }) }))

function created(entryId: string) { navigateTo(`/s/${s.slug.value}/all/${key.value}/${entryId}`, { replace: true }) }
function toList() { navigateTo(back.value.to) }
</script>

<template>
  <AllShell :slug="s.slug.value" :bricks="editable" :current="key" :back="back">
    <p v-if="!brick || brick.kind !== 'collection'" class="text-destructive">{{ t('site.area.missing') }}</p>
    <p v-else-if="!editable.some(([k]) => k === key)" class="text-destructive">{{ t('site.area.noAccess') }}</p>
    <div v-else-if="loading" class="grid max-w-180 gap-4" role="status" :aria-label="t('entry.loading')">
      <Skeleton class="h-7 w-2/3" />
      <Skeleton class="h-10" />
      <Skeleton class="h-24" />
    </div>
    <p v-else-if="id !== 'new' && !entry" class="text-destructive">{{ t('site.entry.missing') }}</p>
    <EntryEditor
      v-else-if="s.site.value && s.schema.value"
      :key="id"
      :site="s.site.value" :schema="s.schema.value" :brick-key="key" :brick="brick" :entry="entry"
      :tasks="access?.all ? undefined : access"
      :can-remove="!!access && (access.all || !!access.remove)"
      :removed="entryRemoved"
      @created="created" @removed="toList"
    />
  </AllShell>
</template>
