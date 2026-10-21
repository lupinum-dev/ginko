<!-- Files (UI.md 10.3): the site's file library as a Finder. All members read and upload; owner and admin
     also move, rename, replace and remove (the server decides, the buttons follow `canManage`). -->
<script setup lang="ts">
import { UploadIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { useFilesLibrary } from '../../../../composables/useFilesLibrary'
import FilesBrowser from '../../../../components/files/FilesBrowser.vue'
import StudioPage from '../../../../components/StudioPage.vue'

definePageMeta({ layout: 'site' })

const { t } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('files.pageTitle', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const lib = useFilesLibrary()
const locales = computed(() => (s.schema.value?.locales ?? []) as string[])
// The Finder owns the upload (its file input, folder and drop logic); the page's Upload button only opens its chooser.
const browser = ref<InstanceType<typeof FilesBrowser> | null>(null)
</script>

<template>
  <StudioPage :title="t('files.title')" wide>
    <template #actions>
      <Button type="button" :disabled="browser?.canUpload === false" @click="browser?.chooseFiles()"><UploadIcon aria-hidden="true" />{{ t('files.upload') }}</Button>
    </template>
    <FilesBrowser v-if="s.schema.value" ref="browser" :lib="lib" mode="page" :locales="locales" />
  </StudioPage>
</template>
