<!-- Synced from templates/_features/ui/app/components/ui/sheet/SheetTrigger.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { DialogTriggerProps } from 'reka-ui'
import { DialogTrigger } from 'reka-ui'

const props = defineProps<DialogTriggerProps>()
</script>

<template>
  <DialogTrigger data-slot="sheet-trigger" v-bind="props">
    <slot />
  </DialogTrigger>
</template>
