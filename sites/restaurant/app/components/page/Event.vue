<script setup lang="ts">
import { formatMoney, safeHref } from '@lupinum/ginko'
import { eventJsonLd } from '@lupinum/ginko-preset-gastro'
import { siteName } from '../../utils/site'

const langOf = useGinkoLang()

const props = defineProps<{ slug: string }>()
const path = useGinkoPath()
const { t, language } = useI18n()
const eventWhen = useEventWhen()
const event = useGinkoEntry('events', () => props.slug)
const contact = useGinko('contact')
const { url: siteUrl } = useGinkoSite()
// In page state the description is `{ ref }`; the same text <GinkoMarkdown> shows below, loaded once.
const description = await useGinkoMarkdown(() => event.value.data.description)

// Event JSON-LD for search engines: the event's dates, place, price and booking link as the page shows them.
const eventLd = computed(() => {
  const e = event.value.data
  return eventJsonLd({
    title: e.title,
    url: new URL(event.value.url, siteUrl).href,
    when: e.when,
    start: e.start,
    location: { name: siteName, address: { street: contact.value.data.street, postalCode: contact.value.data.postalCode, city: contact.value.data.city, country: 'AT' } },
    description: description.value ?? undefined,
    image: e.image ? new URL(e.image.url, siteUrl).href : undefined,
    price: e.price,
    booking: safeHref(e.booking),
    soldOut: e.soldOut === true,
  })
})
useGinkoSeo(() => ({ title: event.value.data.title, image: event.value.data.image?.url, jsonLd: [eventLd.value] }))
</script>

<template>
  <article class="wrap event">
    <NuxtLink :to="path('events')" class="back">{{ t('allEvents') }}</NuxtLink>
    <h1 class="page-title" :lang="langOf(event, 'title')">{{ event.data.title }}</h1>
    <p class="facts">
      <span class="when">{{ eventWhen(event.data.when, event.data.start) }}</span>
      <span v-if="event.data.price" class="price">{{ t('price') }}: {{ formatMoney(event.data.price, language) }}</span>
      <span v-if="event.data.soldOut" class="booked" data-test="fully-booked">{{ t('fullyBooked') }}</span>
    </p>
    <GinkoImage v-if="safeHref(event.data.image?.url)" class="image" :image="event.data.image" eager sizes="(min-width: 76rem) 72rem, 100vw" :lang="langOf(event, 'image.alt')" />
    <GinkoMarkdown :value="event.data.description" class="prose" :lang="langOf(event, 'description')" />
    <a v-if="!event.data.soldOut && safeHref(event.data.booking)" class="button book" :href="safeHref(event.data.booking)" rel="noopener">{{ t('book') }}</a>
  </article>
</template>

<style scoped>
.back { display: inline-block; margin-top: 32px; font-weight: 500; }
.page-title { margin-top: 12px; max-width: 22ch; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 24px; margin: 16px 0 28px; font-size: 1.2rem; }
.when { font-weight: 700; color: var(--linde-ink); }
.booked { padding: 0 10px; border-radius: 999px; background: var(--bluete); color: var(--ink); font-weight: 700; }
.image { border-radius: var(--radius); margin-bottom: 28px; max-height: 32rem; width: 100%; object-fit: cover; }
.book { margin-top: 28px; }
</style>
