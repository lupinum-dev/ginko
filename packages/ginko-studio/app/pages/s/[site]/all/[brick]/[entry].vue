<!-- One entry of a collection, or a new one (/new). -->
<script setup lang="ts">
definePageMeta({ layout: 'site', convexAuth: true })
const route = useRoute()
const { t } = useI18n()
const s = await useSiteData()
const { editable, tasksFor } = allAccess(s)
const key = computed(() => String(route.params.brick))
const id = computed(() => String(route.params.entry))
const brick = computed(() => s.schema.value?.bricks[key.value])
const access = computed(() => (brick.value ? tasksFor(key.value, brick.value) : undefined))
const entry = computed(() => (id.value === 'new' ? undefined : s.entries.value.find((e) => e._id === id.value)))
const back = computed(() => ({ to: `/s/${s.slug.value}/all/${key.value}`, label: brick.value ? shownLabel(brick.value.label, s.main.value) : t('site.common.back') }))
const { shown } = useStudioSite()
useHead(() => ({ title: t('site.title.area', { area: brick.value ? shown(brick.value.label) : t('site.fallback.entry') }) }))

function created(entryId: string) { navigateTo(`/s/${s.slug.value}/all/${key.value}/${entryId}`, { replace: true }) }
function removed() { navigateTo(back.value.to) }
</script>

<template>
  <AllShell :slug="s.slug.value" :bricks="editable" :current="key" :back="back">
    <p v-if="!brick || brick.kind !== 'collection'" class="text-destructive">{{ t('site.area.missing') }}</p>
    <p v-else-if="!editable.some(([k]) => k === key)" class="text-destructive">{{ t('site.area.noAccess') }}</p>
    <p v-else-if="id !== 'new' && !entry" class="text-destructive">{{ t('site.entry.missing') }}</p>
    <EntryEditor
      v-else-if="s.site.value && s.schema.value"
      :key="id"
      :site="s.site.value" :schema="s.schema.value" :brick-key="key" :brick="brick" :entry="entry" :entries="s.entries.value"
      :tasks="access?.all ? undefined : access"
      :can-remove="!!access && (access.all || !!access.remove)"
      @created="created" @removed="removed"
    />
  </AllShell>
</template>
