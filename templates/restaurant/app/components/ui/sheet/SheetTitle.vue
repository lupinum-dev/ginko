<!-- Synced from templates/_features/ui/app/components/ui/sheet/SheetTitle.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogTitle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DialogTitle
    data-slot="sheet-title"
    v-bind="forwardedProps"
    :class="cn('font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
