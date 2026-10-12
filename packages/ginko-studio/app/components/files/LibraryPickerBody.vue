<!-- The inside of the picker (UI.md 10.3): the Finder with Recent selected, single select, and the
     primary button. A chosen photo without alt text (library or suggested) in the field's language asks for it before the
     picker closes (the alt rule of the image field). -->
<script setup lang="ts">
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
import { computed, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { useFilesLibrary } from '../../composables/useFilesLibrary'
import FilesBrowser from './FilesBrowser.vue'
import type { PickKind } from './util'

export interface Chosen { id: string; alt?: Record<string, string> }

const props = defineProps<{ kind: PickKind; locale: string }>()
const emit = defineEmits<{ choose: [chosen: Chosen]; cancel: [] }>()
const { t } = useI18n()
const lib = useFilesLibrary()

const selectedId = ref<string | null>(null)
const info = lib.info(() => selectedId.value)
const known = computed(() => (info.value && info.value.id === selectedId.value ? info.value : null))
const suggested = computed(() => {
  const alt = known.value?.altSuggestion ?? {}
  return Object.fromEntries(Object.entries(alt).filter(([, text]) => typeof text === 'string')) as Record<string, string>
})
/** The description written in the Files library: it applies to every use, so the field keeps its own text empty. */
const libraryAlt = computed(() => known.value?.alt?.[props.locale]?.trim() ?? '')
const needsAlt = computed(() => props.kind === 'image' && known.value !== null && !libraryAlt.value && !suggested.value[props.locale]?.trim())
const altText = ref('')
watch(selectedId, () => { altText.value = '' })

const ready = computed(() => known.value !== null && known.value.url !== null && (!needsAlt.value || altText.value.trim() !== ''))

function choose() {
  const file = known.value
  if (!file || !ready.value) return
  emit('choose', props.kind === 'image'
    ? { id: file.id, alt: libraryAlt.value ? {} : { ...suggested.value, ...(needsAlt.value ? { [props.locale]: altText.value.trim() } : {}) } }
    : { id: file.id })
}
</script>

<template>
  <div class="grid min-h-0 gap-4">
    <div class="max-h-[55vh] min-h-0 overflow-y-auto">
      <FilesBrowser :lib="lib" mode="picker" :kind="kind" :locales="[locale]" @select="selectedId = $event" />
    </div>
    <div v-if="needsAlt" class="grid gap-1.5">
      <div :class="CONTAINED_FIELD">
        <Label for="picker-alt" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('files.altLabel') }}</Label>
        <Input id="picker-alt" v-model="altText" type="text" required aria-required="true" aria-describedby="picker-alt-hint" />
      </div>
      <p id="picker-alt-hint" class="text-sm text-muted-foreground">{{ t('files.altHint') }}</p>
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" @click="emit('cancel')">{{ t('files.cancel') }}</Button>
      <Button type="button" :disabled="!ready" @click="choose">{{ kind === 'image' ? t('files.picker.usePhoto') : t('files.picker.useFile') }}</Button>
    </div>
  </div>
</template>
