<!-- Find and replace inside the field: a row in the toolbar's sticky bar. The search itself lives in the editor core (search.ts);
     this bar sets the term, steps through the matches and replaces. Esc closes it and clears the highlights. A click on a
     button leaves the focus where it was (the search field), so Enter goes on to the next match. Two rows on one grid:
     the search field with its counter, Zurück and Weiter above the replace field, Ersetzen and Alle ersetzen. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { useElementSize } from '@vueuse/core'
import { searchInfo } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import { useEditorTick } from './context.ts'

const props = defineProps<{ editor: Editor }>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const tick = useEditorTick(() => props.editor)
const term = ref('')
const replacement = ref('')
const searchEl = ref<InstanceType<typeof Input>>()
/** The counter sits in the search field; the field's text stops before it, however long the counter's text is. */
const counterEl = ref<HTMLElement>()
const { width: counterWidth } = useElementSize(counterEl)
const info = computed(() => { void tick.value; return searchInfo(props.editor) })
/** How many places the last "Alle ersetzen" changed; shown instead of the counter, which then says "Keine Treffer". */
const replaced = ref<number>()
const counter = computed(() => {
  if (replaced.value !== undefined) return t('editor.find.replaced', { count: replaced.value })
  return !info.value.term ? '' : info.value.total === 0 ? t('editor.find.none') : t('editor.find.count', { current: info.value.current, total: info.value.total })
})
watch([term, replacement], () => { replaced.value = undefined })

function run(value: string) { props.editor.commands.setSearch(value) }
function onTerm(value: string | number) { term.value = String(value); run(term.value) }
function step(command: () => boolean) { replaced.value = undefined; command() }
function replaceAll() {
  const count = info.value.total
  if (props.editor.commands.replaceAll(replacement.value)) replaced.value = count
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  // A selected single line becomes the term, as in other editors.
  const { from, to, empty } = props.editor.state.selection
  const selected = empty ? '' : props.editor.state.doc.textBetween(from, to, ' ')
  if (selected && selected.length <= 200) term.value = selected
  run(term.value)
  await nextTick()
  const el = (searchEl.value?.$el ?? searchEl.value) as HTMLInputElement | undefined
  el?.focus()
  el?.select()
})

function close() {
  open.value = false
  replaced.value = undefined
  props.editor.commands.setSearch('')
  props.editor.commands.focus()
}
// No cleanup on unmount: the bar unmounts only with its editor, which is destroyed by then and takes its highlights with it.
// A text reopened from outside (a value from the server, a restored draft) is a new editor: the open bar's term carries over.
watch(() => props.editor, (next) => { if (open.value && term.value) next.commands.setSearch(term.value) })

function onSearchEnter(event: KeyboardEvent) {
  step(() => (event.shiftKey ? props.editor.commands.findPrev() : props.editor.commands.findNext()))
}
const nothing = computed(() => info.value.total === 0)
</script>

<template>
  <!-- -mx-1/px-1: the divider runs from edge to edge of the bar, as the bar's own border does. -->
  <div v-if="open" role="search" class="-mx-1 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1 border-t px-1 pt-1" @keydown.esc.stop.prevent="close">
    <div class="relative min-w-0">
      <Input
        ref="searchEl" :model-value="term" class="h-8 [@media(pointer:coarse)]:h-11" :style="counter ? { paddingRight: `${counterWidth + 20}px` } : undefined"
        :placeholder="t('editor.find.search')" :aria-label="t('editor.find.search')" @update:model-value="onTerm" @keydown.enter.prevent="onSearchEnter"
      />
      <span ref="counterEl" class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground tabular-nums" aria-live="polite">{{ counter }}</span>
    </div>
    <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @mousedown.prevent @click="step(() => editor.commands.findPrev())">{{ t('editor.find.prev') }}</Button>
    <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @mousedown.prevent @click="step(() => editor.commands.findNext())">{{ t('editor.find.next') }}</Button>
    <Input v-model="replacement" class="h-8 [@media(pointer:coarse)]:h-11" :placeholder="t('editor.find.replaceWith')" :aria-label="t('editor.find.replaceWith')" @keydown.enter.prevent="step(() => editor.commands.replaceCurrent(replacement))" />
    <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @mousedown.prevent @click="step(() => editor.commands.replaceCurrent(replacement))">{{ t('editor.find.replace') }}</Button>
    <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @mousedown.prevent @click="replaceAll">{{ t('editor.find.replaceAll') }}</Button>
  </div>
</template>
