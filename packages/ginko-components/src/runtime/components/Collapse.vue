<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { isOn } from './interactive-utils'
import { useText } from './text'

// Two forms. With `label`: a <details>/<summary> section readers open and close (works without JavaScript; `open` is
// the initial state). Without `label`: tall content (usually a long code block) is cut off behind a fade until the
// reader presses "Show more"; content that fits shows in full.
const props = defineProps<{ label?: string; open?: boolean | string }>()
const isOpen = computed(() => isOn(props.open))
const t = useText()

const id = useId()
const region = ref<HTMLElement>()
const expanded = ref(false)
const fits = ref(false)
const lines = ref(0)
let observer: ResizeObserver | undefined
function measure() {
  const el = region.value
  if (el) fits.value = el.scrollHeight - el.clientHeight <= 2
}
onMounted(() => {
  if (props.label || !region.value) return
  lines.value = region.value.querySelectorAll('pre .line').length
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(region.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <details v-if="label" class="ginko-collapse" :open="isOpen || undefined">
    <summary class="ginko-disclosure-summary">{{ label }}</summary>
    <div class="ginko-disclosure-body"><slot /></div>
  </details>
  <div v-else class="ginko-clip" :data-clipped="!expanded && !fits ? '' : undefined">
    <div :id="id" ref="region" class="ginko-clip-region"><slot /></div>
    <div v-if="!expanded && !fits" class="ginko-clip-fade">
      <button type="button" class="ginko-clip-button" :aria-controls="id" aria-expanded="false" @click="expanded = true">
        {{ lines ? t('collapse.lines', { count: lines }) : t('collapse.more') }}
      </button>
    </div>
  </div>
</template>
