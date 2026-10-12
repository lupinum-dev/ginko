<script setup lang="ts">
import { salaryText } from '../../utils/site'
const { t, format } = useI18n()

const { lang, labels, head } = useSite()
const jobs = useGinko('jobs')
const company = useGinko('company')
head(() => t('careers'), 'careers')
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('careers') }}</h1>
    <p class="page-intro">{{ t('careersIntro') }}</p>
    <div class="page-body">
      <div v-if="jobs.items.length" class="jobs">
        <details v-for="j in jobs.items" :key="j.id" class="job" data-test="job">
          <summary>
            <span class="title" :lang="langOf(j, 'title')">{{ j.data.title }}</span>
            <span class="kind">{{ labels.kinds[j.data.kind] ?? j.data.kind }}</span>
            <span class="place">{{ j.data.location }}</span>
            <span class="salary mono">{{ salaryText(j.data, lang, { from: t('salaryFrom'), gross: t('gross') }) }}</span>
          </summary>
          <div class="body">
            <GinkoMarkdown :value="j.data.description" class="prose" :lang="langOf(j, 'description')" />
            <p v-if="j.data.start" class="date mono">{{ t('startFrom', { date: format.date(j.data.start) }) }}</p>
            <p v-if="j.data.until" class="date mono">{{ t('endsOn', { date: format.date(j.data.until) }) }}</p>
            <div v-if="safeHref(j.data.applyUrl) || j.data.applyEmail" class="apply">
              <a v-if="safeHref(j.data.applyUrl)" class="button" :href="safeHref(j.data.applyUrl)" rel="noopener">{{ t('applyOnline') }}</a>
              <a v-if="j.data.applyEmail" class="button" :class="{ outline: safeHref(j.data.applyUrl) }" :href="`mailto:${j.data.applyEmail}`">{{ t('applyMail', { email: j.data.applyEmail }) }}</a>
            </div>
          </div>
        </details>
      </div>
      <p v-else class="empty">{{ t('noJobs') }} <a :href="`mailto:${company.data.email}`">{{ company.data.email }}</a>.</p>
    </div>
  </div>
</template>

<style scoped>
.jobs { display: grid; gap: 12px; }
.job { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); }
.job[open] { border-color: var(--steel); }
summary {
  display: grid;
  gap: 2px 20px;
  padding: 16px 48px 16px 20px;
  cursor: pointer;
  list-style: none;
  position: relative;
}
summary::-webkit-details-marker { display: none; }
summary::after { content: '+'; position: absolute; right: 20px; top: 14px; font-family: var(--mono); font-size: 1.3rem; line-height: 1.4; color: var(--steel); }
.job[open] summary::after { content: '−'; }
.title { font-weight: 600; font-size: 1.1rem; }
.kind, .place { color: var(--ink-2); }
.salary { font-size: 0.9rem; }
/* Phones: kind and place share one line ("Vollzeit · Steyr"); title and salary span the card. */
@media (max-width: 899px) {
  summary { grid-template-columns: max-content 1fr; column-gap: 0; }
  .title, .salary { grid-column: 1 / -1; }
  .kind::after { content: '\00a0·\00a0'; }
}
.body { padding: 4px 20px 24px; display: grid; gap: 12px; justify-items: start; border-top: 1px solid var(--rule); padding-top: 20px; }
.date { font-size: 0.9rem; color: var(--ink-2); }
.apply { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
@media (min-width: 900px) {
  summary { grid-template-columns: 2.4fr 1fr 1fr 1.6fr; align-items: baseline; }
  .salary { text-align: right; }
}
</style>
