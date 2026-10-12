<!-- One icon button of the toolbar or the bubble menu: a shadcn Toggle with a Tooltip. mousedown is
     prevented so the editor keeps its selection while the button is used. -->
<script setup lang="ts">
import { Toggle } from '@studio/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@studio/components/ui/tooltip'

defineProps<{ label: string; shortcut?: string; pressed: boolean; disabled?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Toggle size="sm" class="h-8 min-w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11" :model-value="pressed" :disabled="disabled" :aria-label="label" @mousedown.prevent @update:model-value="emit('toggle')">
        <slot />
      </Toggle>
    </TooltipTrigger>
    <TooltipContent>{{ label }}<template v-if="shortcut"> ({{ shortcut }})</template></TooltipContent>
  </Tooltip>
</template>
