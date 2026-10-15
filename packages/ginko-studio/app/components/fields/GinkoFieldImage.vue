<!-- A photo with its alt text (UI.md 5, SPEC 2.2, 4.3). The photo is uploaded first; its id is stored
     at once, and the preview appears when the server has processed it. A new photo starts with an
     empty alt text; a failed photo puts back the value that was there before. The photo serves every
     language, so another language than the main one edits only its description. -->
<script setup lang="ts">
import { CONTAINED_FIELD } from './sizes'
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { acceptOf, formatMb, limitOf } from '@lupinum/ginko/internal'
import { useGinkoAssets, useUpload } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import type { Chosen } from '../files/LibraryPickerBody.vue'

const props = defineProps<{
  id: string; field: Field; modelValue: Json | undefined; invalid: boolean; describedBy?: string; locale: string
  /**
   * The name of the main language when this is another language (Alles bearbeiten or a quick-task sheet): a picture
   * applies to every language, so here only its description is edited, with no new photo, library or Entfernen; the
   * picture itself is changed in the main language.
   */
  altOnly?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()

const { t } = useI18n()
const assets = useGinkoAssets()
// The library (UI.md 10.3) loads when it is opened for the first time.
const LibraryPicker = defineAsyncComponent(() => import('../files/LibraryPicker.vue'))
const libraryOpen = ref(false)

/** The value before the photo that was chosen last; a photo that fails to process puts it back. */
const before = shallowRef<Json | undefined>(undefined)
/** The upload id of the photo chosen in this visit, until it is ready or has failed. */
const chosen = ref<string | null>(null)

const fileOf = (value: Json | undefined) => {
  const file = value && typeof value === 'object' && !Array.isArray(value) ? value.file : undefined
  return typeof file === 'string' ? file : undefined
}
const altOf = (value: Json | undefined): Record<string, Json> => {
  const alt = value && typeof value === 'object' && !Array.isArray(value) ? value.alt : undefined
  return alt && typeof alt === 'object' && !Array.isArray(alt) ? alt : {}
}

const fileId = computed(() => fileOf(props.modelValue))
const altText = computed(() => {
  const text = altOf(props.modelValue)[props.locale]
  return typeof text === 'string' ? text : ''
})
const altId = computed(() => `${props.id}-alt`)
const altHintId = computed(() => `${props.id}-alt-hint`)
const altDescribedBy = computed(() => [altHintId.value, props.describedBy].filter(Boolean).join(' '))

// The status of the stored photo (live: it changes from processing to ready or failed), and its URL once ready.
const state = assets.state(fileId)
const preview = assets.details(computed(() => (fileId.value ? [fileId.value] : [])))
/** The description from the Files library in this language; it applies while the field's own text is empty. */
const libraryAlt = computed(() => (fileId.value ? preview.value?.[fileId.value]?.alt?.[props.locale]?.trim() : undefined) || '')
const ready = computed(() => (fileId.value ? preview.value?.[fileId.value] : undefined))
const processing = computed(() => state.value?.status === 'processing')
const { picker, sending, error, retryFile, cancel: cancelUpload, pick, onPicked: pickedWith, retry } = useUpload({
  kind: 'image',
  id: () => props.id,
  generic: t('fields.image.failed'),
  blockedText: t('fields.image.blocked'),
  processing,
  // The server refuses it anyway; checked here so a large photo is not sent first.
  precheck: (file) => (file.size > limitOf('image') ? t('fields.image.tooLarge', { max: formatMb(limitOf('image')) }) : undefined),
})
const failedMessage = computed(() => (state.value?.status === 'failed' ? state.value.error ?? t('fields.image.failed') : null))

// A chosen photo that fails processing: show the server's message and put back the old value.
watch(() => state.value?.status, (status) => {
  if (status !== 'failed' || !chosen.value || fileId.value !== chosen.value) return
  error.value = state.value?.error ?? t('fields.image.failed')
  chosen.value = null
  emit('update:modelValue', before.value)
})

function uploaded(id: string) {
  before.value = props.modelValue
  chosen.value = id
  emit('update:modelValue', { file: id, alt: { [props.locale]: '' } })
}
const onPicked = (event: Event) => pickedWith(event, uploaded)

/** A photo from the library: it is ready at once and may already have alt text from its other uses. */
function fromLibrary(picked: Chosen) {
  libraryOpen.value = false
  error.value = null
  chosen.value = null
  emit('update:modelValue', { file: picked.id, alt: { [props.locale]: '', ...picked.alt } })
}

function remove() {
  chosen.value = null
  error.value = null
  emit('update:modelValue', undefined)
}

function setAlt(text: string) {
  if (!fileId.value) return
  emit('update:modelValue', { file: fileId.value, alt: { ...altOf(props.modelValue), [props.locale]: text } })
}
</script>

<template>
  <div :id="id" class="grid gap-3" role="group" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy">
    <p v-if="sending" class="status text-sm font-medium text-muted-foreground" role="status">{{ t('fields.uploading') }} <Button type="button" variant="ghost" @click="cancelUpload?.()">{{ t('fields.cancel') }}</Button></p>
    <p v-else-if="processing" class="text-sm font-medium text-muted-foreground" role="status">{{ t('fields.image.processing') }}</p>
    <p v-if="error || failedMessage" class="error text-sm font-medium text-destructive" role="alert">{{ error ?? failedMessage }}</p>

    <figure v-if="fileId && !sending && ready" class="m-0">
      <img class="block h-auto max-h-56 w-auto max-w-full rounded-md object-contain" :src="ready.url" :alt="altText.trim() || libraryAlt">
    </figure>

    <p v-if="altOnly && fileId" class="text-sm text-muted-foreground">{{ t('fields.image.chooseInMain', { name: altOnly }) }}</p>
    <p v-else-if="altOnly" class="text-sm text-muted-foreground">{{ t('fields.image.noneToTranslate') }}</p>
    <div v-if="!altOnly" class="flex flex-wrap gap-2">
      <Button v-if="!fileId" type="button" variant="secondary" :disabled="sending" @click="pick">{{ t('fields.image.pick') }}</Button>
      <template v-else>
        <Button type="button" variant="secondary" :disabled="sending" @click="pick">{{ t('fields.image.other') }}</Button>
        <Button type="button" variant="ghost" :disabled="sending" @click="remove">{{ t('fields.remove') }}</Button>
      </template>
      <!-- A failed server check offers retry too: with no file of this visit, retry opens the picker. -->
      <Button type="button" variant="secondary" :disabled="sending" @click="libraryOpen = true">{{ t('files.picker.choose') }}</Button>
      <Button v-if="error || failedMessage" type="button" variant="outline" :disabled="sending" @click="retry">{{ t('basics.retry') }}</Button>
    </div>
    <template v-if="!altOnly">
      <LibraryPicker v-if="libraryOpen" v-model:open="libraryOpen" kind="image" :locale="locale" @choose="fromLibrary" />
      <input ref="picker" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :accept="acceptOf('image')" @change="onPicked">
    </template>

    <div v-if="fileId" class="grid gap-1.5">
      <div :class="CONTAINED_FIELD">
        <Label :for="altId" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('fields.image.alt') }}</Label>
        <Input :id="altId" type="text" :required="!libraryAlt" :aria-required="!libraryAlt" :placeholder="libraryAlt || undefined" :model-value="altText" :aria-invalid="invalid" :aria-describedby="altDescribedBy" @update:model-value="setAlt(String($event))" />
      </div>
      <p :id="altHintId" class="text-sm text-muted-foreground">{{ libraryAlt ? t('fields.image.altFromLibrary') : t('fields.image.altHint') }}</p>
    </div>
  </div>
</template>
