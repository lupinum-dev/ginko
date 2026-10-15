<!-- Synced from templates/_features/ui/app/components/ui/dropdown-menu/DropdownMenuLabel.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { DropdownMenuLabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DropdownMenuLabel, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DropdownMenuLabelProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuLabel
    data-slot="dropdown-menu-label"
    v-bind="forwardedProps"
    :class="cn('px-3 py-2 text-xs font-medium text-muted-foreground', props.class)"
  >
    <slot />
  </DropdownMenuLabel>
</template>
