<!-- Small menu above a text selection: the marks people reach for most. -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from '#imports'
import { Bold, Code, Italic, Link } from '@lucide/vue'
import { profileCovers, type MarkdownProfile } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { TooltipProvider } from '@studio/components/ui/tooltip'
import { isCoarsePointer, useEditorTick, useModKey } from './context.ts'
import ToolToggle from './ToolToggle.vue'

const props = defineProps<{ editor: Editor; profile: MarkdownProfile }>()
const emit = defineEmits<{ link: [] }>()
const { t } = useI18n()
const mod = useModKey()

const tick = useEditorTick(() => props.editor)
const active = (name: string) => { void tick.value; return props.editor.isActive(name) }
const has = (name: string) => name in props.editor.schema.marks

// Only while the editor has the focus (after a save or a click elsewhere the menu is gone; it stays mounted, because
// adding or removing the menu would reset the other plugins, the slash menu among them), and never on a touch
// screen, where it would hide behind the finger and the system's own selection menu.
const touch = isCoarsePointer()
const focused = ref(props.editor.view?.hasFocus() ?? false)
watch(() => props.editor, (editor, _before, onCleanup) => {
  const on = () => { focused.value = true }
  const off = () => { focused.value = false }
  editor.on('focus', on)
  editor.on('blur', off)
  onCleanup(() => { editor.off('focus', on); editor.off('blur', off) })
}, { immediate: true })

// Not for a selected block (a component, a rule) and not in code blocks (no marks there).
const shouldShow = ({ editor, state }: { editor: Editor; state: Editor['state'] }) =>
  !touch && !(state.selection instanceof NodeSelection) && !state.selection.empty && editor.isEditable && editor.view.hasFocus() && !editor.isActive('codeBlock') && !editor.isActive('mathBlock') && !editor.isActive('mermaid')
</script>

<template>
  <BubbleMenu class="z-50" :editor="editor" :should-show="shouldShow" :options="{ placement: 'top', offset: 8 }">
    <TooltipProvider :delay-duration="300">
      <div v-show="focused" class="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md">
        <ToolToggle v-if="has('bold')" :label="t('editor.marks.bold')" :shortcut="`${mod()}B`" :pressed="active('bold')" @toggle="editor.chain().focus().toggleBold().run()"><Bold aria-hidden="true" /></ToolToggle>
        <ToolToggle v-if="has('italic')" :label="t('editor.marks.italic')" :shortcut="`${mod()}I`" :pressed="active('italic')" @toggle="editor.chain().focus().toggleItalic().run()"><Italic aria-hidden="true" /></ToolToggle>
        <ToolToggle v-if="has('code') && profileCovers(profile, 'rich')" :label="t('editor.marks.code')" :pressed="active('code')" @toggle="editor.chain().focus().toggleCode().run()"><Code aria-hidden="true" /></ToolToggle>
        <ToolToggle v-if="has('link')" :label="t('editor.marks.link')" :shortcut="`${mod()}K`" :pressed="active('link')" @toggle="emit('link')"><Link aria-hidden="true" /></ToolToggle>
      </div>
    </TooltipProvider>
  </BubbleMenu>
</template>
