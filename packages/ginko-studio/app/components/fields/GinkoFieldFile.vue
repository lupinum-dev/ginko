<!-- A PDF (UI.md 5, SPEC 2.2, 4.3). The file is uploaded at once; the server checks its content, then name and
     size show. A file over the field's maxBytes is refused before any upload; a file that is no PDF is refused by the check. -->
<script setup lang="ts">
import { Button } from '@studio/components/ui/button'
import type { Chosen } from '../files/LibraryPickerBody.vue'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { acceptOf, fileProblem, formatMb } from '@lupinum/ginko/internal'
import { useGinkoAssets, useUpload } from '@lupinum/ginko-editor'

const props = defineProps<{ id: string; field: Extract<Field, { type: 'file' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()

const { t } = useI18n()
const MB = 1024 * 1024
const assets = useGinkoAssets()
// The library (UI.md 10.3) loads when it is opened for the first time.
const LibraryPicker = defineAsyncComponent(() => import('../files/LibraryPicker.vue'))
const libraryOpen = ref(false)

const fileId = computed(() => {
  const file = props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? props.modelValue.file : undefined
  return typeof file === 'string' ? file : undefined
})

// Name, size and URL of the stored file; null when it is not ready or not this site's.
const details = assets.details(computed(() => (fileId.value ? [fileId.value] : [])))
const stored = computed(() => (fileId.value ? details.value?.[fileId.value] : undefined))
const state = assets.state(fileId)
const processing = computed(() => state.value?.status === 'processing')
const textOf = useTextOf()
const { picker, sending, error, retryFile, cancel: cancelUpload, pick, onPicked: pickedWith, retry } = useUpload({
  kind: 'file',
  id: () => props.id,
  generic: t('fields.file.failed'),
  blockedText: t('fields.file.blocked'),
  processing,
  precheck: (file) => {
    const problem = fileProblem(props.field, { size: file.size, contentType: file.type, name: file.name })
    return problem && textOf(problem, problem.message)
  },
})
// A file that fails the content check is not kept.
watch(() => state.value?.status, (status) => {
  if (status !== 'failed') return
  error.value = state.value?.error ?? t('fields.file.failed')
  emit('update:modelValue', undefined)
})

const formatSize = (bytes: number) => (bytes < MB ? `${Math.round(bytes / 1024)} KB` : `${formatMb(bytes)} MB`)

function uploaded(id: string) {
  retryFile.value = null
  emit('update:modelValue', { file: id })
}
const onPicked = (event: Event) => pickedWith(event, uploaded)

function fromLibrary(picked: Chosen) {
  libraryOpen.value = false
  error.value = null
  retryFile.value = null
  emit('update:modelValue', { file: picked.id })
}

function remove() {
  error.value = null
  retryFile.value = null
  emit('update:modelValue', undefined)
}
</script>

<template>
  <div :id="id" class="grid gap-3" role="group" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy">
    <p v-if="sending" class="status text-sm font-medium text-muted-foreground" role="status">{{ t('fields.uploading') }} <Button type="button" variant="ghost" @click="cancelUpload?.()">{{ t('fields.cancel') }}</Button></p>
    <p v-else-if="processing" class="text-sm font-medium text-muted-foreground" role="status">{{ t('fields.file.checking') }}</p>
    <p v-if="error" class="error text-sm font-medium text-destructive" role="alert">{{ error }}</p>

    <p v-if="fileId && !sending && stored" class="[overflow-wrap:anywhere]">
      <a :href="stored.url" target="_blank" rel="noopener" class="text-primary underline underline-offset-4">{{ stored.name }}</a>, {{ formatSize(stored.size) }}
      <span class="sr-only">{{ t('fields.file.opensInNewTab') }}</span>
    </p>
    <p v-else-if="fileId && !sending && stored === null" class="error text-sm font-medium text-destructive" role="alert">{{ t('fields.file.unavailable') }}</p>

    <div class="flex flex-wrap gap-2">
      <Button v-if="!fileId" type="button" variant="secondary" :disabled="sending" @click="pick">{{ t('fields.file.pick') }}</Button>
      <template v-else>
        <Button type="button" variant="secondary" :disabled="sending" @click="pick">{{ t('fields.file.other') }}</Button>
        <Button type="button" variant="ghost" :disabled="sending" @click="remove">{{ t('fields.remove') }}</Button>
      </template>
      <Button type="button" variant="secondary" :disabled="sending" @click="libraryOpen = true">{{ t('files.picker.choose') }}</Button>
      <Button v-if="error && retryFile" type="button" variant="outline" :disabled="sending" @click="retry">{{ t('fields.retry') }}</Button>
    </div>
    <LibraryPicker v-if="libraryOpen" v-model:open="libraryOpen" kind="pdf" locale="" @choose="fromLibrary" />
    <input ref="picker" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :accept="acceptOf('file')" @change="onPicked">
  </div>
</template>
