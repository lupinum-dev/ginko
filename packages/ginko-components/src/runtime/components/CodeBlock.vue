<script setup lang="ts">
// The renderer for `pre` (a plain Markdown tag, so no registry entry): the highlighted code from the tree, a label
// (filename, "Terminal" for shell code, else the language) with an icon, and a button that copies the plain code text.
import { computed, onBeforeUnmount, ref } from 'vue'
import CodeIcon from './CodeIcon.vue'
import { codeLabel } from './file-icons'
import { useText } from './text'

// The parser's `class` (shiki theme classes) belongs on the inner <pre>, not on the wrapper.
defineOptions({ inheritAttrs: false })
// `highlights`, `meta` and `code` are tree props this component does not need; declaring them keeps them off the DOM.
// `bare`: inside a code group or tree, which show the label themselves.
const props = defineProps<{ language?: string; filename?: string; highlights?: number[]; meta?: string; code?: string; bare?: boolean }>()

const t = useText()
const label = computed(() => (props.bare ? undefined : codeLabel(props, t('code.terminal'))))
const pre = ref<HTMLElement>()
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  const text = (pre.value?.textContent ?? '').replace(/\n$/, '')
  try { await navigator.clipboard.writeText(text) } catch { return }
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 2000)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="ginko-code" :data-bare="bare || undefined" :data-labelled="label?.text ? '' : undefined">
    <div v-if="label?.text" class="ginko-code-label"><CodeIcon :name="label.icon" :file="label.file" />{{ label.text }}</div>
    <button type="button" class="ginko-code-copy" :aria-label="t('code.copy')" @click="copy">
      <CodeIcon :name="copied ? 'check' : 'copy'" />
      <span class="ginko-code-status" aria-live="polite">{{ copied ? t('code.copied') : '' }}</span>
    </button>
    <pre ref="pre" v-bind="$attrs" tabindex="0"><slot /></pre>
  </div>
</template>
