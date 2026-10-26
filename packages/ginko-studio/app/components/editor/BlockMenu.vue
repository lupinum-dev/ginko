<!-- The block menu of the toolbar: the "/" menu's entries (text styles first, then the components), plus "Text", behind
     the button that shows the current block type. Built as the command palette is: a shadcn Command whose filter field
     takes the focus and filters as the "/" menu does (its own query, not the Command's filter); arrows and Enter choose,
     Escape closes. Text styles show a check mark at the current one; components, unknown by name, carry a description. -->
<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, type Component } from 'vue'
import { useI18n } from '#imports'
import {
  AlignCenterHorizontal, AlignLeft, BookOpen, Blocks, Braces, CaseSensitive, Check, ChevronDown, ChevronsUpDown, CircleHelp, Columns2, Files,
  FolderTree, Footprints, Frame, GitCommitVertical, Heading2, Heading3, Heading4, Image, ImagePlus, Info, LayoutGrid, List, ListChecks,
  ListCollapse, ListOrdered, Minus, PanelRight, PanelsTopLeft, Pilcrow, Quote, RectangleHorizontal, Search, SquareCode, Table, TableOfContents,
  TextQuote, Video, Webhook,
} from '@lucide/vue'
import { ListboxFilter } from 'reka-ui'
import type { Editor } from '@tiptap/core'
import { filterSlashItems, isTaskItem, runSlashItem, slashItemsAt, type SlashItem } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '@studio/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { useEditorTick } from './context.ts'

const props = defineProps<{
  editor: Editor
  /** The "/" menu's entries in the Studio language (MarkdownEditor's `items`). */
  items: () => SlashItem[]
  /** With room to spare the button shows the block type's word, else its icon alone. */
  word: boolean
}>()
const emit = defineEmits<{ chosen: [item: SlashItem] }>()

const { t } = useI18n()
const tick = useEditorTick(() => props.editor)
const open = ref(false)
const query = ref('')
const command = ref<InstanceType<typeof Command>>()
const highlighted = ref<HTMLElement>()
const uid = useId()

const ICONS: Record<string, Component> = {
  paragraph: Pilcrow, heading2: Heading2, heading3: Heading3, heading4: Heading4, bulletList: List, orderedList: ListOrdered,
  taskList: ListChecks, blockquote: Quote, horizontalRule: Minus, table: Table, codeBlock: SquareCode, image: ImagePlus,
}
// The components a site profile can offer, by tag. A site's own component has none here and gets the generic one.
const COMPONENT_ICONS: Record<string, Component> = {
  callout: Info, aside: PanelRight, excerpt: TextQuote, dropcap: CaseSensitive, flow: AlignLeft, layout: Columns2,
  center: AlignCenterHorizontal, timeline: GitCommitVertical, tabs: PanelsTopLeft, accordion: ListCollapse, collapse: ChevronsUpDown,
  steps: Footprints, cards: LayoutGrid, card: RectangleHorizontal, 'read-more': BookOpen, 'inline-toc': TableOfContents,
  'code-group': Braces, 'code-tree': FolderTree, files: Files, figure: Image, video: Video, embed: Frame, quiz: CircleHelp, api: Webhook,
}
const isComponent = (item: SlashItem) => item.id.startsWith('component:')
const iconOf = (item: SlashItem) => (isComponent(item) ? COMPONENT_ICONS[item.id.slice('component:'.length)] : ICONS[item.id]) ?? Blocks

/** "Text" turns any block back into a paragraph. It is not in the "/" menu, which only opens in an empty paragraph. */
const text = computed<SlashItem>(() => ({
  id: 'paragraph', label: t('editor.blocks.text'), describe: t('editor.blocks.textDescribe'), group: t('editor.slash.groupText'),
  keywords: ['absatz', 'normal', 'paragraph'], kind: 'style', run: (e) => { e.chain().focus().clearNodes().run() },
}))
const all = computed(() => [text.value, ...props.items()])

const current = computed(() => {
  void tick.value
  const e = props.editor
  if (e.isActive('codeBlock')) return 'codeBlock'
  for (const level of [2, 3, 4]) if (e.isActive('heading', { level })) return `heading${level}`
  if (isTaskItem(e.state)) return 'taskList'
  for (const id of ['bulletList', 'orderedList', 'blockquote']) if (e.isActive(id)) return id
  return 'paragraph'
})
const currentItem = computed(() => all.value.find((i) => i.id === current.value) ?? text.value)

