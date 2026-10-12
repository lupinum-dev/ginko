<!-- Toolbar above the text: marks, link, and the block type. Only what the editor's schema has is shown, so
     each Markdown profile gets its own set. It scrolls sideways inside itself on a narrow screen. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '#imports'
import { Bold, Code, Italic, Link, Search, Strikethrough } from '@lucide/vue'
import { profileCovers, type MarkdownProfile } from '@lupinum/ginko'
import type { Editor } from '@tiptap/core'
import { isTaskItem, toggleTaskList } from '@lupinum/ginko-editor'
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import { TooltipProvider } from '@studio/components/ui/tooltip'
import { useEditorTick, useModKey } from './context.ts'
import { dockPosition, type DockPosition } from './dock.ts'
import LinkPopover from './LinkPopover.vue'
import SourceToggle from './SourceToggle.vue'
import ToolToggle from './ToolToggle.vue'

const props = defineProps<{ editor: Editor; profile: MarkdownProfile; /** On a phone while the editor has the focus: the bar sits above the keyboard. */ docked?: boolean }>()
const emit = defineEmits<{ source: [] }>()
const linkOpen = defineModel<boolean>('linkOpen', { required: true })
const imageOpen = defineModel<boolean>('imageOpen', { required: true })
const findOpen = defineModel<boolean>('findOpen', { required: true })

const { t } = useI18n()
const mod = useModKey()
const tick = useEditorTick(() => props.editor)
const has = (name: string) => name in props.editor.schema.marks || name in props.editor.schema.nodes
const active = (name: string) => { void tick.value; return props.editor.isActive(name) }

// Strikethrough and code are for the richer profiles; a short text needs bold, italic and links.
const marks = computed(() => [
  { name: 'bold', rich: false, label: t('editor.marks.bold'), key: 'B', icon: Bold, toggle: () => props.editor.chain().focus().toggleBold().run() },
  { name: 'italic', rich: false, label: t('editor.marks.italic'), key: 'I', icon: Italic, toggle: () => props.editor.chain().focus().toggleItalic().run() },
  { name: 'strike', rich: true, label: t('editor.marks.strike'), key: undefined, icon: Strikethrough, toggle: () => props.editor.chain().focus().toggleStrike().run() },
  { name: 'code', rich: true, label: t('editor.marks.code'), key: undefined, icon: Code, toggle: () => props.editor.chain().focus().toggleCode().run() },
])
const shown = computed(() => marks.value.filter((m) => has(m.name) && (!m.rich || profileCovers(props.profile, 'rich'))))

type Block = { value: string; label: string; node: string; run: () => void }
const chain = () => props.editor.chain().focus()
const groups = computed<Block[][]>(() => {
  const text: Block[] = [
    { value: 'paragraph', label: t('editor.blocks.text'), node: 'paragraph', run: () => { chain().clearNodes().run() } },
    ...([2, 3, 4] as const).map((level) => ({ value: `h${level}`, label: t(`editor.blocks.h${level}`), node: 'heading', run: () => { chain().setHeading({ level }).run() } })),
  ]
  const blocks: Block[] = [
    { value: 'bulletList', label: t('editor.blocks.bulletList'), node: 'bulletList', run: () => { chain().toggleBulletList().run() } },
    { value: 'orderedList', label: t('editor.blocks.orderedList'), node: 'orderedList', run: () => { chain().toggleOrderedList().run() } },
    { value: 'taskList', label: t('editor.blocks.taskList'), node: 'taskCheckbox', run: () => { toggleTaskList(props.editor) } },
    { value: 'blockquote', label: t('editor.blocks.blockquote'), node: 'blockquote', run: () => { chain().toggleBlockquote().run() } },
    { value: 'horizontalRule', label: t('editor.blocks.horizontalRule'), node: 'horizontalRule', run: () => { chain().setHorizontalRule().run() } },
  ]
  const rich: Block[] = [
    { value: 'table', label: t('editor.blocks.table'), node: 'table', run: () => { chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } },
    { value: 'image', label: t('editor.blocks.image'), node: 'image', run: () => { imageOpen.value = true } },
    { value: 'codeBlock', label: t('editor.blocks.codeBlock'), node: 'codeBlock', run: () => { chain().toggleCodeBlock().run() } },
  ]
  return [text, blocks, rich].map((group) => group.filter((b) => has(b.node))).filter((group) => group.length > 1 || (group[0] && group[0].node !== 'paragraph'))
})
const all = computed(() => groups.value.flat())
const current = computed(() => {
  void tick.value
  const e = props.editor
  if (e.isActive('codeBlock')) return 'codeBlock'
  for (const level of [2, 3, 4]) if (e.isActive('heading', { level })) return `h${level}`
  if (isTaskItem(e.state)) return 'taskList'
  for (const value of ['bulletList', 'orderedList', 'blockquote']) if (e.isActive(value)) return value
  return 'paragraph'
})
function choose(value: unknown) {
  all.value.find((b) => b.value === value)?.run()
}

