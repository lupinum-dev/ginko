<script setup lang="ts">
import { legalPages, siteName, telHref, type LegalKey } from '../utils/site'

const { labels } = useSite()
const path = usePagePath()
const { t } = useI18n()
const company = useGinko('company')
const legal: LegalKey[] = ['terms', 'avv', 'privacy', 'imprint']
const nav = ['pricing', 'changelog', 'blog', 'faq'] as const
</script>

<template>
  <footer class="footer">
    <div class="wrap grid">
      <div>
        <p class="name"><span class="mark" aria-hidden="true" />{{ siteName }}</p>
        <p class="address">
          {{ company.data.name }}<br>{{ company.data.street }}<br>{{ company.data.city }}
        </p>
        <p><a :href="`mailto:${company.data.email}`">{{ company.data.email }}</a></p>
        <p v-if="company.data.phone"><a :href="telHref(company.data.phone)">{{ company.data.phone }}</a></p>
      </div>
      <nav class="links" :aria-label="t('mainNav')">
        <NuxtLink v-for="key in nav" :key="key" :to="path(key)">{{ labels.nav[key] }}</NuxtLink>
      </nav>
      <nav class="links" :aria-label="t('legalNav')">
        <NuxtLink v-for="key in legal" :key="key" :to="path(legalPages[key])">{{ labels.pages[legalPages[key]].title }}</NuxtLink>
      </nav>
    </div>
    <p class="wrap cities mono">{{ t('cities') }}</p>
  </footer>
</template>

<style scoped>
.footer {
  margin-top: var(--section);
  padding-block: 40px 32px;
  border-top: var(--line) solid var(--ink);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 0.97rem;
}
.grid { display: grid; gap: 28px; }
.name { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-family: var(--head); font-weight: 800; font-stretch: 112%; font-variation-settings: 'wdth' 112; color: var(--ink); font-size: 1.25rem; }
.mark { width: 12px; height: 12px; background: var(--yellow); border: var(--line) solid var(--ink); border-radius: 2px; }
.address { margin-bottom: 8px; }
.links { display: flex; flex-direction: column; align-items: flex-start; }
.links a, .grid > div a { color: var(--ink-2); display: inline-block; padding-block: 5px; }
.links a:hover, .grid > div a:hover { color: var(--ink); }
.cities { margin-top: 32px; font-size: 0.85rem; letter-spacing: 0.04em; }
@media (min-width: 720px) {
  .grid { grid-template-columns: 2fr 1fr 1fr; }
}
</style>
