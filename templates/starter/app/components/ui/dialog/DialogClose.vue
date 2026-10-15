<!-- Synced from templates/_features/ui/app/components/ui/dialog/DialogClose.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { DialogCloseProps } from 'reka-ui'
import { DialogClose } from 'reka-ui'

const props = defineProps<DialogCloseProps>()
</script>

<template>
  <DialogClose data-slot="dialog-close" v-bind="props">
    <slot />
  </DialogClose>
</template>
