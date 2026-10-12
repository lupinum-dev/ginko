<script setup lang="ts">
import { companyName, telHref } from '../utils/site'
const { t } = useI18n()

const path = usePagePath()
const company = useGinko('company')
const links = computed((): { key: GinkoPageKey; label: string }[] => [
  { key: 'products', label: t('nav.products') },
  { key: 'careers', label: t('nav.careers') },
  { key: 'news', label: t('nav.news') },
  { key: 'events', label: t('nav.events') },
  { key: 'contact', label: t('nav.contact') },
  { key: 'certificates', label: t('certificates') },
])
</script>

<template>
  <footer class="footer">
    <div class="wrap grid">
      <div>
        <p class="name">{{ companyName }}</p>
        <address>
          {{ company.data.street }}<br>{{ company.data.city }}<br>
          <a :href="telHref(company.data.phone)" class="mono">{{ company.data.phone }}</a><br>
          <a :href="`mailto:${company.data.email}`">{{ company.data.email }}</a>
          <template v-if="company.data.vatId"><br><span class="mono">{{ t('vatId') }} {{ company.data.vatId }}</span></template>
        </address>
      </div>
      <nav :aria-label="t('footerPages')">
        <NuxtLink v-for="link in links" :key="link.key" :to="path(link.key)">{{ link.label }}</NuxtLink>
      </nav>
      <nav :aria-label="t('footerLegal')">
        <NuxtLink :to="path('imprint')">{{ t('imprint') }}</NuxtLink>
        <NuxtLink :to="path('privacy')">{{ t('privacy') }}</NuxtLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  margin-top: calc(var(--section) + 24px);
  padding-block: 32px 40px;
  border-top: 1px solid var(--ink);
  color: var(--ink-2);
  font-size: 0.95rem;
}
.grid { display: grid; gap: 28px; }
.name { font-weight: 600; color: var(--ink); margin-bottom: 4px; }
address { font-style: normal; }
nav { display: grid; gap: 4px; align-content: start; }
a { color: inherit; }
a:hover { color: var(--ink); }
@media (min-width: 720px) {
  .grid { grid-template-columns: 2fr 1fr 1fr; align-items: start; }
}
</style>
