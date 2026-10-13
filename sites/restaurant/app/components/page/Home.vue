<script setup lang="ts">
import { priceOn, restaurantJsonLd } from '@lupinum/ginko-preset-gastro'
import { siteName, telHref } from '../../utils/site'

const path = useGinkoPath()
const { t } = useI18n()
const { labels, today } = useSite()
const gallery = useGinko('gallery')
const contact = useGinko('contact')
const { ctx: hoursCtx } = useHours()
const menu = useGinko('menu')
const seo = useGinko('seo')
const siteUrl = (useRuntimeConfig().public.ginko as { url: string }).url

// Restaurant JSON-LD for search engines: hours from the same rule as the page, menu with today's prices.
const restaurantLd = computed(() => {
  const sections = ['starters', 'soups', 'mains', 'desserts', 'drinks'].map((key) => ({
    name: labels.value.categories[key]!,
    items: menu.value.items.filter((i) => i.data.category === key).map((i) => ({ name: i.data.name, description: i.data.description, price: priceOn(i.data, today.value) })),
  }))
  return restaurantJsonLd({
    name: siteName,
    url: new URL(path('home'), siteUrl).href,
    today: today.value,
    hours: hoursCtx.value,
    address: { street: contact.value.data.street, postalCode: contact.value.data.postalCode, city: contact.value.data.city, country: 'AT' },
    telephone: contact.value.data.phone,
    email: contact.value.data.email,
    menu: { url: new URL(path('menu'), siteUrl).href, sections },
  })
})
// The layout sets title, description and image; this call adds the JSON-LD (and the WebSite entry of the home page).
useGinkoSeo(() => ({ title: seo.value.data.title, description: seo.value.data.description, image: seo.value.data.image?.url, jsonLd: [restaurantLd.value] }))
</script>

<template>
  <div>
    <section class="wrap hero">
      <div class="intro">
        <h1>Gasthaus zur Linde</h1>
        <p class="tagline">{{ t('tagline') }}</p>
        <p class="address">{{ contact.data.street }}, {{ contact.data.postalCode }} {{ contact.data.city }}</p>
        <a class="button" :href="telHref(contact.data.phone)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" /></svg>
          {{ t('call') }}: {{ contact.data.phone }}
        </a>
        <p class="reserve">{{ t('reserve') }}</p>
      </div>
      <TodayBoard />
    </section>

    <section class="wrap section" aria-labelledby="lunch-title">
      <div class="section-head">
        <h2 id="lunch-title">{{ t('lunchWeek') }}</h2>
        <NuxtLink :to="path('menu')">{{ t('menu') }}</NuxtLink>
      </div>
      <LunchWeek />
    </section>

    <section class="wrap section" aria-labelledby="events-title">
      <div class="section-head">
        <h2 id="events-title">{{ t('events') }}</h2>
        <NuxtLink :to="path('events')">{{ t('allEvents') }}</NuxtLink>
      </div>
      <EventList :limit="3" />
    </section>

    <section v-if="gallery.data.images.length" class="wrap section" aria-labelledby="gallery-title">
      <div class="section-head">
        <h2 id="gallery-title">{{ t('gallery') }}</h2>
        <NuxtLink :to="path('gallery')">{{ t('allPhotos') }}</NuxtLink>
      </div>
      <PhotoGrid :images="gallery.data.images.slice(0, 4)" :fallback="gallery.fallback" strip />
    </section>

    <section class="wrap section visit" aria-labelledby="hours-title">
      <div>
        <h2 id="hours-title">{{ t('hours') }}</h2>
        <HoursTable />
      </div>
      <div>
        <h2>{{ t('visit') }}</h2>
        <p class="lede">{{ contact.data.street }}<br>{{ contact.data.postalCode }} {{ contact.data.city }}</p>
        <p class="contact"><a :href="telHref(contact.data.phone)">{{ contact.data.phone }}</a><template v-if="contact.data.email"><br><a :href="`mailto:${contact.data.email}`">{{ contact.data.email }}</a></template></p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero { display: grid; gap: 28px; padding-top: 32px; }
.intro { display: grid; gap: 12px; align-content: start; justify-items: start; }
h1 {
  font-size: clamp(2.75rem, 1.6rem + 5vw, 5.75rem);
  letter-spacing: -0.025em;
  line-height: 0.98;
  margin-bottom: 8px;
}
.tagline { font-size: 1.3rem; max-width: 30ch; }
.address { color: var(--ink-2); margin-bottom: 12px; }
.reserve { color: var(--ink-2); font-size: 1rem; }
.visit { display: grid; gap: 40px; }
.visit h2 { font-size: clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem); margin-bottom: 16px; }
.contact { margin-top: 12px; }
@media (min-width: 900px) {
  .hero { grid-template-columns: 7fr 5fr; gap: 56px; padding-top: 56px; align-items: start; }
  .visit { grid-template-columns: 7fr 5fr; gap: 56px; }
}
</style>
