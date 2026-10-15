<!-- "Bild einfügen": first a picture from the Files library (the text stores `$file.<id>`, the editor shows the file),
     then a new upload (it goes in at the cursor like a dropped picture), and last a web address with its description.
     With `describe` (the position of a picture that is already in the text, e.g. one that was just uploaded) it asks
     for the description only: the picture is there, the description is required. -->
<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { acceptOf, isSafeHref } from '@lupinum/ginko/internal'
import { shownSrc, type FileImages } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import type { Chosen } from '../files/LibraryPickerBody.vue'

const props = defineProps<{
  editor: Editor
  /** Position of an image in the document that needs its description. */
  describe?: number | null
  /** The library files of the text's pictures; without it the dialog offers the web address only. */
  images?: FileImages
  /** The language of the text: a library picture takes its description in it. */
  locale?: string
  /** Uploads a picture at the cursor; without it there is no upload button. */
  upload?: (file: File) => void
}>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
// The library loads when it is opened for the first time.
const LibraryPicker = defineAsyncComponent(() => import('../files/LibraryPicker.vue'))
const libraryOpen = ref(false)
const picker = ref<HTMLInputElement | null>(null)

const srcId = useId()
const altId = useId()
const src = ref('')
const alt = ref('')
const errors = ref<{ src?: string; alt?: string }>({})

const target = computed(() => {
  void open.value // the document is not reactive: look again each time the dialog opens
  if (props.describe == null) return undefined
  const node = props.editor.state.doc.nodeAt(props.describe)
  return node?.type.name === 'image' ? node : undefined
})
/** What the picture that waits for its description shows: its address, or the URL of its library file. */
const targetSrc = computed(() => (target.value ? shownSrc(props.images, String(target.value.attrs.src ?? '')) : undefined))
const altInput = ref<{ $el: HTMLInputElement } | HTMLInputElement | null>(null)

watch(open, (isOpen) => {
  if (isOpen) { src.value = ''; alt.value = String(target.value?.attrs.alt ?? ''); errors.value = {} }
})

/** The alt field is the one to type into when a picture waits for its description. */
function focusAlt(event: Event) {
  if (!target.value) return
  event.preventDefault()
  const el = altInput.value && '$el' in altInput.value ? altInput.value.$el : altInput.value
  el?.focus()
}

function describeImage() {
  if (!alt.value.trim()) { errors.value = { alt: t('editor.image.descriptionRequired') }; return }
  const pos = props.describe!
  props.editor.view.dispatch(props.editor.state.tr.setNodeAttribute(pos, 'alt', alt.value.trim()))
  open.value = false
}

function insert() {
  if (target.value) { describeImage(); return }
  const address = src.value.trim()
  const next: { src?: string; alt?: string } = {}
  if (!address || !isSafeHref(address)) next.src = t('editor.image.addressRefused')
  if (!alt.value.trim()) next.alt = t('editor.image.descriptionRequired')
  errors.value = next
  if (next.src || next.alt) return
  props.editor.chain().focus().setImage({ src: address, alt: alt.value.trim() }).run()
  open.value = false
}

/**
 * A picture from the library goes in at once: the picker has shown its description and made sure it has one in this
 * language. The library's text applies when the page is built, in every language; the text holds its own description
 * only when the person wrote one.
 */
function fromLibrary(chosen: Chosen) {
  libraryOpen.value = false
  open.value = false
  props.editor.chain().focus().setImage({ src: `$file.${chosen.id}`, alt: chosen.alt?.[props.locale ?? '']?.trim() ?? '' }).run()
}

function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  open.value = false
  props.upload?.(file)
}

// The popover closes while the page goes away too; by then the editor is gone.
const refocus = () => { if (!props.editor.isDestroyed) props.editor.commands.focus() }
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :aria-describedby="undefined" @open-auto-focus="focusAlt" @close-auto-focus.prevent="refocus">
      <DialogHeader><DialogTitle>{{ target ? t('editor.image.describeTitle') : t('editor.image.insertTitle') }}</DialogTitle></DialogHeader>
      <form class="grid gap-4" novalidate @submit.prevent="insert">
        <template v-if="target">
          <img v-if="targetSrc" :src="targetSrc" alt="" class="max-h-40 w-full rounded-md border object-contain">
          <p v-else-if="targetSrc === null" class="text-sm text-muted-foreground">{{ t('editor.image.missing') }}</p>
        </template>
        <div v-if="!target && (images || upload)" class="grid gap-2">
          <Button v-if="images" type="button" @click="libraryOpen = true">{{ t('editor.image.fromLibrary') }}</Button>
          <Button v-if="upload" type="button" variant="secondary" @click="picker?.click()">{{ t('editor.image.upload') }}</Button>
          <input v-if="upload" ref="picker" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :accept="acceptOf('image')" @change="picked">
        </div>
        <div v-if="!target" class="grid gap-2">
          <Label :for="srcId">{{ images || upload ? t('editor.image.orAddress') : t('editor.image.address') }}</Label>
          <Input :id="srcId" v-model="src" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https://…" :aria-invalid="!!errors.src" @input="errors.src = undefined" />
          <p v-if="errors.src" role="alert" class="text-sm text-destructive">{{ errors.src }}</p>
        </div>
        <div class="grid gap-2">
          <Label :for="altId">{{ t('editor.image.description') }}</Label>
          <Input :id="altId" ref="altInput" v-model="alt" aria-required="true" :aria-invalid="!!errors.alt" @input="errors.alt = undefined" />
          <p v-if="errors.alt" role="alert" class="text-sm text-destructive">{{ errors.alt }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">{{ target ? t('editor.image.later') : t('editor.image.cancel') }}</Button>
          <Button type="submit" :variant="target ? 'default' : 'secondary'">{{ target ? t('editor.image.done') : t('editor.image.insert') }}</Button>
        </DialogFooter>
      </form>
      <LibraryPicker v-if="libraryOpen" v-model:open="libraryOpen" kind="image" :locale="locale ?? ''" @choose="fromLibrary" />
    </DialogContent>
  </Dialog>
</template>
