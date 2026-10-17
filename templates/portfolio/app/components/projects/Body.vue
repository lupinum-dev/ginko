<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

/**
 * A project's page below its title (the projects feature shows it instead of its photo and text): all photos large
 * and one below the other with their descriptions, each opening the lightbox, then the facts (client, year, place,
 * scope) right above the text, the next project in the studio's order (after the last, the first), and the way to
 * start a project with the email, phone and address of content/site.md. The CreativeWork JSON-LD comes from
 * app/composables/useProjectJsonLd.ts.
 */
const props = defineProps<{ project: GinkoItem<'projects'> }>()
const projects = useGinko('projects')
const start = useStartProject()
const { t } = useI18n()
const data = computed(() => props.project.data)
const facts = computed(() => [
  { key: 'client', label: t('project.client'), value: data.value.client },
  { key: 'year', label: t('project.year'), value: data.value.year === undefined ? undefined : String(data.value.year) },
  { key: 'place', label: t('project.place'), value: data.value.place },
  { key: 'scope', label: t('project.scope'), value: data.value.scope },
].filter((fact): fact is { key: string, label: string, value: string } => !!fact.value))
// On phones two columns: client and year share a row when both are there; every other fact takes the whole row, so
// no fact sits next to an empty half.
const half = (key: string) => (key === 'client' || key === 'year') && facts.value.filter((fact) => fact.key === 'client' || fact.key === 'year').length === 2
const photos = computed(() => projectPhotos(props.project))
const next = computed(() => {
  const items = projects.value.items
  const i = items.findIndex((item) => item.id === props.project.id)
  return items.length > 1 && i >= 0 ? items[(i + 1) % items.length] : undefined
})
</script>

<template>
  <div>
    <div class="mx-auto flex max-w-page flex-col gap-10 px-gutter md:gap-12">
      <section v-if="photos.length" :aria-label="t('project.photos')">
        <BlockGallery :images="photos" stack captions />
      </section>
      <section v-if="facts.length" :aria-label="t('project.facts')">
        <dl class="grid grid-cols-2 gap-x-6 gap-y-5 border-y py-6 md:grid-cols-4">
          <div v-for="fact in facts" :key="fact.key" class="flex min-w-0 flex-col gap-1" :class="!half(fact.key) && 'max-md:col-span-2'">
            <dt class="text-small text-muted-foreground">{{ fact.label }}</dt>
            <dd class="wrap-break-word hyphens-auto" :class="fact.key === 'year' && 'tabular-nums'">{{ fact.value }}</dd>
          </div>
        </dl>
      </section>
    </div>
    <ProseBody :value="data.body" class="pt-10 md:pt-12" />
    <nav v-if="next" :aria-label="t('project.next')" class="mx-auto max-w-page px-gutter pt-section print:hidden">
      <NuxtLink :to="next.url" class="group flex items-center justify-between gap-6 border-t pt-8">
        <span class="flex min-w-0 flex-col gap-2">
          <span class="text-small text-muted-foreground">{{ t('project.next') }}</span>
          <span class="font-display text-h2 wrap-break-word hyphens-auto underline-offset-4 group-hover:underline">{{ next.data.title }}</span>
        </span>
        <ArrowRight class="size-6 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </nav>
    <BlockCta v-if="start" :title="t('project.cta.title')" :text="t('project.cta.text')" :action="{ label: t('start.action'), to: start }">
      <SiteContact />
    </BlockCta>
  </div>
</template>
