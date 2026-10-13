<!-- Open jobs as rows for the home page: title, kind, location, salary. `limit` shortens the list. -->
<script setup lang="ts">
import { salaryText } from '../utils/site'
const { t } = useI18n()

const props = defineProps<{ limit?: number }>()
const { lang, labels } = useSite()
const path = useGinkoPath()
const jobs = useGinko('jobs')
const company = useGinko('company')
const items = computed(() => (props.limit ? jobs.value.items.slice(0, props.limit) : jobs.value.items))
</script>

<template>
  <ul v-if="items.length" class="jobs">
    <li v-for="j in items" :key="j.id" class="job" data-test="job">
      <h3 :lang="ginkoLangOf(j, 'title')"><NuxtLink :to="path('careers')">{{ j.data.title }}</NuxtLink></h3>
      <p class="meta">{{ labels.kinds[j.data.kind] ?? j.data.kind }}<span class="sep" aria-hidden="true"> / </span>{{ j.data.location }}</p>
      <p class="salary mono">{{ salaryText(j.data, lang, { from: t('salaryFrom'), gross: t('gross') }) }}</p>
    </li>
  </ul>
  <p v-else class="empty">{{ t('noJobs') }} <a :href="`mailto:${company.data.email}`">{{ company.data.email }}</a>.</p>
</template>

<style scoped>
.jobs { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
.job { position: relative; display: grid; gap: 2px 24px; padding: 14px 0; border-bottom: 1px solid var(--rule); }
h3 { font-size: 1.1rem; font-weight: 500; }
h3 a { color: var(--ink); text-decoration: none; }
h3 a::after { content: ''; position: absolute; inset: 0; }
.job:hover h3 a { text-decoration: underline; }
.meta { color: var(--ink-2); }
.salary { font-size: 0.9rem; }
@media (min-width: 900px) {
  .job { grid-template-columns: 2fr 1.4fr auto; align-items: baseline; }
  .salary { text-align: right; }
}
</style>
