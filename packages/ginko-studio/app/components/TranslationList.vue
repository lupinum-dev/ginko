<!-- Übersetzungen (UI.md 10.6): the entries of all areas whose texts are missing or outdated in another language.
     The single pages come first in one card; the list areas follow in one card, in the site's order, each under a small
     area subheader. Each row names the language and what is missing there and opens the entry in that language.
     "Noch nicht online" marks a page that the website leaves out in that language until its texts are translated. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { Badge } from '@studio/components/ui/badge'
import { Skeleton } from '@studio/components/ui/skeleton'
import { opErrorOf } from '../composables/useOps'
import { languageName } from '../utils/content'
import { useStudioSite } from '../utils/labels'

const props = defineProps<{ slug: string; bricks: [string, Brick][]; /** The site's languages besides the main one. */ foreign: readonly string[] }>()
const { t, locale: uiLocale } = useI18n()
const { shown } = useStudioSite()

const status = useConvexQuery(api.sites.translationStatus, () => ({ site: props.slug, language: uiLocale.value }))
type Row = NonNullable<typeof status.data.value>['entries'][number]
// Only the areas the person may open (staff see the areas of their tasks).
const areas = computed(() => new Map(props.bricks))
// Singles together: each is one row named by its area, so a subheader per single would repeat the name.
const singles = computed(() => (status.data.value?.entries ?? []).filter((row) => areas.value.get(row.brick)?.kind === 'single'))
const sections = computed(() => {
  const data = status.data.value
  if (!data) return []
  return props.bricks
    .filter(([, def]) => def.kind === 'collection')
    .map(([brick, def]) => ({ key: brick, title: shown(def.label), rows: data.entries.filter((row) => row.brick === brick) }))
    .filter((section) => section.rows.length)
})
const listed = computed(() => singles.value.length + sections.value.reduce((sum, section) => sum + section.rows.length, 0))
// With more than one foreign language, two rows of one entry differ only by their language: say it in the link's name.
const languageOf = (row: Row) => (props.foreign.length > 1 ? languageName(row.locale, uiLocale.value) : '')
const areaOf = (row: Row) => shown(areas.value.get(row.brick)!.label)
const linkOf = (row: Row) => areas.value.get(row.brick)!.kind === 'single'
  ? `/s/${props.slug}/all/${row.brick}?lang=${row.locale}`
  : `/s/${props.slug}/all/${row.brick}/${row.entry}?lang=${row.locale}`
</script>

<template>
  <section aria-labelledby="translations-title">
    <header class="mb-6">
      <h1 id="translations-title" class="text-[1.375rem] font-semibold tracking-tight">{{ t('site.translations.heading') }}</h1>
      <p class="mt-1 max-w-[65ch] text-muted-foreground min-[900px]:text-sm">{{ t('site.translations.lede') }}</p>
    </header>
    <p v-if="status.error.value" class="font-medium text-destructive" role="alert">{{ opErrorOf(status.error.value, t('basics.loadFailed')).message }}</p>
    <div v-else-if="!status.data.value" class="divide-y overflow-hidden rounded-xl border bg-card">
      <p class="sr-only" role="status">{{ t('entry.loading') }}</p>
      <div v-for="n in 3" :key="n" class="grid min-h-16 content-center gap-2 px-4 py-3" aria-hidden="true"><Skeleton class="h-4 w-1/3" /><Skeleton class="h-3 w-40" /></div>
    </div>
    <p v-else-if="!singles.length && !sections.length" class="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground min-[900px]:text-sm">{{ t('site.translations.none') }}</p>
    <div v-else class="grid gap-6">
      <section v-if="singles.length" aria-labelledby="translations-singles">
        <h2 id="translations-singles" class="mb-3 text-base font-semibold">{{ t('site.all.singles') }}</h2>
        <ul class="m-0 list-none divide-y overflow-hidden rounded-xl border bg-card p-0">
          <li v-for="row in singles" :key="`${row.entry}-${row.locale}`" class="relative flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03] sm:flex-nowrap">
            <!-- A single (and an entry without a title yet) is named by its area. The link covers the row. -->
            <NuxtLink :to="linkOf(row)" class="line-clamp-2 min-w-0 flex-1 font-medium text-foreground no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/80 focus-visible:after:ring-inset min-[900px]:text-sm">{{ row.title ?? areaOf(row) }}<span v-if="languageOf(row)" class="sr-only"> · {{ languageOf(row) }}</span></NuxtLink>
            <!-- Phones: badges move under the title so the name keeps the full width. -->
            <div class="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:basis-full sm:justify-end">
              <Badge v-if="row.hidden" variant="soft">{{ t('site.translations.notOnline') }}</Badge>
              <TranslationBadges :locale="row.locale" :missing="row.missing" :outdated="row.outdated" />
            </div>
          </li>
        </ul>
      </section>
      <div v-if="sections.length" class="divide-y overflow-hidden rounded-xl border bg-card">
        <section v-for="section in sections" :key="section.key" :aria-labelledby="`translations-${section.key}`">
          <h2 :id="`translations-${section.key}`" class="bg-sidebar px-4 py-2 text-[13px] font-medium text-muted-foreground">{{ section.title }}</h2>
          <ul class="m-0 list-none divide-y border-t p-0">
            <li v-for="row in section.rows" :key="`${row.entry}-${row.locale}`" class="relative flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03] sm:flex-nowrap">
            <!-- A single (and an entry without a title yet) is named by its area. The link covers the row. -->
            <NuxtLink :to="linkOf(row)" class="line-clamp-2 min-w-0 flex-1 font-medium text-foreground no-underline outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/80 focus-visible:after:ring-inset min-[900px]:text-sm">{{ row.title ?? areaOf(row) }}<span v-if="languageOf(row)" class="sr-only"> · {{ languageOf(row) }}</span></NuxtLink>
            <!-- Phones: badges move under the title so the name keeps the full width. -->
            <div class="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:basis-full sm:justify-end">
              <Badge v-if="row.hidden" variant="soft">{{ t('site.translations.notOnline') }}</Badge>
              <TranslationBadges :locale="row.locale" :missing="row.missing" :outdated="row.outdated" />
            </div>
          </li>
          </ul>
        </section>
      </div>
    </div>
    <p v-if="status.data.value?.truncated" class="mt-3 text-sm text-muted-foreground">{{ t('site.translations.truncated', { count: listed }) }}</p>
  </section>
</template>
