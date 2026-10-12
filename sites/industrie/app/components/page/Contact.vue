<script setup lang="ts">
import { companyName, telHref } from '../../utils/site'
const { t } = useI18n()

const { head } = useSite()
const company = useGinko('company')
const contacts = useGinko('contacts')
head(() => t('contact'), 'contact')
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('contact') }}</h1>

    <div class="top page-body">
      <section aria-labelledby="company-title">
        <h2 id="company-title">{{ t('company') }}</h2>
        <address>
          <span class="name">{{ companyName }}</span>
          <span>{{ company.data.street }}</span>
          <span>{{ company.data.city }}</span>
        </address>
        <dl class="rows">
          <div><dt>{{ t('phone') }}</dt><dd><a :href="telHref(company.data.phone)" class="mono">{{ company.data.phone }}</a></dd></div>
          <div><dt>{{ t('email') }}</dt><dd><a :href="`mailto:${company.data.email}`">{{ company.data.email }}</a></dd></div>
          <div v-if="company.data.vatId"><dt>{{ t('vatId') }}</dt><dd class="mono">{{ company.data.vatId }}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="hours-title">
        <h2 id="hours-title">{{ t('receptionHours') }}</h2>
        <HoursTable />
      </section>
    </div>

    <section class="section" aria-labelledby="contacts-title">
      <div class="section-head"><h2 id="contacts-title">{{ t('contacts') }}</h2></div>
      <div v-if="contacts.items.length" class="cards">
        <ContactCard v-for="c in contacts.items" :key="c.id" :contact="c" />
      </div>
      <p v-else class="empty">{{ t('noContacts') }}</p>
    </section>
  </div>
</template>

<style scoped>
.top { display: grid; gap: 40px; }
h2 { font-size: 1.3rem; margin-bottom: 16px; }
address { display: grid; font-style: normal; margin-bottom: 16px; }
.name { font-weight: 600; }
.rows { margin: 0; }
.rows div { display: flex; gap: 16px; padding: 8px 0; border-top: 1px solid var(--rule); }
.rows dt { width: 6rem; flex: none; color: var(--ink-2); }
.rows dd { margin: 0; min-width: 0; }
.cards { display: grid; gap: 16px; }
@media (min-width: 720px) {
  .top { grid-template-columns: 1fr 1fr; gap: 64px; }
  .cards { grid-template-columns: repeat(2, 1fr); gap: 24px; }
}
@media (min-width: 960px) { .cards { grid-template-columns: repeat(3, 1fr); } }
</style>
