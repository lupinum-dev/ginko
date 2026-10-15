<!-- Files (UI.md 10.3): the site's file library as a Finder. All members read and upload; owner and admin
     also move, rename, replace and remove (the server decides, the buttons follow `canManage`). -->
<script setup lang="ts">
import { useFilesLibrary } from '../../../../composables/useFilesLibrary'
import FilesBrowser from '../../../../components/files/FilesBrowser.vue'

definePageMeta({ layout: 'site' })

const { t } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('files.pageTitle', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const lib = useFilesLibrary()
const locales = computed(() => (s.schema.value?.locales ?? []) as string[])
</script>

<template>
  <div class="mx-auto w-full max-w-[90rem] px-4 pt-4 pb-24 md:px-6 md:pt-8">
    <h1 class="mb-5 text-xl font-semibold tracking-tight">{{ t('files.title') }}</h1>
    <FilesBrowser v-if="s.schema.value" :lib="lib" mode="page" :locales="locales" />
  </div>
</template>
