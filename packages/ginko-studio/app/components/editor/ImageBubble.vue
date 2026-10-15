<!-- Small menu at a selected picture: the description in use and what can be done with the picture. Unlike the text
     menu (EditorBubble) also on touch screens, where a selected picture has no system menu. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import type { FileImages } from '@lupinum/ginko-editor'
import type { Editor } from '@tiptap/core'
import { NodeSelection, type Selection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { Button } from '@studio/components/ui/button'
import { useEditorTick } from './context.ts'

const props = defineProps<{
  editor: Editor
  /** The library files of the text's pictures: a picture without its own description shows the library's. */
  images?: FileImages
  /** The language of the text. */
  locale: string
  /** The site has a picture-with-caption block: "Bildunterschrift" turns the picture into it. */
  caption?: boolean
}>()
const emit = defineEmits<{ describe: [pos: number]; replace: [pos: number]; caption: [pos: number] }>()
const { t } = useI18n()
const tick = useEditorTick(() => props.editor)

const isPicture = (selection: Selection): selection is NodeSelection => selection instanceof NodeSelection && selection.node.type.name === 'image'
const picture = computed(() => {
  void tick.value
  const { selection } = props.editor.state
  return isPicture(selection) ? { pos: selection.from, src: String(selection.node.attrs.src ?? ''), alt: String(selection.node.attrs.alt ?? '').trim() } : undefined
})
const description = computed(() => {
  const shown = picture.value
  if (!shown) return ''
  if (shown.alt) return t('editor.image.descriptionIs', { text: shown.alt })
  const library = props.images?.file(shown.src)?.alt?.[props.locale]?.trim()
  return library ? t('editor.image.descriptionFromFiles', { text: library }) : t('editor.image.noDescriptionYet')
})

// While the text or the menu itself (Tab from the text) has the focus; not once the editor is gone (see EditorBubble).
const shouldShow = ({ editor, state, element }: { editor: Editor; state: Editor['state']; element: HTMLElement }) =>
  !editor.isDestroyed && isPicture(state.selection) && editor.isEditable && (editor.view.hasFocus() || element.contains(document.activeElement))

function act(action: 'describe' | 'replace' | 'caption') {
  const pos = picture.value?.pos
  if (pos === undefined) return
  if (action === 'describe') emit('describe', pos)
  else if (action === 'replace') emit('replace', pos)
  else emit('caption', pos)
}
const remove = () => { props.editor.chain().focus().deleteSelection().run() }
const button = 'h-8 px-2 [@media(pointer:coarse)]:h-11'
</script>

<template>
  <!-- mousedown.prevent: the text keeps the focus (and the picture its selection) until the click. -->
  <BubbleMenu class="z-50" :editor="editor" :should-show="shouldShow" :options="{ placement: 'top', offset: 8 }">
    <div role="toolbar" :aria-label="t('editor.image.actions')" class="grid max-w-[min(24rem,calc(100vw-2rem))] gap-1 rounded-md border bg-popover p-1 shadow-md">
      <p class="truncate px-2 pt-1 text-xs text-muted-foreground" :title="description">{{ description }}</p>
      <div class="flex flex-wrap gap-0.5">
        <Button type="button" variant="ghost" size="sm" :class="button" @mousedown.prevent @click="act('describe')">{{ t('editor.image.editDescription') }}</Button>
        <Button type="button" variant="ghost" size="sm" :class="button" @mousedown.prevent @click="act('replace')">{{ t('editor.image.replace') }}</Button>
        <Button v-if="caption" type="button" variant="ghost" size="sm" :class="button" @mousedown.prevent @click="act('caption')">{{ t('editor.image.caption') }}</Button>
        <Button type="button" variant="ghost" size="sm" :class="[button, 'text-destructive hover:text-destructive']" @mousedown.prevent @click="remove">{{ t('editor.block.remove') }}</Button>
      </div>
    </div>
  </BubbleMenu>
</template>
