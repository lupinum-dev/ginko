<!-- 404 and 503 in the site's own look. It must not read the bundle: a 503 means there is none. -->
<script setup lang="ts">
import type { NuxtError } from '#app'
import { siteName } from './utils/site'
const { t } = useI18n()

const props = defineProps<{ error: NuxtError }>()
const { lang } = useSite()
const path = useGinkoPath()
const missing = computed(() => props.error.statusCode === 404)
useHead({ htmlAttrs: { lang: lang.value }, title: siteName })
</script>

<template>
  <main class="wrap error">
    <NuxtLink :to="path('home')" class="brand"><span class="mark">BRUNNER</span><span class="line">{{ t('brandLine') }}</span></NuxtLink>
    <h1 class="page-title">{{ missing ? t('notFound') : t('unavailable') }}</h1>
    <NuxtLink v-if="missing" :to="path('home')" class="button">{{ t('backHome') }}</NuxtLink>
  </main>
</template>

<style scoped>
.error { padding-block: 32px 80px; display: grid; gap: 20px; justify-items: start; }
.brand { display: grid; color: var(--ink); text-decoration: none; line-height: 1.2; }
.mark { font-weight: 700; letter-spacing: 0.12em; font-size: 1.25rem; }
.line { font-size: 13px; color: var(--ink-2); }
.page-title { max-width: 24ch; margin-top: 24px; }
</style>
