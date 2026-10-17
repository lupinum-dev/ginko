<!-- Synced from templates/_features/faq/app/components/ui/accordion/AccordionContent.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { AccordionContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AccordionContent } from 'reka-ui'
import { cn } from '@/lib/utils'

// On paper every answer shows: a closed one (kept in the page with `unmount-on-hide="false"`, hidden until found)
// opens for print.
const props = defineProps<AccordionContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AccordionContent
    data-slot="accordion-content"
    v-bind="delegatedProps"
    class="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down print:block print:h-auto print:[content-visibility:visible]"
  >
    <div :class="cn('max-w-prose pb-6 text-muted-foreground', props.class)">
      <slot />
    </div>
  </AccordionContent>
</template>
