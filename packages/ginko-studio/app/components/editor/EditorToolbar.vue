<!-- Toolbar above the text: the block type, marks, link, picture, lists, search and the Markdown switch. Only what the
     editor's schema has is shown, so each Markdown profile gets its own set. The row fits its own width (a phone, a
     sheet, a column next to the preview): bold, italic and link always stay in it, the other tools follow in a fixed
     order as long as they fit, and the rest is in "Weitere Werkzeuge" (⋯), so every tool is reachable at every width.
     With room to spare the block type shows its word and the Markdown switch its name. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from '#imports'
import {
  Bold, Code, Ellipsis, FileCode, Heading2, Heading3, Heading4, ImagePlus, Italic, Link, List, ListChecks, ListOrdered, Minus,
  Pilcrow, Quote, Search, SquareCode, Strikethrough, Table,
} from '@lucide/vue'
import { profileCovers, type MarkdownProfile } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { isTaskItem, toggleTaskList } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@studio/components/ui/tooltip'
import { isCoarsePointer, useEditorTick, useModKey } from './context.ts'
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
const chain = () => props.editor.chain().focus()

/** A tool of the row. `opens`: it opens something that takes the focus (a dialog, the search, the source), so a menu does not give it back to the text. */
interface Tool { name: string; label: string; icon: Component; shortcut?: string; pressed: () => boolean; run: () => void; opens?: boolean }
const tool = (name: string, label: string, icon: Component, run: () => void, pressed = () => active(name), shortcut?: string): Tool => ({ name, label, icon, run, pressed, shortcut })

// Bold, italic and link stay in the row at every width.
const fixed = computed(() => [
  tool('bold', t('editor.marks.bold'), Bold, () => chain().toggleBold().run(), undefined, `${mod()}B`),
  tool('italic', t('editor.marks.italic'), Italic, () => chain().toggleItalic().run(), undefined, `${mod()}I`),
].filter((x) => has(x.name)))
const rich = computed(() => profileCovers(props.profile, 'rich'))
/** The others in the order they leave the row when it gets narrow: the last one first. Strikethrough and code are for the richer profiles. */
const optional = computed(() => [
  ...(has('image') ? [{ ...tool('image', t('editor.image.insertTitle'), ImagePlus, () => { imageOpen.value = true }, () => false), opens: true }] : []),
  ...(has('bulletList') ? [tool('bulletList', t('editor.blocks.bulletList'), List, () => chain().toggleBulletList().run())] : []),
  ...(has('orderedList') ? [tool('orderedList', t('editor.blocks.orderedList'), ListOrdered, () => chain().toggleOrderedList().run())] : []),
  ...(has('strike') && rich.value ? [tool('strike', t('editor.marks.strike'), Strikethrough, () => chain().toggleStrike().run())] : []),
  ...(has('code') && rich.value ? [tool('code', t('editor.marks.code'), Code, () => chain().toggleCode().run())] : []),
  { ...tool('find', t('editor.find.search'), Search, () => { findOpen.value = !findOpen.value }, () => findOpen.value, `${mod()}F`), opens: !findOpen.value },
  { ...tool('source', 'Markdown', FileCode, () => emit('source'), () => false), opens: true },
])

