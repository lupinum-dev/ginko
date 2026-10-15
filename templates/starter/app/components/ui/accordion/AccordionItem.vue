<!-- Synced from templates/_features/ui/app/components/ui/accordion/AccordionItem.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { AccordionItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { AccordionItem, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<AccordionItemProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AccordionItem
    v-slot="slotProps"
    data-slot="accordion-item"
    v-bind="forwardedProps"
    :class="cn('border-b', props.class)"
  >
    <slot v-bind="slotProps" />
  </AccordionItem>
</template>
