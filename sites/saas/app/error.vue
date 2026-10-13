<!-- 404 and 503 in the site's own look. It must not read the bundle: a 503 means there is none. -->
<script setup lang="ts">
import type { NuxtError } from '#app'
import { siteName } from './utils/site'

const props = defineProps<{ error: NuxtError }>()
const { lang } = useSite()
const path = useGinkoPath()
const { t } = useI18n()
const missing = computed(() => props.error.statusCode === 404)
useHead({ htmlAttrs: { lang: lang.value }, title: siteName })
</script>

<template>
  <main class="wrap error">
    <NuxtLink :to="path('home')" class="brand"><span class="mark" aria-hidden="true" />{{ siteName }}</NuxtLink>
    <h1 class="page-title">{{ missing ? t('notFound') : t('unavailable') }}</h1>
    <NuxtLink v-if="missing" :to="path('home')" class="button">{{ t('backHome') }}</NuxtLink>
  </main>
</template>

<style scoped>
.error { padding-block: 24px 80px; display: grid; gap: 20px; justify-items: start; }
.brand { display: inline-flex; gap: 10px; align-items: center; font-family: var(--head); font-weight: 800; font-stretch: 112%; font-variation-settings: 'wdth' 112; font-size: 1.45rem; color: var(--ink); text-decoration: none; }
.mark { width: 14px; height: 14px; background: var(--yellow); border: var(--line) solid var(--ink); border-radius: 2px; }
.page-title { max-width: 20ch; margin-top: 32px; }
</style>
