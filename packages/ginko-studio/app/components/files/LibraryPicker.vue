<!-- The library picker of the image and file fields (UI.md 10.3): a large Dialog on a wide screen, a
     bottom Sheet on the phone. Reports the chosen file; the field decides what to store. -->
<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from '#imports'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@studio/components/ui/sheet'
import LibraryPickerBody, { type Chosen } from './LibraryPickerBody.vue'
import type { PickKind } from './util'

defineProps<{ open: boolean; kind: PickKind; locale: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; choose: [chosen: Chosen] }>()
const { t } = useI18n()
const wide = useMediaQuery('(min-width: 640px)')
// A native modal <dialog> (a Today task sheet) sits in the top layer above everything in <body>, so the
// picker teleports into the innermost open one to share that layer; elsewhere it stays in <body>.
const portalTo = Array.from(document.querySelectorAll<HTMLElement>('dialog[open]')).at(-1)
// Inside a native dialog Escape would also reach the dialog's own cancel (the task sheet's discard guard).
// Cancelling the key press stops that; the picker then closes itself.
function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  emit('update:open', false)
}
</script>

<template>
  <Dialog v-if="wide" :open="open" @update:open="emit('update:open', $event)">
    <DialogContent :portal-to="portalTo" class="sm:max-w-5xl" aria-describedby="undefined" @escape-key-down="onEscape">
      <DialogHeader><DialogTitle>{{ t('files.title') }}</DialogTitle></DialogHeader>
      <LibraryPickerBody :kind="kind" :locale="locale" @choose="emit('choose', $event)" @cancel="emit('update:open', false)" />
    </DialogContent>
  </Dialog>
  <Sheet v-else :open="open" @update:open="emit('update:open', $event)">
    <SheetContent :portal-to="portalTo" side="bottom" class="max-h-[92vh] overflow-y-auto p-4" aria-describedby="undefined" @escape-key-down="onEscape">
      <SheetHeader class="p-0"><SheetTitle>{{ t('files.title') }}</SheetTitle></SheetHeader>
      <LibraryPickerBody :kind="kind" :locale="locale" @choose="emit('choose', $event)" @cancel="emit('update:open', false)" />
    </SheetContent>
  </Sheet>
</template>
