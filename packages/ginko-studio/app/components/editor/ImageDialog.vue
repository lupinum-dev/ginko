<!-- "Bild einfügen": the address of the picture and its description. A Markdown text stores an address, not an
     upload ID, so the upload picker of the image field does not fit here.
     With `describe` (the position of a picture that is already in the text, e.g. one that was just uploaded) it asks
     for the description only: the picture is there, the description is required. -->
<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from '#imports'
import { isSafeHref } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'

const props = defineProps<{ editor: Editor; /** Position of an image in the document that needs its description. */ describe?: number | null }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()

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

// The popover closes while the page goes away too; by then the editor is gone.
const refocus = () => { if (!props.editor.isDestroyed) props.editor.commands.focus() }
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent :aria-describedby="undefined" @open-auto-focus="focusAlt" @close-auto-focus.prevent="refocus">
      <DialogHeader><DialogTitle>{{ target ? t('editor.image.describeTitle') : t('editor.image.insertTitle') }}</DialogTitle></DialogHeader>
      <form class="grid gap-4" novalidate @submit.prevent="insert">
        <img v-if="target" :src="String(target.attrs.src)" alt="" class="max-h-40 w-full rounded-md border object-contain">
        <div v-if="!target" class="grid gap-2">
          <Label :for="srcId">{{ t('editor.image.address') }}</Label>
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
          <Button type="submit">{{ target ? t('editor.image.done') : t('editor.image.insert') }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
