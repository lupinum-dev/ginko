<!-- Übersetzungen (UI.md 10.6): the entries of all areas whose texts are missing or outdated in another language,
     one section per language, by area and the site's order. A row opens the entry in that language. "Noch nicht online"
     marks a page that the website leaves out in that language until its texts are translated. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { Badge } from '@studio/components/ui/badge'
import { opErrorOf } from '../composables/useOps'
import { languageLabel } from '../utils/content'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ slug: string; bricks: [string, Brick][] }>()
const { t, locale: uiLocale } = useI18n()
const { shown } = useStudioSite()

const status = useConvexQuery(api.sites.translationStatus, () => ({ site: props.slug, language: uiLocale.value }))
type Row = NonNullable<typeof status.data.value>['entries'][number]
// Only the areas the person may open (staff see the areas of their tasks).
const areas = computed(() => new Map(props.bricks))
const sections = computed(() => {
  const data = status.data.value
  if (!data) return []
  return data.locales
    .map((locale) => ({ locale, rows: data.entries.filter((row) => row.locale === locale && areas.value.has(row.brick)) }))
    .filter((section) => section.rows.length)
})
const listed = computed(() => sections.value.reduce((sum, section) => sum + section.rows.length, 0))
const areaOf = (row: Row) => shown(areas.value.get(row.brick)!.label)
const linkOf = (row: Row) => areas.value.get(row.brick)!.kind === 'single'
  ? `/s/${props.slug}/all/${row.brick}?lang=${row.locale}`
  : `/s/${props.slug}/all/${row.brick}/${row.entry}?lang=${row.locale}`
</script>

<template>
  <section aria-labelledby="translations-title">
    <h1 id="translations-title" class="text-xl font-semibold tracking-tight">{{ t('site.translations.heading') }}</h1>
    <p class="mt-1 text-sm text-muted-foreground">{{ t('site.translations.lede') }}</p>
    <p v-if="status.error.value" class="mt-3 font-medium text-destructive" role="alert">{{ opErrorOf(status.error.value, t('basics.loadFailed')).message }}</p>
    <p v-else-if="!status.data.value" class="mt-3 text-muted-foreground" role="status">{{ t('entry.loading') }}</p>
    <p v-else-if="!sections.length" class="mt-3 text-muted-foreground">{{ t('site.translations.none') }}</p>
    <section v-for="section in sections" :key="section.locale" class="mt-6" :aria-labelledby="`translations-${section.locale}`">
      <h2 :id="`translations-${section.locale}`" class="mb-2 text-base font-semibold">{{ languageLabel(section.locale, uiLocale) }}</h2>
      <ul class="m-0 list-none overflow-hidden rounded-xl border bg-card p-0">
        <li v-for="row in section.rows" :key="row.entry" class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0 sm:flex-nowrap">
          <div class="min-w-0 flex-1">
            <!-- A single (and an entry without a title yet) is named by its area. -->
            <NuxtLink :to="linkOf(row)" class="line-clamp-2 font-medium text-foreground no-underline hover:underline">{{ row.title ?? areaOf(row) }}</NuxtLink>
            <span v-if="row.title" class="block text-[13px] text-muted-foreground">{{ areaOf(row) }}</span>
          </div>
          <!-- Phones: badges move under the title so the name keeps the full width. -->
          <div class="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:basis-full sm:justify-end">
            <Badge v-if="row.hidden" variant="soft">{{ t('site.translations.notOnline') }}</Badge>
            <TranslationBadges :locale="row.locale" :missing="row.missing" :outdated="row.outdated" />
          </div>
        </li>
      </ul>
    </section>
    <p v-if="status.data.value?.truncated" class="mt-3 text-sm text-muted-foreground">{{ t('site.translations.truncated', { count: listed }) }}</p>
  </section>
</template>
