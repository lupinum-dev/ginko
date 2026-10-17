<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { X } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogClose, DialogContent, DialogPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'
import SheetOverlay from './SheetOverlay.vue'

// Trimmed from shadcn-vue: a panel from the inline start or end, so it opens from the right in right-to-left
// languages. Focus trap, Escape and focus return come from reka-ui. The close button's label is a prop, because
// this component has no texts of its own.
interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  side?: 'start' | 'end'
  closeLabel?: string
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<SheetContentProps>(), {
  side: 'start',
  closeLabel: 'Close',
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'side', 'closeLabel')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <SheetOverlay />
    <DialogContent
      data-slot="sheet-content"
      :class="cn(
        'fixed inset-y-0 z-50 flex h-full w-11/12 max-w-sm flex-col gap-6 bg-background shadow-overlay data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:ease-out',
        side === 'start' && 'start-0 border-e data-[state=closed]:slide-out-to-start data-[state=open]:slide-in-from-start',
        side === 'end' && 'end-0 border-s data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end',
        props.class)"
      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />

      <DialogClose
        class="absolute end-3 top-3 inline-flex size-11 items-center justify-center rounded-md text-foreground transition-[color,background-color,border-color] duration-150 hover:bg-accent"
      >
        <X class="size-5" aria-hidden="true" />
        <span class="sr-only">{{ closeLabel }}</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