type Block = { value: string; label: string; icon: Component; node: string; run: () => void }
const groups = computed<Block[][]>(() => {
  const text: Block[] = [
    { value: 'paragraph', label: t('editor.blocks.text'), icon: Pilcrow, node: 'paragraph', run: () => { chain().clearNodes().run() } },
    ...([[2, Heading2], [3, Heading3], [4, Heading4]] as const).map(([level, icon]) => ({ value: `h${level}`, label: t(`editor.blocks.h${level}`), icon, node: 'heading', run: () => { chain().setHeading({ level }).run() } })),
  ]
  const blocks: Block[] = [
    { value: 'bulletList', label: t('editor.blocks.bulletList'), icon: List, node: 'bulletList', run: () => { chain().toggleBulletList().run() } },
    { value: 'orderedList', label: t('editor.blocks.orderedList'), icon: ListOrdered, node: 'orderedList', run: () => { chain().toggleOrderedList().run() } },
    { value: 'taskList', label: t('editor.blocks.taskList'), icon: ListChecks, node: 'taskCheckbox', run: () => { toggleTaskList(props.editor) } },
    { value: 'blockquote', label: t('editor.blocks.blockquote'), icon: Quote, node: 'blockquote', run: () => { chain().toggleBlockquote().run() } },
    { value: 'horizontalRule', label: t('editor.blocks.horizontalRule'), icon: Minus, node: 'horizontalRule', run: () => { chain().setHorizontalRule().run() } },
  ]
  // A picture is an action, not a type of the current block: it has its own button (and the "/" menu).
  const richBlocks: Block[] = [
    { value: 'table', label: t('editor.blocks.table'), icon: Table, node: 'table', run: () => { chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } },
    { value: 'codeBlock', label: t('editor.blocks.codeBlock'), icon: SquareCode, node: 'codeBlock', run: () => { chain().toggleCodeBlock().run() } },
  ]
  return [text, blocks, richBlocks].map((group) => group.filter((b) => has(b.node))).filter((group) => group.length > 1 || (group[0] && group[0].node !== 'paragraph'))
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
const currentBlock = computed(() => all.value.find((b) => b.value === current.value))
function choose(value: unknown) {
  all.value.find((b) => b.value === value)?.run()
}

// After a block type, typing goes on in the text; the list would put the focus back on its own button once it has closed.
function backToText(event: Event) {
  event.preventDefault()
  if (!props.editor.isDestroyed) props.editor.commands.focus()
}
// "Weitere Werkzeuge" does the same after a tool, unless the tool opens something that takes the focus (the picture
// dialog, the search). Closed without a choice (Escape, a click outside), it gives the focus back to its own button.
let chosen: Tool | undefined
function fromMenu(x: Tool) {
  chosen = x
  x.run()
}
function menuClosed(event: Event) {
  const tool = chosen
  chosen = undefined
  if (!tool) return
  if (tool.opens) event.preventDefault()
  else backToText(event)
}

// What fits: the width of the row (a ResizeObserver; without one, as in tests, everything is shown) against the sizes of
// its parts, in px: ToolToggle and the ⋯ button are h-8/min-w-8, on touch screens h-11/min-w-11, 2px apart; the block
// type is about 54px with its icon and arrow and w-56 with its word; "Markdown" adds about 70px and stands 8px apart.
const UNIT = isCoarsePointer() ? 46 : 34
const SELECT = 58
const SELECT_WORD = 224 - 54
const SOURCE_GAP = 8
const SOURCE_WORD = 72
const SPARE = 8
const width = ref(Number.POSITIVE_INFINITY)
const fit = computed(() => {
  const select = all.value.length > 1
  const tools = optional.value
  const cost = (x: Tool) => UNIT + (x.name === 'source' ? SOURCE_GAP : 0)
  let room = width.value - SPARE - (select ? SELECT : 0) - (fixed.value.length + (has('link') ? 1 : 0)) * UNIT
  const everything = tools.reduce((sum, x) => sum + cost(x), 0)
  if (everything <= room) {
    room -= everything
    const word = select && room >= SELECT_WORD
    if (word) room -= SELECT_WORD
    return { row: tools, menu: [] as Tool[], selectWord: word, sourceWord: room >= SOURCE_WORD }
  }
  room -= UNIT
  let shown = 0
  while (shown < tools.length && room >= cost(tools[shown]!)) room -= cost(tools[shown++]!)
  return { row: tools.slice(0, shown), menu: tools.slice(shown), selectWord: false, sourceWord: false }
})
const rowTools = computed(() => fit.value.row.filter((x) => x.name !== 'source'))
const sourceInRow = computed(() => fit.value.row.some((x) => x.name === 'source'))

const bar = ref<HTMLElement>()
let observer: ResizeObserver | undefined
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !bar.value) return
  observer = new ResizeObserver(([entry]) => { if (entry) width.value = entry.contentRect.width })
  observer.observe(bar.value)
})
onBeforeUnmount(() => observer?.disconnect())

