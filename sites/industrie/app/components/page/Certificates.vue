<script setup lang="ts">
import { certStatus, formatSize } from '../../utils/site'
import { safeHref } from '@lupinum/ginko'

const { t, format } = useI18n()

const { lang, labels, today, head } = useSite()
const certificates = useGinko('certificates')
head(() => t('certificates'), 'certificates')
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('certificates') }}</h1>
    <div class="page-body">
      <ul v-if="certificates.items.length" class="certs">
        <li v-for="c in certificates.items" :key="c.id" class="cert" data-test="certificate">
          <h2>{{ c.data.title }}</h2>
          <p class="until mono">{{ t('validUntil') }} {{ format.date(c.data.validUntil) }}</p>
          <p><span class="chip" :class="certStatus(c.data.validUntil, today)" data-test="status">{{ labels.certStatus[certStatus(c.data.validUntil, today)] }}</span></p>
          <!-- A required file can still be missing (an upload removed on the platform): then no link. -->
          <p v-if="safeHref(c.data.certificate?.url)"><a :href="safeHref(c.data.certificate.url)" :download="c.data.certificate.name" rel="noopener">{{ c.data.certificate.name }} <span class="mono size">({{ t('certificatePdf', { size: formatSize(c.data.certificate.size, lang) }) }})</span></a></p>
        </li>
      </ul>
      <p v-else class="empty">{{ t('noCertificates') }}</p>
    </div>
  </div>
</template>

<style scoped>
.certs { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
.cert { display: grid; gap: 6px 24px; padding: 16px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
h2 { font-size: 1.1rem; font-weight: 500; letter-spacing: 0; }
.until { font-size: 0.9rem; }
.size { font-size: 0.85rem; color: var(--ink-2); }
@media (min-width: 900px) {
  .cert { grid-template-columns: 2fr 1.4fr 9rem 1.6fr; }
}
</style>
