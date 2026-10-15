<!-- "Bild einfügen": first a picture from the Files library (the text stores `$file.<id>`, the editor shows the file),
     then a new upload (it goes in at the cursor like a dropped picture), and last a web address with its description.
     With `describe` (the position of a picture that is already in the text, e.g. one that was just uploaded) it asks
     for the description only: the picture is there; the description is required unless its library file has one.
     With `replace` ("Bild ersetzen" at a selected picture) the new picture takes the old one's place, as one step. -->
<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { acceptOf, isSafeHref } from '@lupinum/ginko/internal'
import { shownSrc, type FileImages } from '@lupinum/ginko-editor'
import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import type { Chosen } from '../files/LibraryPickerBody.vue'
import { ownAlt } from '../files/util'

const props = defineProps<{
  editor: Editor
  /** Position of an image in the document that needs its description. */
  describe?: number | null
  /** Position of an image in the document that a new picture replaces. */
  replace?: number | null
  /** The library files of the text's pictures; without it the dialog offers the web address only. */
  images?: FileImages
  /** The language of the text: a library picture takes its description in it. */
  locale?: string
  /** Uploads a picture at the cursor, or in place of the picture at `replace`; without it there is no upload button. */
  upload?: (file: File, replace?: number) => void
}>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
// The library loads when it is opened for the first time.
const LibraryPicker = defineAsyncComponent(() => import('../files/LibraryPicker.vue'))
const libraryOpen = ref(false)
const picker = ref<HTMLInputElement | null>(null)

const srcId = useId()
const altId = useId()
const hintId = useId()
const src = ref('')
const alt = ref('')
const errors = ref<{ src?: string; alt?: string }>({})

/** The picture at `pos`, when there is one. */
const imageAt = (pos: number | null | undefined): PmNode | undefined => {
  if (pos == null) return undefined
  const node = props.editor.state.doc.nodeAt(pos)
  return node?.type.name === 'image' ? node : undefined
}
// The document is not reactive: look again each time the dialog opens.
const target = computed(() => { void open.value; return imageAt(props.describe) })
const replaced = computed(() => { void open.value; return target.value ? undefined : imageAt(props.replace) })
/** What the picture that waits for its description shows: its address, or the URL of its library file. */
const targetSrc = computed(() => (target.value ? shownSrc(props.images, String(target.value.attrs.src ?? '')) : undefined))
/** The description of the picture's library file in the text's language: it applies when the text has none of its own. */
const libraryAlt = computed(() => (target.value ? props.images?.file(String(target.value.attrs.src ?? ''))?.alt?.[props.locale ?? '']?.trim() ?? '' : ''))
const altInput = ref<{ $el: HTMLInputElement } | HTMLInputElement | null>(null)
const title = computed(() => (target.value ? t('editor.image.describeTitle') : replaced.value ? t('editor.image.replace') : t('editor.image.insertTitle')))

watch(open, (isOpen) => {
  // A picture's description starts from its own text, else its library's. A replacing picture starts empty: the old
  // description would describe the wrong photo.
  if (isOpen) { src.value = ''; alt.value = String(target.value?.attrs.alt ?? '').trim() || libraryAlt.value; errors.value = {} }
})

/** The alt field is the one to type into when a picture waits for its description. */
function focusAlt(event: Event) {
  if (!target.value) return
  event.preventDefault()
  const el = altInput.value && '$el' in altInput.value ? altInput.value.$el : altInput.value
  el?.focus()
}

function describeImage() {
  if (!alt.value.trim() && !libraryAlt.value) { errors.value = { alt: t('editor.image.descriptionRequired') }; return }
  const pos = props.describe!
  props.editor.view.dispatch(props.editor.state.tr.setNodeAttribute(pos, 'alt', ownAlt(alt.value, libraryAlt.value)))
  open.value = false
}

/** Puts the new picture at the place of the replaced one, in one step (one undo). */
function put(image: { src: string; alt: string }) {
  if (!replaced.value) { props.editor.chain().focus().setImage(image).run(); return }
  const pos = props.replace!
  props.editor.view.dispatch(props.editor.state.tr.setNodeMarkup(pos, undefined, { ...replaced.value.attrs, ...image, title: null }))
}

function insert() {
  if (target.value) { describeImage(); return }
  const address = src.value.trim()
  const next: { src?: string; alt?: string } = {}
  if (!address || !isSafeHref(address)) next.src = t('editor.image.addressRefused')
  if (!alt.value.trim()) next.alt = t('editor.image.descriptionRequired')
  errors.value = next
  if (next.src || next.alt) return
  put({ src: address, alt: alt.value.trim() })
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
  put({ src: `$file.${chosen.id}`, alt: chosen.alt?.[props.locale ?? '']?.trim() ?? '' })
}

function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const replace = replaced.value ? props.replace! : undefined
  open.value = false
  props.upload?.(file, replace)
}

// The popover closes while the page goes away too; by then the editor is gone.
const refocus = () => { if (!props.editor.isDestroyed) props.editor.commands.focus() }
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :aria-describedby="undefined" @open-auto-focus="focusAlt" @close-auto-focus.prevent="refocus">
      <DialogHeader><DialogTitle>{{ title }}</DialogTitle></DialogHeader>
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
          <Input
            :id="altId" ref="altInput" v-model="alt" :aria-required="!libraryAlt" :aria-invalid="!!errors.alt" :aria-describedby="libraryAlt ? hintId : undefined"
            @input="errors.alt = undefined"
          />
          <p v-if="errors.alt" role="alert" class="text-sm text-destructive">{{ errors.alt }}</p>
          <p v-if="libraryAlt" :id="hintId" class="text-sm text-muted-foreground">{{ t('files.picker.altFromLibrary') }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">{{ target ? t('editor.image.later') : t('editor.image.cancel') }}</Button>
          <Button type="submit" :variant="target ? 'default' : 'secondary'">{{ target ? t('editor.image.done') : replaced ? t('editor.image.replaceSubmit') : t('editor.image.insert') }}</Button>
        </DialogFooter>
      </form>
      <LibraryPicker v-if="libraryOpen" v-model:open="libraryOpen" kind="image" :locale="locale ?? ''" @choose="fromLibrary" />
    </DialogContent>
  </Dialog>
</template>
