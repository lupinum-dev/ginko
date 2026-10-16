<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

/**
 * A project's page below its title (the projects feature shows it instead of its photo and text): the facts (client,
 * year, place, scope), all photos large and one below the other with their descriptions, each opening the lightbox,
 * the text, the next project in the studio's order (after the last, the first), and the way to start a project.
 * Adds the project's CreativeWork JSON-LD.
 */
const props = defineProps<{ project: GinkoItem<'projects'> }>()
const projects = useGinko('projects')
const start = useStartProject()
const site = useGinko('site')
const { name, url } = useGinkoSite()
const { t, language } = useI18n()
const data = computed(() => props.project.data)
const facts = computed(() => [
  { key: 'client', label: t('project.client'), value: data.value.client },
  { key: 'year', label: t('project.year'), value: data.value.year === undefined ? undefined : String(data.value.year) },
  { key: 'place', label: t('project.place'), value: data.value.place },
  { key: 'scope', label: t('project.scope'), value: data.value.scope },
].filter((fact): fact is { key: string, label: string, value: string } => !!fact.value))
const photos = computed(() => [...(data.value.image ? [data.value.image] : []), ...(data.value.photos ?? []).map((row) => row.image)])
const next = computed(() => {
  const items = projects.value.items
  const i = items.findIndex((item) => item.id === props.project.id)
  return items.length > 1 && i >= 0 ? items[(i + 1) % items.length] : undefined
})
const contact = computed(() => site.value.data)
const absolute = (path: string) => new URL(path, url).href
useHead(() => ({
  script: [{
    key: 'project-ld',
    type: 'application/ld+json',
    // `<` is escaped, so no value can close the script element early.
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: data.value.title,
      description: data.value.summary,
      url: props.project.url ? absolute(props.project.url) : undefined,
      image: photos.value.map((photo) => absolute(photo.url)),
      dateCreated: data.value.year === undefined ? undefined : String(data.value.year),
      locationCreated: data.value.place ? { '@type': 'Place', name: data.value.place } : undefined,
      creator: { '@type': 'Organization', name, url },
      inLanguage: language.value,
    }).replace(/</g, '\\u003c'),
  }],
}))
</script>

<template>
  <div>
    <div class="mx-auto flex max-w-page flex-col gap-10 px-gutter md:gap-12">
      <section v-if="facts.length" :aria-label="t('project.facts')">
        <dl class="grid grid-cols-2 gap-x-6 gap-y-5 border-y py-6 md:grid-cols-4">
          <div v-for="fact in facts" :key="fact.key" class="flex flex-col gap-1" :class="fact.key === 'scope' && 'max-md:col-span-2'">
            <dt class="text-small text-muted-foreground">{{ fact.label }}</dt>
            <dd :class="fact.key === 'year' && 'tabular-nums'">{{ fact.value }}</dd>
          </div>
        </dl>
      </section>
      <section v-if="photos.length" :aria-label="t('project.photos')">
        <BlockGallery :images="photos" stack captions />
      </section>
    </div>
    <ProseBody :value="data.body" class="pt-10 md:pt-12" />
    <nav v-if="next" :aria-label="t('project.next')" class="mx-auto max-w-page px-gutter pt-section print:hidden">
      <NuxtLink :to="next.url" class="group flex items-center justify-between gap-6 border-t pt-8">
        <span class="flex flex-col gap-2">
          <span class="text-small text-muted-foreground">{{ t('project.next') }}</span>
          <span class="font-display text-h2 underline-offset-4 group-hover:underline">{{ next.data.title }}</span>
        </span>
        <ArrowRight class="size-6 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </nav>
    <BlockCta v-if="start" :title="t('project.cta.title')" :text="t('project.cta.text')" :action="{ label: t('start.action'), to: start }">
      <p v-if="contact.phone" class="text-body">
        <a :href="telHref(contact.phone)" dir="ltr" class="inline-flex min-h-11 items-center font-medium tabular-nums underline underline-offset-4">{{ contact.phone }}</a>
      </p>
    </BlockCta>
  </div>
</template>
