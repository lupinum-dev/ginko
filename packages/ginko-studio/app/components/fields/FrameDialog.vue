<!-- "Ausschnitt": the frames view of one library photo (ImageFrames) where there is no room for it in place, from a
     gallery tile and from the menu of a cropped picture in a text. The point is saved as it is set; the dialog only
     shows and closes. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import type { ImageFrame } from '@lupinum/ginko/internal'
import type { UploadDetails } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import ImageFrames from './ImageFrames.vue'

defineProps<{ id: string; fileId: string; file: UploadDetails; frames: ImageFrame[] }>()
const emit = defineEmits<{ closeAutoFocus: [event: Event] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg" :aria-describedby="undefined" @close-auto-focus="emit('closeAutoFocus', $event)">
      <DialogHeader><DialogTitle>{{ t('fields.image.frames.dialog') }}</DialogTitle></DialogHeader>
      <ImageFrames :id="id" :file-id="fileId" :file="file" :frames="frames" />
      <DialogFooter>
        <Button type="button" @click="open = false">{{ t('fields.image.frames.done') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
