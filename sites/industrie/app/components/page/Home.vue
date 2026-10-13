<script setup lang="ts">
import { certStatus, facts } from '../../utils/site'
const { t, format } = useI18n()

const { lang, today, head } = useSite()
const path = useGinkoPath()
const products = useGinko('products')
const jobs = useGinko('jobs')
const certificates = useGinko('certificates')
head(() => t('home'), 'home')

// The first certificate that is still valid; an expired one must not be shown as "valid until".
const certificate = computed(() => certificates.value.items.find((c) => certStatus(c.data.validUntil, today.value) !== 'expired'))
</script>

<template>
  <div>
    <section class="wrap hero" aria-labelledby="hero-title">
      <div class="intro">
        <h1 id="hero-title">{{ t('heroTitle') }}</h1>
        <p class="lede">{{ t('heroLede') }}</p>
        <div class="actions">
          <NuxtLink :to="path('products')" class="button">{{ t('seeProducts') }}</NuxtLink>
          <NuxtLink :to="path('careers')" class="button outline">{{ t('openJobs') }}<span v-if="jobs.items.length" class="pill">{{ jobs.items.length }}</span></NuxtLink>
        </div>
      </div>
      <ul class="facts mono" :aria-label="t('factsTitle')">
        <li><span class="num">{{ facts.employees }}</span> {{ t('employees') }}</li>
        <li><span class="num">{{ facts.exportCountries }}</span> {{ t('exportCountries') }}</li>
        <li v-if="certificate">
          <NuxtLink :to="path('certificates')" class="cert-title">{{ certificate.data.title }}</NuxtLink>
          <span class="until">{{ t('validUntil') }} {{ format.date(certificate.data.validUntil) }}</span>
        </li>
      </ul>
    </section>

    <section class="wrap section" aria-labelledby="products-title">
      <div class="section-head">
        <h2 id="products-title">{{ t('products') }}</h2>
        <NuxtLink :to="path('products')">{{ t('allProducts') }} <span aria-hidden="true">→</span></NuxtLink>
      </div>
      <div v-if="products.items.length" class="cards">
        <ProductCard v-for="p in products.items.slice(0, 3)" :key="p.id" :product="p" />
      </div>
      <p v-else class="empty">{{ t('noProducts') }}</p>
    </section>

    <section class="wrap section" aria-labelledby="careers-title">
      <div class="section-head">
        <h2 id="careers-title">{{ t('careers') }}</h2>
        <NuxtLink :to="path('careers')">{{ t('allJobs') }} <span aria-hidden="true">→</span></NuxtLink>
      </div>
      <JobRows :limit="3" />
    </section>

    <section class="wrap section" aria-labelledby="events-title">
      <div class="section-head">
        <h2 id="events-title">{{ t('nextEvents') }}</h2>
        <NuxtLink :to="path('events')">{{ t('allEvents') }} <span aria-hidden="true">→</span></NuxtLink>
      </div>
      <EventList :limit="2" />
    </section>

    <section class="wrap section" aria-labelledby="news-title">
      <div class="section-head">
        <h2 id="news-title">{{ t('news') }}</h2>
        <NuxtLink :to="path('news')">{{ t('allNews') }} <span aria-hidden="true">→</span></NuxtLink>
      </div>
      <NewsList :limit="3" />
    </section>

    <section class="wrap section" aria-labelledby="reception-title">
      <div class="section-head">
        <h2 id="reception-title">{{ t('receptionToday') }}</h2>
        <NuxtLink :to="path('contact')">{{ t('contact') }} <span aria-hidden="true">→</span></NuxtLink>
      </div>
      <ReceptionBoard />
    </section>
  </div>
</template>

<style scoped>
.hero { display: grid; gap: 32px; padding-top: 40px; }
.intro { display: grid; gap: 20px; align-content: start; justify-items: start; }
h1 { font-size: clamp(2rem, 1.3rem + 3vw, 3.25rem); line-height: 1.08; max-width: 18ch; }
.lede { font-size: 1.15rem; max-width: 46ch; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px; }
.actions .pill { margin-left: 4px; }
.facts { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); align-self: start; font-size: 0.9rem; display: grid; grid-template-columns: 1fr 1fr; }
/* The two numbers side by side, large; the certificate across the full width below. */
.facts li { display: grid; gap: 4px; padding: 18px 20px; color: var(--ink-2); }
.facts li + li { border-left: 1px solid var(--rule); }
.facts li:nth-child(3) { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--rule); display: flex; flex-wrap: wrap; gap: 2px 12px; }
.num { display: block; font-weight: 500; font-size: 2.25rem; line-height: 1.1; color: var(--ink); letter-spacing: -0.02em; }
.cert-title { color: var(--ink); font-weight: 500; }
.until { color: var(--ink-2); }
.cards { display: grid; gap: 16px; }
@media (min-width: 720px) {
  .hero { padding-top: 64px; }
  .cards { grid-template-columns: repeat(3, 1fr); gap: 24px; }
}
@media (min-width: 900px) {
  .hero { grid-template-columns: 7fr 5fr; gap: 64px; align-items: start; }
}
</style>
