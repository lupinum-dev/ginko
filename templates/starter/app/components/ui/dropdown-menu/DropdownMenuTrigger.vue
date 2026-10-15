<!-- Synced from templates/_features/ui/app/components/ui/dropdown-menu/DropdownMenuTrigger.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { DropdownMenuTriggerProps } from 'reka-ui'
import { DropdownMenuTrigger, useForwardProps } from 'reka-ui'

const props = defineProps<DropdownMenuTriggerProps>()

const forwardedProps = useForwardProps(props)
</script>

<template>
  <DropdownMenuTrigger data-slot="dropdown-menu-trigger" v-bind="forwardedProps">
    <slot />
  </DropdownMenuTrigger>
</template>
