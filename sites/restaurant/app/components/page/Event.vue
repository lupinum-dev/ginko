<script setup lang="ts">
import { eventJsonLd } from '@lupinum/ginko-preset-gastro'
import { siteName } from '../../utils/site'

const props = defineProps<{ slug: string }>()
const { lang } = useSite()
const path = useGinkoPath()
const { t } = useI18n()
const eventWhen = useEventWhen()
const event = useGinkoEntry('events', props.slug)
const contact = useGinko('contact')
const siteUrl = (useRuntimeConfig().public.ginko as { url: string }).url

// Event JSON-LD for search engines: the event's dates, place, price and booking link as the page shows them.
const eventLd = computed(() => {
  const e = event.value.data
  return eventJsonLd({
    title: e.title,
    url: new URL(event.value.url, siteUrl).href,
    when: e.when,
    start: e.start,
    location: { name: siteName, address: { street: contact.value.data.street, postalCode: contact.value.data.postalCode, city: contact.value.data.city, country: 'AT' } },
    // A `ref` description is fetched at runtime, so it is left out here (the description is optional).
    description: e.description && 'nodes' in e.description ? e.description : undefined,
    image: e.image ? new URL(e.image.url, siteUrl).href : undefined,
    price: e.price,
    booking: ginkoSafeHref(e.booking),
  })
})
useGinkoSeo(() => ({ title: event.value.data.title, image: event.value.data.image?.url, jsonLd: [eventLd.value] }))
</script>

<template>
  <article class="wrap event">
    <NuxtLink :to="path('events')" class="back">{{ t('allEvents') }}</NuxtLink>
    <h1 class="page-title" :lang="ginkoLangOf(event, 'title')">{{ event.data.title }}</h1>
    <p class="facts">
      <span class="when">{{ eventWhen(event.data.when, event.data.start) }}</span>
      <span v-if="event.data.price" class="price">{{ t('price') }}: {{ formatMoney(event.data.price, lang) }}</span>
    </p>
    <img v-if="ginkoSafeHref(event.data.image?.url)" class="image" :src="ginkoSafeHref(event.data.image?.url)" :alt="event.data.image!.alt" :lang="ginkoLangOf(event, 'image.alt')" :width="event.data.image!.width" :height="event.data.image!.height">
    <GinkoMarkdown :value="event.data.description" class="prose" :lang="ginkoLangOf(event, 'description')" />
    <a v-if="ginkoSafeHref(event.data.booking)" class="button book" :href="ginkoSafeHref(event.data.booking)" rel="noopener">{{ t('book') }}</a>
  </article>
</template>

<style scoped>
.back { display: inline-block; margin-top: 32px; font-weight: 500; }
.page-title { margin-top: 12px; max-width: 22ch; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 24px; margin: 16px 0 28px; font-size: 1.2rem; }
.when { font-weight: 700; color: var(--linde-ink); }
.image { border-radius: var(--radius); margin-bottom: 28px; max-height: 32rem; width: 100%; object-fit: cover; }
.book { margin-top: 28px; }
</style>
