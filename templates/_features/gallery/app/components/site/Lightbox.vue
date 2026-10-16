<script setup lang="ts">
import type { ImageValue } from '@lupinum/ginko'
import { ArrowLeft, ArrowRight } from '@lucide/vue'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

/**
 * The one lightbox of a gallery: the photo as large as fits, its alt text as caption, previous and next (buttons and
 * arrow keys), and Escape to close. reka-ui keeps the focus inside and the page still; on close the focus returns
 * to the photo that is shown last (`focusPhoto`, from the gallery that opened it).
 */
const props = defineProps<{ images: ImageValue[], focusPhoto: (index: number) => void }>()
const open = defineModel<boolean>('open', { required: true })
const index = defineModel<number>('index', { required: true })
const { t } = useI18n('gallery')
const image = computed(() => props.images[index.value])
const go = (step: number) => { index.value = (index.value + step + props.images.length) % props.images.length }
function onKey(event: KeyboardEvent) {
  const rtl = getComputedStyle(event.currentTarget as Element).direction === 'rtl'
  if (event.key === 'ArrowRight') go(rtl ? -1 : 1)
  if (event.key === 'ArrowLeft') go(rtl ? 1 : -1)
}
function returnFocus(event: Event) {
  event.preventDefault()
  props.focusPhoto(index.value)
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogContent
        :aria-describedby="undefined"
        class="dark fixed inset-0 z-50 flex bg-background/95 flex-col items-center justify-center gap-4 p-4 text-foreground focus-visible:outline-none md:p-10"
        @keydown="onKey"
        @close-auto-focus="returnFocus"
      >
        <DialogTitle class="sr-only">{{ t('title') }}</DialogTitle>
        <figure v-if="image" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          <GinkoImage :image="image" sizes="100vw" class="max-h-full min-h-0 w-auto max-w-full rounded-md object-contain" />
          <figcaption v-if="image.alt" class="max-w-prose text-center text-small">{{ image.alt }}</figcaption>
        </figure>
        <div class="flex items-center gap-2">
          <Button variant="ghost" size="icon" :disabled="images.length < 2" @click="go(-1)">
            <ArrowLeft class="rtl:-scale-x-100" aria-hidden="true" />
            <span class="sr-only">{{ t('previous') }}</span>
          </Button>
          <p class="min-w-16 text-center text-small tabular-nums" aria-live="polite">{{ t('counter', { n: index + 1, count: images.length }) }}</p>
          <Button variant="ghost" size="icon" :disabled="images.length < 2" @click="go(1)">
            <ArrowRight class="rtl:-scale-x-100" aria-hidden="true" />
            <span class="sr-only">{{ t('next') }}</span>
          </Button>
          <DialogClose as-child>
            <Button variant="outline">{{ t('close') }}</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
