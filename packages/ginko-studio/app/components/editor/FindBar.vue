<!-- Find and replace inside the field: a small bar above the text. The search itself lives in the editor core (search.ts);
     this bar sets the term, steps through the matches and replaces. Esc closes it and clears the highlights. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from '#imports'
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
  <div v-if="open" role="search" class="flex flex-wrap items-center gap-1.5 border-b bg-background p-1.5" @keydown.esc.stop.prevent="close">
    <Input ref="searchEl" :model-value="term" class="h-8 min-w-32 flex-1 [@media(pointer:coarse)]:h-11" :placeholder="t('editor.find.search')" :aria-label="t('editor.find.search')" @update:model-value="onTerm" @keydown.enter.prevent="onSearchEnter" />
    <Input v-model="replacement" class="h-8 min-w-32 flex-1 [@media(pointer:coarse)]:h-11" :placeholder="t('editor.find.replaceWith')" :aria-label="t('editor.find.replaceWith')" @keydown.enter.prevent="step(() => editor.commands.replaceCurrent(replacement))" />
    <span class="min-w-16 text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">{{ counter }}</span>
    <div class="flex flex-wrap items-center gap-1">
      <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @click="step(() => editor.commands.findPrev())">{{ t('editor.find.prev') }}</Button>
      <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @click="step(() => editor.commands.findNext())">{{ t('editor.find.next') }}</Button>
      <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @click="step(() => editor.commands.replaceCurrent(replacement))">{{ t('editor.find.replace') }}</Button>
      <Button type="button" variant="outline" size="sm" class="[@media(pointer:coarse)]:h-11" :disabled="nothing" @click="replaceAll">{{ t('editor.find.replaceAll') }}</Button>
    </div>
  </div>
</template>
