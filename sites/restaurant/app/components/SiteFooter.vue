<script setup lang="ts">
import { siteName, telHref } from '../utils/site'

const path = useGinkoPath()
const { t } = useI18n()
const contact = useGinko('contact')
</script>

<template>
  <footer class="footer">
    <div class="wrap grid">
      <div>
        <p class="name">{{ siteName }}</p>
        <p>{{ contact.data.street }}<br>{{ contact.data.postalCode }} {{ contact.data.city }}</p>
      </div>
      <div>
        <p><a :href="telHref(contact.data.phone)">{{ contact.data.phone }}</a></p>
        <p v-if="contact.data.email"><a :href="`mailto:${contact.data.email}`">{{ contact.data.email }}</a></p>
      </div>
      <nav class="legal" :aria-label="t('morePages')">
        <NuxtLink :to="path('imprint')">{{ t('imprint') }}</NuxtLink>
        <NuxtLink :to="path('privacy')">{{ t('privacy') }}</NuxtLink>
      </nav>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  margin-top: 88px;
  padding-block: 32px 40px;
  border-top: 1px solid var(--rule);
  color: var(--ink-2);
  font-size: 1rem;
}
.grid { display: grid; gap: 20px; }
.name { font-family: var(--serif); font-weight: 700; color: var(--ink); font-size: 1.15rem; }
.legal { display: flex; gap: 20px; }
a { color: inherit; }
a:hover { color: var(--ink); }
@media (min-width: 720px) {
  .grid { grid-template-columns: 1fr 1fr auto; align-items: start; }
}
</style>