// Docked: the bar is taken out of the flow (a spacer of its height stays, so the page does not jump) and put on the
// bottom edge of the visual viewport, which the keyboard shrinks.
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
      class="flex items-center gap-0.5 bg-background p-1"
      :class="place ? 'fixed top-0 left-0 z-40 border-t pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.08)]' : 'sticky top-[var(--studio-header-height,0px)] z-[5] rounded-t-md border-b'"
    >
      <Select v-if="all.length > 1" :model-value="current" @update:model-value="choose">
        <SelectTrigger
          size="sm" :aria-label="t('editor.toolbar.blockType')"
          :class="['mr-1 shrink-0 [@media(pointer:coarse)]:data-[size=sm]:h-11', fit.selectWord ? 'w-56' : 'w-auto gap-1 px-2']"
        >
          <!-- Narrow, the icon alone; the word stays for screen readers, never cut in half. -->
          <SelectValue>
            <component :is="currentBlock?.icon" v-if="currentBlock" aria-hidden="true" />
            <span :class="fit.selectWord ? 'truncate' : 'sr-only'">{{ currentBlock?.label }}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent @close-auto-focus="backToText">
          <template v-for="(group, i) in groups" :key="i">
            <SelectSeparator v-if="i > 0" />
            <SelectGroup>
              <SelectItem v-for="b in group" :key="b.value" :value="b.value"><component :is="b.icon" aria-hidden="true" />{{ b.label }}</SelectItem>
            </SelectGroup>
          </template>
        </SelectContent>
      </Select>
      <ToolToggle v-for="m in fixed" :key="m.name" :label="m.label" :shortcut="m.shortcut" :pressed="m.pressed()" @toggle="m.run">
        <component :is="m.icon" aria-hidden="true" />
      </ToolToggle>
      <LinkPopover v-if="has('link')" v-model:open="linkOpen" :editor="editor">
        <ToolToggle :label="t('editor.marks.link')" :shortcut="`${mod()}K`" :pressed="active('link')" @toggle="linkOpen = true"><Link aria-hidden="true" /></ToolToggle>
      </LinkPopover>
      <ToolToggle v-for="m in rowTools" :key="m.name" :label="m.label" :shortcut="m.shortcut" :pressed="m.pressed()" @toggle="m.run">
        <component :is="m.icon" aria-hidden="true" />
      </ToolToggle>
      <DropdownMenu v-if="fit.menu.length">
        <Tooltip>
          <TooltipTrigger as-child>
            <DropdownMenuTrigger as-child>
              <Button type="button" variant="ghost" size="icon-sm" class="shrink-0" :aria-label="t('editor.toolbar.more')" @mousedown.prevent><Ellipsis aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{{ t('editor.toolbar.more') }}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" @close-auto-focus="menuClosed">
          <template v-for="m in fit.menu" :key="m.name">
            <DropdownMenuItem v-if="m.opens && m.name !== 'find'" class="min-h-9 pointer-coarse:min-h-11" @select="fromMenu(m)">
              <component :is="m.icon" aria-hidden="true" />{{ m.label }}
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem v-else :model-value="m.pressed()" class="min-h-9 pointer-coarse:min-h-11" @select="fromMenu(m)">
              <component :is="m.icon" aria-hidden="true" />{{ m.label }}
            </DropdownMenuCheckboxItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
      <div v-if="sourceInRow" class="ml-auto shrink-0 pl-2"><SourceToggle :pressed="false" :word="fit.sourceWord" @toggle="emit('source')" /></div>
    </div>
  </TooltipProvider>
</template>
