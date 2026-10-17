<!-- Verlauf (UI.md 7): every change of the site, newest first, each with Rückgängig where it still works.
     Older pages load on demand; every loaded page stays live (see ChangeRows). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { Button } from '@studio/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { entryPath } from '../../../../utils/basics'
import { titleOf } from '../../../../utils/content'
definePageMeta({ layout: 'site' })

const { t } = useI18n()
const s = await useSiteData()
const route = useRoute()
const { shown } = useStudioSite()
useHead(() => ({ title: t('site.title.history', { site: s.site.value?.name ?? t('site.fallback.site') }) }))

// UI.md 10.5: All · Mine · Via AI · This entry (only when opened with `?entry=`, from an entry's "History of this entry").
type Filter = 'all' | 'mine' | 'ai' | 'entry'
const entry = computed(() => (typeof route.query.entry === 'string' ? route.query.entry : undefined))
const filter = ref<Filter>(entry.value ? 'entry' : 'all')

// The entry the page was opened for: its name in the heading and the way back to it. An unknown id (null) keeps
// the plain heading; a removed entry still has its name.
const opened = useConvexQuery(api.entries.get, () => (entry.value ? { site: s.slug.value, entry: entry.value } : 'skip'))
const entryTitle = computed(() => {
  const found = opened.data.value
  const brick = found && s.schema.value && Object.hasOwn(s.schema.value.bricks, found.brick) ? s.schema.value.bricks[found.brick] : undefined
  if (!found || !brick) return undefined
  return brick.kind === 'single' ? shown(brick.label) : titleOf(brick, found.data, s.main.value)
})
const heading = computed(() => (filter.value === 'entry' && entryTitle.value ? t('history.entryHeading', { title: entryTitle.value }) : t('site.history.heading')))
const back = computed(() => {
  const found = opened.data.value
  return found && entryTitle.value ? { to: entryPath(s.slug.value, s.schema.value, found.brick, found._id), label: t('history.backToEntry', { title: entryTitle.value }) } : undefined
})
const filters = computed<{ id: Filter; label: string }[]>(() => [
  { id: 'all', label: t('history.filter.all') },
  { id: 'mine', label: t('history.filter.mine') },
  { id: 'ai', label: t('history.filter.ai') },
  ...(entry.value ? [{ id: 'entry' as const, label: t('history.filter.entry') }] : []),
])
</script>

<template>
  <div class="w-full max-w-[760px] px-4 pt-4 min-[720px]:px-6 min-[720px]:pt-8">
    <Button v-if="back" as-child variant="link" class="mb-1 h-11 gap-1.5 px-0 font-semibold">
      <NuxtLink :to="back.to"><span aria-hidden="true">←</span> {{ back.label }}</NuxtLink>
    </Button>
    <h1 class="mb-5 text-xl font-semibold tracking-tight">{{ heading }}</h1>
    <SiteZoneNote v-if="s.schema.value" :zone="s.schema.value.timeZone" class="-mt-3 mb-5" />

    <template v-if="s.schema.value">
      <ToggleGroup
        type="single" variant="segmented" class="mb-4 max-w-full flex-wrap" :aria-label="t('history.filter.label')"
        :model-value="filter" @update:model-value="(next) => { if (next) filter = next as Filter }"
      >
        <ToggleGroupItem v-for="f in filters" :key="f.id" :value="f.id" class="px-3">{{ f.label }}</ToggleGroupItem>
      </ToggleGroup>
      <OwnProposals :site="s.slug.value" :schema="s.schema.value" :filter="filter" :entry="entry" :manager="s.isManager.value" :grants="s.grants.value" />
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
