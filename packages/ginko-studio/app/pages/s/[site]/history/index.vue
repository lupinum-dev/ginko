<!-- Verlauf (UI.md 7): every change of the site, newest first, each with Rückgängig where it still works.
     Older pages load on demand; every loaded page stays live (see ChangeRows). -->
<script setup lang="ts">
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
definePageMeta({ layout: 'site' })

const { t } = useI18n()
const s = await useSiteData()
const route = useRoute()
useHead(() => ({ title: t('site.title.history', { site: s.site.value?.name ?? t('site.fallback.site') }) }))

// UI.md 10.5: All · Mine · Via AI · This entry (only when opened with `?entry=`, from an entry's "History of this entry").
type Filter = 'all' | 'mine' | 'ai' | 'entry'
const entry = computed(() => (typeof route.query.entry === 'string' ? route.query.entry : undefined))
const filter = ref<Filter>(entry.value ? 'entry' : 'all')
const filters = computed<{ id: Filter; label: string }[]>(() => [
  { id: 'all', label: t('history.filter.all') },
  { id: 'mine', label: t('history.filter.mine') },
  { id: 'ai', label: t('history.filter.ai') },
  ...(entry.value ? [{ id: 'entry' as const, label: t('history.filter.entry') }] : []),
])
</script>

<template>
  <div class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8">
    <h1 class="mb-5 text-xl font-semibold tracking-tight">{{ t('site.history.heading') }}</h1>
    <SiteZoneNote v-if="s.schema.value" :zone="s.schema.value.timeZone" class="-mt-3 mb-5" />

    <template v-if="s.schema.value">
      <ToggleGroup
        type="single" variant="segmented" class="mb-4 max-w-full flex-wrap" :aria-label="t('history.filter.label')"
        :model-value="filter" @update:model-value="(next) => { if (next) filter = next as Filter }"
      >
        <ToggleGroupItem v-for="f in filters" :key="f.id" :value="f.id" class="px-3">{{ f.label }}</ToggleGroupItem>
      </ToggleGroup>
      <OwnProposals :site="s.slug.value" :schema="s.schema.value" :filter="filter" :entry="entry" />
      <ChangeRows
        :site="s.slug.value"
        :schema="s.schema.value"
        :manager="s.isManager.value"
        :grants="s.grants.value"
        :filter="filter"
        :entry="entry"
      />
    </template>
  </div>
</template>
