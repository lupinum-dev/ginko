<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { isOn } from './interactive-utils'
import { useText } from './text'

// Two forms. With `title`: a <details>/<summary> section readers open and close (works without JavaScript; `open` is
// the initial state). Without `title`: tall content (usually a long code block) is cut off behind a fade until the
// reader presses "Show more"; content that fits shows in full.
const props = defineProps<{ title?: string; open?: boolean | string; appearance?: 'quiet' | 'tint' }>()
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
  if (props.title || !region.value) return
  lines.value = region.value.querySelectorAll('pre .line').length
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(region.value)
})
onBeforeUnmount(() => observer?.disconnect())
// The button goes away with the click; focus moves to the content instead of falling back to the page.
async function expand() {
  expanded.value = true
  await nextTick()
  region.value?.focus()
}
</script>

<template>
  <details v-if="title" class="ginko-collapse" :open="isOpen || undefined" :data-appearance="appearance">
    <summary class="ginko-disclosure-summary">{{ title }}</summary>
    <div class="ginko-disclosure-body"><slot /></div>
  </details>
  <div v-else class="ginko-clip" :data-clipped="!expanded && !fits ? '' : undefined">
    <div :id="id" ref="region" class="ginko-clip-region" tabindex="-1"><slot /></div>
    <div v-if="!expanded && !fits" class="ginko-clip-fade">
      <button type="button" class="ginko-clip-button" :aria-controls="id" aria-expanded="false" @click="expand">
        {{ lines ? t('collapse.lines', { count: lines }) : t('collapse.more') }}
      </button>
    </div>
  </div>
</template>
