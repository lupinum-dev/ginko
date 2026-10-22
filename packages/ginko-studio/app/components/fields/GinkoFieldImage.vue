<!-- A photo with its alt text (UI.md 5, SPEC 2.2, 4.3). The photo is uploaded first; its id is stored
     at once, and the preview appears when the server has processed it. A new photo starts with an
     empty alt text; a failed photo puts back the value that was there before. The photo serves every
     language, so another language than the main one edits only its description.
     Two looks: the field (a preview card with its actions and the description below, or a drop area while empty; good
     in the editor's 18rem side column and at full width), and `tile`, one photo of a gallery list (GinkoFieldList). -->
<script lang="ts">
import type { InjectionKey } from 'vue'
/** The id of the one description hint a list of photos prints for all its rows (instead of one per row). */
export const LIST_ALT_HINT: InjectionKey<string> = Symbol('list-alt-hint')
</script>

<script setup lang="ts">
import { computed, defineAsyncComponent, inject, ref, shallowRef, watch } from 'vue'
import { ImageOff, ImagePlus, Library, RefreshCw, Trash2 } from '@lucide/vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { acceptOf } from '@lupinum/ginko/internal'
import { useGinkoAssets, useUpload } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { refuseImage } from '../editor/useImageUploads'
import type { Chosen } from '../files/LibraryPickerBody.vue'

const props = defineProps<{
  id: string; field: Field; modelValue: Json | undefined; invalid: boolean; describedBy?: string; locale: string
  /**
   * The name of the main language when this is another language (Alles bearbeiten or a quick-task sheet): a picture
   * applies to every language, so here only its description is edited, with no new photo, library or Entfernen; the
   * picture itself is changed in the main language.
   */
  altOnly?: string
  /** One photo of a gallery list: the photo fills the tile, its actions sit on it, the description below has no hint. */
  tile?: boolean
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
const listHint = inject(LIST_ALT_HINT, undefined)
const altHintId = computed(() => `${props.id}-alt-hint`)

// The status of the stored photo (live: it changes from processing to ready or failed), and its URL once ready.
const state = assets.state(fileId)
const preview = assets.details(computed(() => (fileId.value ? [fileId.value] : [])))
/** The description from the Files library in this language; it applies while the field's own text is empty. */
const libraryAlt = computed(() => (fileId.value ? preview.value?.[fileId.value]?.alt?.[props.locale]?.trim() : undefined) || '')
const ready = computed(() => (fileId.value ? preview.value?.[fileId.value] : undefined))
const processing = computed(() => state.value?.status === 'processing')
/** The general hint is printed once by a list of photos; the note about the Files description stays with its photo. */
const ownHint = computed(() => !!libraryAlt.value || (!listHint && !props.tile))
const altDescribedBy = computed(() => [ownHint.value ? altHintId.value : listHint, props.describedBy].filter(Boolean).join(' '))
const { picker, sending, error, retryFile, cancel: cancelUpload, pick, onPicked: pickedWith, retry, choose } = useUpload({
  kind: 'image',
  id: () => props.id,
  generic: t('fields.image.failed'),
  blockedText: t('fields.image.blocked'),
  processing,
  // The server refuses both anyway; checked here so the file is not sent first. The input's `accept` does not apply to a
  // drop, so a dropped PDF is caught here. The same rule and words as a picture in a text.
  precheck: (file) => refuseImage(file, t),
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
/** A photo dropped on the empty area is uploaded like a chosen one. */
const dragging = ref(false)
function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (!file || sending.value) return
  void choose(file, uploaded)
}

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

/** A gallery's touch menu (GinkoFieldList) offers a tile's own actions, which sit on the photo only for a mouse. */
defineExpose({ pick, openLibrary: () => { libraryOpen.value = true } })
</script>

<template>
  <div :id="id" class="@container grid" :class="tile ? 'gap-2' : 'gap-3'" role="group" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy">
    <p v-if="sending" class="status text-sm font-medium text-muted-foreground" role="status">{{ t('fields.uploading') }} <Button type="button" variant="ghost" size="sm" @click="cancelUpload?.()">{{ t('fields.cancel') }}</Button></p>
    <p v-else-if="processing" class="text-sm font-medium text-muted-foreground" role="status">{{ t('fields.image.processing') }}</p>
    <p v-if="error || failedMessage" class="error text-sm font-medium text-destructive" role="alert">{{ error ?? failedMessage }}</p>

    <!-- The photo: a card at most 28rem wide (a tile fills its cell), cut to fill; the actions of a tile sit on it. -->
    <!-- While the file loads, its place is kept (no jump when it arrives); a file that is gone says so. -->
    <figure v-if="fileId && !sending" class="group/photo relative m-0 overflow-hidden rounded-lg border bg-muted" :class="[tile ? 'aspect-[4/3]' : 'aspect-video w-full max-w-md', (ready === undefined || (ready === null && processing)) && 'animate-pulse']">
      <img v-if="ready" class="block size-full object-cover" :src="ready.url" :alt="altText.trim() || libraryAlt">
      <p v-else-if="ready === null && !processing && state?.status !== 'failed'" class="flex size-full items-center justify-center gap-2 p-3 text-[13px] text-muted-foreground"><ImageOff class="size-4 shrink-0" aria-hidden="true" />{{ t('editor.image.missing') }}</p>
      <Button
        v-if="!tile && !altOnly" type="button" variant="secondary" size="icon-sm" class="absolute top-1.5 right-1.5 bg-background/90 shadow-sm backdrop-blur-sm hover:text-destructive"
        :disabled="sending" :title="t('fields.remove')" @click="remove"
      ><Trash2 aria-hidden="true" /><span class="sr-only">{{ t('fields.remove') }}</span></Button>
      <div
        v-if="tile && !altOnly"
        class="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5 opacity-0 transition-opacity group-hover/photo:opacity-100 group-focus-within/photo:opacity-100 pointer-coarse:hidden"
      >
        <Button type="button" variant="secondary" size="icon-sm" :disabled="sending" :aria-label="t('fields.image.other')" :title="t('fields.image.other')" @click="pick"><RefreshCw aria-hidden="true" /></Button>
        <Button type="button" variant="secondary" size="icon-sm" :disabled="sending" :aria-label="t('files.picker.choose')" :title="t('files.picker.choose')" @click="libraryOpen = true"><Library aria-hidden="true" /></Button>
      </div>
    </figure>

    <p v-if="altOnly && fileId" class="text-sm text-muted-foreground">{{ t('fields.image.chooseInMain', { name: altOnly }) }}</p>
    <p v-else-if="altOnly" class="text-sm text-muted-foreground">{{ t('fields.image.noneToTranslate') }}</p>
    <!-- No photo yet: a drop area with the two ways to choose one. -->
    <div
      v-else-if="!fileId"
      class="grid place-items-center gap-2 rounded-lg border border-dashed bg-muted/40 text-center transition-colors"
      :class="[tile ? 'aspect-[4/3] content-center p-2' : 'min-h-32 p-4 @max-xs:min-h-0 @max-xs:place-items-start @max-xs:border-0 @max-xs:bg-transparent @max-xs:p-0 @max-xs:text-left', dragging && 'border-primary bg-accent']"
      @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop"
    >
      <ImagePlus class="size-5 text-muted-foreground" :class="!tile && '@max-xs:hidden'" aria-hidden="true" />
      <!-- Compact (a narrow column): stacked on purpose; the second one is a link in line with the first's edge and the hint
           (as a bare ghost button it read like a heading). -->
      <div class="flex flex-wrap justify-center gap-1.5" :class="!tile && '@max-xs:grid @max-xs:justify-items-start'">
        <Button type="button" variant="outline" size="sm" :disabled="sending" @click="pick">{{ t('fields.image.pick') }}</Button>
        <Button type="button" variant="ghost" size="sm" :class="!tile && '@max-xs:h-auto @max-xs:px-0 @max-xs:pointer-coarse:min-h-11 @max-xs:text-primary @max-xs:underline-offset-4 @max-xs:hover:bg-transparent @max-xs:hover:underline'" :disabled="sending" @click="libraryOpen = true">{{ t('files.picker.choose') }}</Button>
      </div>
      <!-- Nobody drags a file onto a phone: the hint is for screens with a mouse. -->
      <p v-if="!tile" class="text-[13px] text-muted-foreground pointer-coarse:hidden [@media(hover:none)]:hidden">{{ t('fields.image.drop') }}</p>
    </div>
    <div v-else-if="!tile" class="flex flex-wrap gap-1.5">
      <Button type="button" variant="outline" size="sm" :disabled="sending" @click="pick">{{ t('fields.image.other') }}</Button>
      <Button type="button" variant="ghost" size="sm" class="px-2" :disabled="sending" @click="libraryOpen = true">{{ t('files.picker.choose') }}</Button>
    </div>
    <!-- A failed server check offers retry too: with no file of this visit, retry opens the picker. -->
    <Button v-if="!altOnly && (error || failedMessage)" type="button" variant="outline" size="sm" class="justify-self-start" :disabled="sending" @click="retry">{{ t('basics.retry') }}</Button>
    <template v-if="!altOnly">
      <LibraryPicker v-if="libraryOpen" v-model:open="libraryOpen" kind="image" :locale="locale" @choose="fromLibrary" />
      <input ref="picker" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :accept="acceptOf('image')" @change="onPicked">
    </template>

    <div v-if="fileId" class="grid gap-1.5">
      <Label :for="altId" :class="tile ? 'sr-only' : 'text-sm leading-snug font-medium'">{{ t('fields.image.alt') }}</Label>
      <Input
        :id="altId" type="text" :class="tile && 'h-8 text-[13px] pointer-coarse:h-11'" :required="!libraryAlt" :aria-required="!libraryAlt" :placeholder="libraryAlt || (tile ? t('fields.image.alt') : undefined)"
        :model-value="altText" :aria-invalid="invalid" :aria-describedby="altDescribedBy || undefined" @update:model-value="setAlt(String($event))"
      />
      <p v-if="ownHint" :id="altHintId" class="text-[13px] text-muted-foreground">{{ libraryAlt ? t('fields.image.altFromLibrary') : t('fields.image.altHint') }}</p>
    </div>
  </div>
</template>
