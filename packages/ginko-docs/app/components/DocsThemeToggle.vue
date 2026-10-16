<script setup lang="ts">
// Auto, light or dark. Auto follows the system and is the default; a choice lives in localStorage and
// <html data-theme>, and the head script applies it before paint. Both icons are in the HTML and CSS shows the
// right one, so the server render never guesses the reader's scheme.
import { COLOR_KEY, colorInitScript } from '../lib/docsInit'

const { t } = useI18n()
useHead({ script: [{ key: 'docs-color-init', innerHTML: colorInitScript(), tagPriority: 'critical' }] })

// `segmented` is the phone menu's Auto/Light/Dark switch: the same states and the same storage.
const props = defineProps<{ segmented?: boolean }>()
type Choice = 'auto' | 'light' | 'dark'
const system = (): 'light' | 'dark' => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const current = (): Choice => (document.documentElement.getAttribute('data-theme') as Choice | null) ?? 'auto'
// Only read when the switch is on screen (the phone menu renders on the client), so SSR never guesses.
const choice = ref<Choice>(props.segmented && import.meta.client ? current() : 'auto')

function choose(next: Choice) {
  const html = document.documentElement
  if (next === 'auto') html.removeAttribute('data-theme')
  else html.setAttribute('data-theme', next)
  choice.value = next
  try {
    if (next === 'auto') localStorage.removeItem(COLOR_KEY)
    else localStorage.setItem(COLOR_KEY, next)
  } catch { /* storage blocked: the choice lasts until reload */ }
}
// The header button flips what the reader sees; flipping back to the system's scheme returns to Auto.
function toggle() {
  const shown = current() === 'auto' ? system() : current()
  const next = shown === 'dark' ? 'light' : 'dark'
  choose(next === system() ? 'auto' : next)
}
const OPTIONS = ['auto', 'light', 'dark'] as const
</script>

<template>
  <div v-if="props.segmented" class="docs-segmented" role="group" :aria-label="t('docs.theme.label')">
    <button v-for="o in OPTIONS" :key="o" type="button" :aria-pressed="choice === o" @click="choose(o)">{{ t(`docs.theme.${o}`) }}</button>
  </div>
  <button v-else type="button" class="docs-icon-button docs-theme-toggle" :aria-label="t('docs.theme.toggle')" :title="t('docs.theme.toggle')" @click="toggle">
    <Icon name="lucide:moon" class="docs-icon docs-when-light" />
    <Icon name="lucide:sun" class="docs-icon docs-when-dark" />
  </button>
</template>
