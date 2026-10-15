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
</script>

<template>
  <Dialog v-if="wide" :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-5xl" aria-describedby="undefined">
      <DialogHeader><DialogTitle>{{ t('files.title') }}</DialogTitle></DialogHeader>
      <LibraryPickerBody :kind="kind" :locale="locale" @choose="emit('choose', $event)" @cancel="emit('update:open', false)" />
    </DialogContent>
  </Dialog>
  <Sheet v-else :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="bottom" class="max-h-[92vh] overflow-y-auto p-4" aria-describedby="undefined">
      <SheetHeader class="p-0"><SheetTitle>{{ t('files.title') }}</SheetTitle></SheetHeader>
      <LibraryPickerBody :kind="kind" :locale="locale" @choose="emit('choose', $event)" @cancel="emit('update:open', false)" />
    </SheetContent>
  </Sheet>
</template>
