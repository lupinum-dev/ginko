<!-- The inside of the picker (UI.md 10.3): the Finder with Recent selected, single select, and the
     primary button. A selected photo shows its description in the field's language before it is used: the library's,
     else a suggestion, else empty. Without one it asks for it before the picker closes (the alt rule of the image field). -->
<script setup lang="ts">
import { CONTAINED_FIELD } from '@studio/components/fields/sizes'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { useFilesLibrary } from '../../composables/useFilesLibrary'
import FilesBrowser from './FilesBrowser.vue'
import { ownAlt, type PickKind } from './util'

/**
 * `alt`: what a place stores as its own description (empty when the library's applies). `libraryAlt`: the library's
 * description in the picker's language, for a place that must carry the text itself (a component's `alt` prop).
 */
export interface Chosen { id: string; alt?: Record<string, string>; libraryAlt?: string }

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
/** The description written in the Files library: it applies to every use, so a place keeps its own text empty. */
const libraryAlt = computed(() => known.value?.alt?.[props.locale]?.trim() ?? '')
const describing = computed(() => props.kind === 'image' && known.value !== null)
const altText = ref('')
const altMissing = ref(false)
const altInput = ref<InstanceType<typeof Input>>()
// Each selected photo starts from the text that would apply.
watch(() => known.value?.id, () => {
  altText.value = libraryAlt.value || suggested.value[props.locale]?.trim() || ''
  altMissing.value = false
})

const ready = computed(() => known.value !== null && known.value.url !== null)

async function choose() {
  const file = known.value
  if (!file || !ready.value) return
  if (props.kind !== 'image') { emit('choose', { id: file.id }); return }
  const typed = altText.value.trim()
  if (!typed && !libraryAlt.value) {
    altMissing.value = true
    await nextTick()
    const el = (altInput.value?.$el ?? altInput.value) as HTMLInputElement | undefined
    el?.focus()
    return
  }
  if (!libraryAlt.value) { emit('choose', { id: file.id, alt: { ...suggested.value, [props.locale]: typed } }); return }
  const own = ownAlt(typed, libraryAlt.value)
  emit('choose', { id: file.id, alt: own ? { [props.locale]: own } : {}, libraryAlt: libraryAlt.value })
}
</script>

<template>
  <div class="grid min-h-0 gap-4">
    <!-- Phones: one column that scrolls. From md the browser has its own height and scrolls its two columns apart. -->
    <div class="max-h-[55vh] min-h-0 overflow-y-auto md:max-h-none md:overflow-visible">
      <FilesBrowser :lib="lib" mode="picker" :kind="kind" :locales="[locale]" @select="selectedId = $event" />
    </div>
    <div v-if="describing && known" class="flex items-start gap-3">
      <img v-if="known.url" :src="known.url" alt="" class="size-12 shrink-0 rounded-md border object-cover">
      <div class="grid min-w-0 flex-1 gap-1.5">
        <div :class="CONTAINED_FIELD">
          <Label for="picker-alt" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('files.altLabel') }}</Label>
          <Input
            id="picker-alt" ref="altInput" v-model="altText" type="text" :required="!libraryAlt" :aria-required="!libraryAlt" :aria-invalid="altMissing"
            :aria-describedby="altMissing ? 'picker-alt-error picker-alt-hint' : 'picker-alt-hint'" @update:model-value="altMissing = false"
          />
        </div>
        <p v-if="altMissing" id="picker-alt-error" role="alert" class="text-sm text-destructive">{{ t('editor.image.descriptionRequired') }}</p>
        <p id="picker-alt-hint" class="text-sm text-muted-foreground">{{ libraryAlt ? t('files.picker.altFromLibrary') : t('files.altHint') }}</p>
      </div>
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" @click="emit('cancel')">{{ t('files.cancel') }}</Button>
      <Button type="button" :disabled="!ready" @click="choose">{{ kind === 'image' ? t('files.picker.usePhoto') : t('files.picker.useFile') }}</Button>
    </div>
  </div>
</template>
