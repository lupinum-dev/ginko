<script setup lang="ts">
import { api } from '#convex/api'
import LocalDraftList from '../../../../components/LocalDraftList.vue'
import { allAccess } from '../../../../composables/useAll'
import { useCrumbs, usePanelBar } from '../../../../composables/usePageHeader'
import { readRecent, type RecentEntry } from '../../../../composables/useRecentEntries'
import { languageName } from '../../../../utils/content'
import { useStudioSite } from '../../../../utils/labels'
import { opErrorOf } from '../../../../composables/useOps'
import { changedText } from '../../../../utils/when'
import { Badge } from '@studio/components/ui/badge'
import { Skeleton } from '@studio/components/ui/skeleton'

definePageMeta({ layout: 'site' })
const { t, format, locale: uiLocale } = useI18n()
const { shown } = useStudioSite()
const s = await useSiteData()
const { editable } = allAccess(s)
// Unsaved input kept in this browser, as on Heute: an owner or admin without quick tasks starts here, never there.
// Input typed in a quick task's sheet opens on Heute only.
const openable = computed(() => editable.value.map(([key]) => key))
const noTask = () => undefined
// `?removed`: the removed entries of all areas; `?translations`: the open translations of all areas (UI.md 10.6).
const route = useRoute()
const removedView = computed(() => 'removed' in route.query)
const translationsView = computed(() => !removedView.value && 'translations' in route.query)
useHead(() => ({ title: t('site.title.all', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
useCrumbs(() => {
  const home = { label: t('nav.all'), to: `/s/${s.slug.value}/all` }
  if (removedView.value) return [home, { label: t('basics.removed.link') }]
  if (translationsView.value) return [home, { label: t('nav.translations') }]
  return [{ label: t('nav.all') }]
})

// Wide screens: the area list is the side column, so the page shows each area with its numbers and what was open
// last. Phones keep the plain area list here (AllNav) and the unsaved input.
// Decided once mounted (server, tests and phones render the phone page): wide while the panel's top bar shows.
const wide = usePanelBar()
const recent = ref<RecentEntry[]>([])
onMounted(() => { recent.value = readRecent(s.slug.value) })
const areas = useConvexQuery(api.sites.areas, () => (wide.value ? { site: s.slug.value } : 'skip'))
const byBrick = computed(() => new Map((areas.data.value ?? []).map((a) => [a.brick, a])))
const timeZone = computed(() => s.schema.value?.timeZone ?? 'Europe/Vienna')
// One foreign language (the usual case) is named; with more, the count covers them all.
const foreign = computed(() => s.schema.value?.locales.slice(1) ?? [])
const openText = (count: number) => foreign.value.length === 1
  ? t('site.all.translationsOpen', { lang: languageName(foreign.value[0]!, uiLocale.value), count })
  : t('nav.translationsOpen', { count })
/** Drafts, saved changes that are not online yet (SPEC 15), ended entries: what the area holds that the website does not show. */
const extras = (a: { kind: 'single' | 'collection'; drafts: number; changes: number; ended: number }) => [
  a.drafts ? t('site.all.drafts', { count: a.drafts }) : '',
  a.changes ? (a.kind === 'single' ? t('site.all.singleChanges') : t('site.all.changesCount', { count: a.changes })) : '',
  a.ended ? t('site.all.endedCount', { count: a.ended }) : '',
].filter(Boolean).join(' · ')
const grid = 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-4 px-4'
</script>

<template>
  <AllShell
    :slug="s.slug.value" :bricks="editable" :removed-active="removedView" :translations-active="translationsView"
    :back="removedView || translationsView ? { to: `/s/${s.slug.value}/all`, label: t('site.all.allAreas') } : undefined"
  >
    <div class="max-w-[1200px] pb-10 min-[900px]:pb-12">
      <RemovedList v-if="removedView" :slug="s.slug.value" :schema="s.schema.value" />
      <TranslationList v-else-if="translationsView" :slug="s.slug.value" :bricks="editable" :foreign="foreign" />
      <template v-else>
        <!-- The title row of StudioPage (AllShell already pads the cell). Staff see only the areas they hold a task in,
             so the page does not promise "everything". -->
        <header class="mb-6">
          <h1 class="text-[1.375rem] font-semibold tracking-tight">{{ s.isManager.value ? t('site.all.heading') : t('site.all.headingStaff') }}</h1>
          <p class="mt-1 max-w-[65ch] text-muted-foreground min-[900px]:text-sm">{{ s.isManager.value ? t('site.all.lede') : t('site.all.ledeStaff') }}</p>
        </header>
        <LocalDraftList v-if="s.schema.value" :slug="s.slug.value" :schema="s.schema.value" :main="s.main.value" :bricks="openable" :task-of="noTask" :recent="wide ? recent : undefined" />
        <AllNav class="list min-[900px]:hidden" :slug="s.slug.value" :bricks="editable" />
        <section v-if="wide && editable.length" aria-labelledby="all-areas">
          <!-- Staff: "All areas" would promise more than their areas, and the page title already names the list. -->
          <h2 id="all-areas" :class="s.isManager.value ? 'mb-3 text-base font-semibold' : 'sr-only'">{{ s.isManager.value ? t('site.all.allAreas') : t('site.all.headingStaff') }}</h2>
          <p v-if="areas.error.value" class="mb-3 font-medium text-destructive" role="alert">{{ opErrorOf(areas.error.value, t('basics.loadFailed')).message }}</p>
          <div class="overflow-hidden rounded-xl border bg-card">
            <!-- Column names for the eye; each cell says what it is in words, so the rows read on their own. -->
            <div :class="[grid, 'h-10 border-b text-xs font-medium text-muted-foreground']" aria-hidden="true">
              <span>{{ t('site.all.colArea') }}</span><span>{{ t('site.all.colContent') }}</span><span>{{ t('site.all.colChanged') }}</span><span>{{ t('nav.translations') }}</span>
            </div>
            <ul class="m-0 list-none divide-y p-0">
              <li v-for="[key, brick] in editable" :key="key" :class="[grid, 'relative min-h-12 py-2.5 text-sm hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]']">
                <NuxtLink :to="`/s/${s.slug.value}/all/${key}`" class="min-w-0 font-medium text-foreground no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/80 focus-visible:after:ring-inset">{{ shown(brick.label) }}</NuxtLink>
                <template v-if="byBrick.get(key)">
                  <span class="min-w-0 text-muted-foreground tabular-nums">
                    {{ brick.kind === 'single' ? t('site.all.single') : t('site.all.entries', { count: byBrick.get(key)!.count }) }}
                    <span v-if="extras(byBrick.get(key)!)" class="text-[13px] text-muted-foreground/75"> · {{ extras(byBrick.get(key)!) }}</span>
                  </span>
                  <span class="text-muted-foreground tabular-nums">
                    <template v-if="byBrick.get(key)!.changedAt"><span class="sr-only">{{ t('site.all.colChanged') }}: </span>{{ changedText(byBrick.get(key)!.changedAt!, timeZone, { t, format }) }}</template>
                  </span>
                  <span><Badge v-if="byBrick.get(key)!.translations" variant="warning">{{ openText(byBrick.get(key)!.translations) }}</Badge></span>
                </template>
                <!-- A failed answer leaves the cells empty (the alert above says why) instead of loading for ever. -->
                <template v-else-if="areas.error.value"><span /><span /><span /></template>
                <template v-else>
                  <Skeleton class="h-4 w-24" /><Skeleton class="h-4 w-16" /><span />
                </template>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </AllShell>
</template>