// Docked: the bar is taken out of the flow (a spacer of its height stays, so the page does not jump) and put on the
// bottom edge of the visual viewport, which the keyboard shrinks.
const bar = ref<HTMLElement>()
const barHeight = ref(0)
const place = ref<DockPosition | null>(null)
function measure() {
  const viewport = window.visualViewport
  if (viewport) place.value = dockPosition(viewport, barHeight.value)
}
watch(() => props.docked, async (on, _before, onCleanup) => {
  if (!on || !window.visualViewport) { place.value = null; return }
  barHeight.value = bar.value?.offsetHeight ?? 0
  measure()
  const viewport = window.visualViewport
  viewport.addEventListener('resize', measure)
  viewport.addEventListener('scroll', measure)
  onCleanup(() => { viewport.removeEventListener('resize', measure); viewport.removeEventListener('scroll', measure) })
  // The fixed bar may be a little taller (the safe area under the home indicator): measure once more.
  await nextTick()
  const taller = bar.value?.offsetHeight ?? barHeight.value
  if (taller !== barHeight.value) { barHeight.value = taller; measure() }
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => { place.value = null })
const style = computed(() => (place.value ? { transform: `translate(${place.value.x}px, ${place.value.y}px)`, width: `${place.value.width}px` } : undefined))
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div v-if="place" aria-hidden="true" :style="{ height: `${barHeight}px` }" />
    <div
      ref="bar" role="toolbar" :aria-label="t('editor.toolbar.label')" :style="style" :data-docked="place ? '' : undefined"
      class="flex items-center gap-1 overflow-x-auto bg-background p-1"
      :class="place ? 'fixed top-0 left-0 z-40 border-t pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.08)]' : 'sticky top-[var(--studio-header-height,0px)] z-[5] rounded-t-md border-b'"
    >
      <Select v-if="all.length > 1" :model-value="current" @update:model-value="choose">
        <SelectTrigger size="sm" class="w-44 shrink-0 [@media(pointer:coarse)]:w-24 [@media(pointer:coarse)]:data-[size=sm]:h-11" :aria-label="t('editor.toolbar.blockType')"><SelectValue /></SelectTrigger>
        <SelectContent>
          <template v-for="(group, i) in groups" :key="i">
            <SelectSeparator v-if="i > 0" />
            <SelectGroup>
              <SelectItem v-for="b in group" :key="b.value" :value="b.value">{{ b.label }}</SelectItem>
            </SelectGroup>
          </template>
        </SelectContent>
      </Select>
      <div class="flex shrink-0 items-center gap-0.5">
        <ToolToggle v-for="m in shown" :key="m.name" :label="m.label" :shortcut="m.key ? `${mod()}${m.key}` : undefined" :pressed="active(m.name)" @toggle="m.toggle">
          <component :is="m.icon" aria-hidden="true" />
        </ToolToggle>
        <LinkPopover v-if="has('link')" v-model:open="linkOpen" :editor="editor">
          <ToolToggle :label="t('editor.marks.link')" :shortcut="`${mod()}K`" :pressed="active('link')" @toggle="linkOpen = true"><Link aria-hidden="true" /></ToolToggle>
        </LinkPopover>
        <ToolToggle :label="t('editor.find.search')" :shortcut="`${mod()}F`" :pressed="findOpen" @toggle="findOpen = !findOpen"><Search aria-hidden="true" /></ToolToggle>
      </div>
      <div class="ml-auto shrink-0 pl-2"><SourceToggle :pressed="false" @toggle="emit('source')" /></div>
    </div>
  </TooltipProvider>
</template>
