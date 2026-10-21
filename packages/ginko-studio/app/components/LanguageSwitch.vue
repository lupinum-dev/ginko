<!-- The language switch of a form (UI.md 4, 3.1): one button per language of the site, with a dot where texts are
     missing. Alles bearbeiten and the quick-task sheet use it. -->
<script setup lang="ts">
import type { Locale } from '@lupinum/ginko'
import { useI18n } from '#imports'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { languageLabel } from '../utils/content'

defineProps<{
  locales: readonly Locale[]
  modelValue: Locale
  /** Texts are missing (or outdated) in this language: a dot on its button. */
  gap: (locale: Locale) => boolean
  /** The other languages cannot be chosen now. They stay pressable, so the form can say why. */
  blocked?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [locale: Locale] }>()
const { t, locale: uiLocale } = useI18n()
</script>

<template>
  <ToggleGroup
    type="single" variant="segmented" class="data-[variant=segmented]:p-0.5" :model-value="modelValue" :aria-label="t('entry.language')"
    @update:model-value="(next) => typeof next === 'string' && next && emit('update:modelValue', next)"
  >
    <ToggleGroupItem v-for="l in locales" :key="l" :value="l" :aria-disabled="blocked && l !== modelValue ? 'true' : undefined" class="h-7 gap-1.5 rounded-md px-3 text-[13px] pointer-coarse:h-11 pointer-coarse:text-sm">
      {{ languageLabel(l, uiLocale) }}
      <template v-if="gap(l)">
        <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />
        <span class="sr-only">({{ t('basics.translation.incomplete') }})</span>
      </template>
    </ToggleGroupItem>
  </ToggleGroup>
</template>
