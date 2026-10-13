<script setup lang="ts">
// Announcement above the header. The server always renders it; a dismissed one is hidden before first
// paint by the head script (html[data-docs-banner-off], docs.css) and removed here after hydration.
import { bannerInitScript, bannerKey } from '../lib/docsInit'

const props = defineProps<{ id: string, href?: string }>()
const { t } = useI18n()
const { text, href: siteHref } = useDocsSite()
useHead({ script: [{ key: 'docs-banner-init', innerHTML: bannerInitScript(props.id), tagPriority: 'critical' }] })
const dismissed = ref(false)
onMounted(() => {
  try { dismissed.value = localStorage.getItem(bannerKey(props.id)) === '1' } catch { /* shown */ }
})

function dismiss() {
  dismissed.value = true
  try { localStorage.setItem(bannerKey(props.id), '1') } catch { /* gone until reload */ }
}
</script>

<template>
  <div v-if="!dismissed" class="docs-banner" role="region" :aria-label="text(`docs.banner.${id}`)">
    <p>
      <NuxtLink v-if="href" :to="siteHref(href)">{{ text(`docs.banner.${id}`) }}</NuxtLink>
      <template v-else>{{ text(`docs.banner.${id}`) }}</template>
    </p>
    <button type="button" class="docs-icon-button" :aria-label="t('docs.bannerClose')" @click="dismiss"><Icon name="lucide:x" class="docs-icon" /></button>
  </div>
</template>