/** In a table cell only a picture can go; the list says so instead of showing nothing. */
const here = computed(() => { void tick.value; return open.value ? slashItemsAt(all.value, props.editor.state) : [] })
const inCell = computed(() => open.value && here.value.length < all.value.length && here.value.every((i) => i.id === 'image'))
const shown = computed(() => filterSlashItems(here.value, query.value))
const groups = computed(() => {
  const out: Array<{ name: string; items: SlashItem[] }> = []
  for (const item of shown.value) {
    let group = out.find((g) => g.name === item.group)
    if (!group) out.push(group = { name: item.group, items: [] })
    group.items.push(item)
  }
  return out
})

// The filter field highlights the first item as it takes the input, before the list is filtered: highlight it again once
// the filtered list is drawn, so the highlight and Enter go to the top entry.
watch(open, (isOpen) => { if (isOpen) query.value = '' })
watch([open, query], async () => {
  if (!open.value) return
  await nextTick()
  command.value?.highlightFirstItem()
})

let chosen: SlashItem | undefined
function choose(item: SlashItem | undefined) {
  if (!item) return
  chosen = item
  open.value = false
  void runSlashItem(props.editor, item)
  emit('chosen', item)
}

// Enter with nothing highlighted on screen (typed faster than the list was drawn) takes the top entry.
function onEnter(event: KeyboardEvent) {
  if (highlighted.value?.isConnected) return
  event.preventDefault()
  choose(shown.value[0])
}

// After a choice, typing goes on in the text, unless the entry opened something that takes the focus (the picture
// dialog). Closed without a choice (Escape, a click outside), the focus goes back to the text too: that is where it was.
function closed(event: Event) {
  const item = chosen
  chosen = undefined
  event.preventDefault()
  if (item?.id === 'image') return
  if (!props.editor.isDestroyed) props.editor.commands.focus()
}
const partId = (item: SlashItem, part: 'label' | 'describe') => `${uid}-${item.id.replace(/\W/g, '-')}-${part}`
const isCurrent = (item: SlashItem) => item.kind === 'style' && item.id === current.value
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button" variant="ghost" size="sm" :aria-label="t('editor.toolbar.blockType')"
        :class="['mr-1 shrink-0 justify-between font-normal [@media(pointer:coarse)]:h-11', word ? 'w-40' : 'w-auto gap-1 px-2']"
        @mousedown.prevent
      >
        <span class="flex min-w-0 items-center gap-2">
          <component :is="iconOf(currentItem)" aria-hidden="true" />
          <!-- Narrow, the icon alone; the word stays for screen readers, never cut in half. -->
          <span :class="word ? 'truncate' : 'sr-only'">{{ currentItem.label }}</span>
        </span>
        <ChevronDown class="size-4 opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-1rem)] p-0" @open-auto-focus.prevent @close-auto-focus="closed">
      <Command ref="command" loop @highlight="highlighted = $event?.ref">
        <div data-slot="command-input-wrapper" class="flex h-10 items-center gap-2 border-b px-3 pointer-coarse:h-11">
          <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <ListboxFilter
            v-model="query" auto-focus :placeholder="t('editor.blockMenu.search')" :aria-label="t('editor.blockMenu.search')"
            :aria-activedescendant="highlighted?.isConnected ? highlighted.id : undefined"
            class="h-full w-full bg-transparent text-base outline-hidden placeholder:text-muted-foreground md:text-sm" autocomplete="off" spellcheck="false"
            @keydown.enter="onEnter"
          />
        </div>
        <CommandList class="max-h-80 p-1" :aria-label="t('editor.toolbar.blockType')">
          <p v-if="inCell" class="px-2 py-1.5 text-xs text-muted-foreground">{{ t('editor.blockMenu.inCell') }}</p>
          <p v-if="!shown.length" class="p-3 text-center text-sm text-muted-foreground" role="status">{{ t('editor.slash.empty') }}</p>
          <CommandGroup v-for="g in groups" :key="g.name" :heading="g.name" class="p-0">
            <!-- The name is the label alone; a component's description and "current" are read after it. -->
            <CommandItem
              v-for="item in g.items" :key="item.id" :value="item.id"
              :aria-labelledby="partId(item, 'label')" :aria-describedby="isComponent(item) || isCurrent(item) ? partId(item, 'describe') : undefined"
              :class="['min-h-9 pointer-coarse:min-h-11', isComponent(item) && 'items-start']" @mousedown.prevent @select="choose(item)"
            >
              <component :is="iconOf(item)" :class="isComponent(item) && 'mt-0.5'" aria-hidden="true" />
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span :id="partId(item, 'label')">{{ item.label }}</span>
                <span v-if="isComponent(item)" :id="partId(item, 'describe')" class="line-clamp-2 text-xs text-muted-foreground">{{ item.describe }}</span>
              </span>
              <template v-if="isCurrent(item)">
                <span :id="partId(item, 'describe')" class="sr-only">{{ t('editor.blockMenu.current') }}</span>
                <Check class="text-foreground" aria-hidden="true" />
              </template>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
