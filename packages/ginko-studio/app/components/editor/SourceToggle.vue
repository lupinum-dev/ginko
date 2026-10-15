<!-- "Markdown": switches between the rich text and the Markdown source of the same text. Icon and word where there is
     room, else the icon alone (the aria-label keeps the word). The toolbar decides by its own width (`word`); without
     `word`, as above the source, the word shows from the md viewport on. -->
<script setup lang="ts">
import { FileCode } from '@lucide/vue'
import { useI18n } from '#imports'
import { Toggle } from '@studio/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@studio/components/ui/tooltip'

withDefaults(defineProps<{ pressed: boolean; word?: boolean }>(), { word: undefined })
const { t } = useI18n()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Toggle
        size="sm" class="h-8 min-w-8 shrink-0 gap-1.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11" :model-value="pressed" aria-label="Markdown"
        @mousedown.prevent @update:model-value="emit('toggle')"
      >
        <FileCode aria-hidden="true" />
        <span v-if="word !== false" :class="word === undefined && 'hidden md:inline'">Markdown</span>
      </Toggle>
    </TooltipTrigger>
    <TooltipContent>{{ pressed ? t('editor.source.back') : t('editor.source.show') }}</TooltipContent>
  </Tooltip>
</template>
