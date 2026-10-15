<script setup lang="ts">
import type { AccordionTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { AccordionHeader, AccordionTrigger } from 'reka-ui'
import { cn } from '@/lib/utils'

// Trimmed from shadcn-vue: body-size question, the global focus ring, and the heading level from the block that
// uses it (`headingLevel`), so the page outline stays right.
const props = withDefaults(defineProps<AccordionTriggerProps & { class?: HTMLAttributes['class'], headingLevel?: 'h2' | 'h3' | 'h4' }>(), {
  headingLevel: 'h3',
})

const delegatedProps = reactiveOmit(props, 'class', 'headingLevel')
</script>

<template>
  <AccordionHeader :as="headingLevel" class="flex">
    <AccordionTrigger
      data-slot="accordion-trigger"
      v-bind="delegatedProps"
      :class="cn(
        'group flex min-h-11 flex-1 items-start justify-between gap-6 py-5 text-start text-body font-medium transition-colors duration-150 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-60',
        props.class)"
    >
      <slot />
      <ChevronDown
        class="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </AccordionTrigger>
  </AccordionHeader>
</template>
