<!-- Toolbar above the text: the block menu (the "/" menu's entries behind the current block type), marks, link, picture,
     lists, search and the Markdown switch; while the cursor is in a table, the table tools: at the end of the row when they
     fit (so the text below does not move), else in a second row. Only what the
     editor's schema has is shown, so each Markdown profile gets its own set. The row fits its own width (a phone, a
     sheet, a column next to the preview): bold, italic and link always stay in it, the other tools follow in a fixed
     order as long as they fit, and the rest is in "Weitere Werkzeuge" (⋯), so every tool is reachable at every width.
     With room to spare the block type shows its word and the Markdown switch its name. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useI18n } from '#imports'
import { Bold, Code, Ellipsis, FileCode, ImagePlus, Italic, Link, List, ListOrdered, Search, Strikethrough } from '@lucide/vue'
import { profileCovers, type MarkdownProfile } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import { tableAt, type SlashItem } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@studio/components/ui/tooltip'
import { isCoarsePointer, useEditorTick, useModKey } from './context.ts'
import { dockPosition, type DockPosition } from './dock.ts'
import BlockMenu from './BlockMenu.vue'
import LinkPopover from './LinkPopover.vue'
import SourceToggle from './SourceToggle.vue'
import TableBar from './TableBar.vue'
import ToolToggle from './ToolToggle.vue'

const props = defineProps<{
  editor: Editor
  profile: MarkdownProfile
  /** The "/" menu's entries: the block menu offers the same ones. */
  items: () => SlashItem[]
  /** On a phone while the editor has the focus: the bar sits above the keyboard. */
  docked?: boolean
}>()
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

// After a tool from a menu, typing goes on in the text; the menu would put the focus back on its own button once it has closed.
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
// type is about 54px with its icon and arrow and w-40 with its word; "Markdown" adds about 70px and stands 8px apart.
const UNIT = isCoarsePointer() ? 46 : 34
const SELECT = 58
const SELECT_WORD = 160 - 54
const SOURCE_GAP = 8
const SOURCE_WORD = 72
const SPARE = 8
// The table tools: "Zeile ▾", "Spalte ▾", the bin and a divider (German, the longest of the Studio languages).
const TABLE = isCoarsePointer() ? 265 : 250
const width = ref(Number.POSITIVE_INFINITY)
const fit = computed(() => {
  const select = hasBlockMenu.value
  const tools = optional.value
  const cost = (x: Tool) => UNIT + (x.name === 'source' ? SOURCE_GAP : 0)
  let room = width.value - SPARE - (select ? SELECT : 0) - (fixed.value.length + (has('link') ? 1 : 0)) * UNIT
  const everything = tools.reduce((sum, x) => sum + cost(x), 0)
  if (everything <= room) {
    room -= everything
    // The table tools come before the words: in the row they keep the text from moving when the cursor enters a table.
    const tableInRow = inTable.value && room >= TABLE
    if (tableInRow) room -= TABLE
    const word = select && room >= SELECT_WORD
    if (word) room -= SELECT_WORD
    return { row: tools, menu: [] as Tool[], selectWord: word, sourceWord: room >= SOURCE_WORD, tableInRow }
  }
  room -= UNIT
  let shown = 0
  while (shown < tools.length && room >= cost(tools[shown]!)) room -= cost(tools[shown++]!)
  return { row: tools.slice(0, shown), menu: tools.slice(shown), selectWord: false, sourceWord: false, tableInRow: false }
})
const hasBlockMenu = computed(() => props.items().length > 0)
/** Where the cursor is in a table: the table tools show. */
const table = computed(() => { void tick.value; return tableAt(props.editor.state) })
const inTable = computed(() => Boolean(table.value))
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
// The table row comes and goes with the cursor: the docked bar measures its height again.
watch(inTable, async () => {
  if (!place.value) return
  await nextTick()
  barHeight.value = bar.value?.offsetHeight ?? barHeight.value
  measure()
}, { flush: 'post' })
onBeforeUnmount(() => { place.value = null })
const style = computed(() => (place.value ? { transform: `translate(${place.value.x}px, ${place.value.y}px)`, width: `${place.value.width}px` } : undefined))
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div v-if="place" aria-hidden="true" :style="{ height: `${barHeight}px` }" />
    <div
      ref="bar" :style="style" :data-docked="place ? '' : undefined" class="grid gap-1 bg-background p-1"
      :class="place ? 'fixed top-0 left-0 z-40 border-t pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.08)]' : 'sticky top-(--studio-header-height,0px) z-[5] rounded-t-lg border-b'"
    >
      <div role="toolbar" :aria-label="t('editor.toolbar.label')" class="flex items-center gap-0.5">
        <BlockMenu v-if="hasBlockMenu" :editor="editor" :items="items" :word="fit.selectWord" />
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
        <TableBar v-if="table && fit.tableInRow" inline :editor="editor" :at="table" />
        <div v-if="sourceInRow" class="ml-auto shrink-0 pl-2"><SourceToggle :pressed="false" :word="fit.sourceWord" @toggle="emit('source')" /></div>
      </div>
      <TableBar v-if="table && !fit.tableInRow" :editor="editor" :at="table" />
    </div>
  </TooltipProvider>
</template>
