<!-- The block menu of the toolbar: the "/" menu's entries (text styles first, then the components), plus "Text", behind
     the button that shows the current block type. A search field at the top takes the focus and filters as the "/" menu
     does; arrows and Enter choose, Escape closes. Text styles show a check mark at the current one. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { useI18n } from '#imports'
import {
  Blocks, Check, ChevronDown, Heading2, Heading3, Heading4, ImagePlus, List, ListChecks, ListOrdered, Minus, Pilcrow, Quote, Search, SquareCode, Table,
} from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import { filterSlashItems, isTaskItem, runSlashItem, slashItemsAt, type SlashItem } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
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
const active = ref(0)
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()

const ICONS: Record<string, Component> = {
  paragraph: Pilcrow, heading2: Heading2, heading3: Heading3, heading4: Heading4, bulletList: List, orderedList: ListOrdered,
  taskList: ListChecks, blockquote: Quote, horizontalRule: Minus, table: Table, codeBlock: SquareCode, image: ImagePlus,
}
const iconOf = (item: SlashItem) => ICONS[item.id] ?? Blocks

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
  const out: Array<{ name: string; items: Array<{ item: SlashItem; index: number }> }> = []
  shown.value.forEach((item, index) => {
    let group = out.find((g) => g.name === item.group)
    if (!group) out.push(group = { name: item.group, items: [] })
    group.items.push({ item, index })
  })
  return out
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  query.value = ''
  active.value = 0
  await nextTick()
  input.value?.focus()
})
watch(query, () => { active.value = 0 })
watch(active, async () => {
  await nextTick()
  list.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
})

let chosen: SlashItem | undefined
function choose(item: SlashItem | undefined) {
  if (!item) return
  chosen = item
  open.value = false
  void runSlashItem(props.editor, item)
  emit('chosen', item)
}

function onKey(event: KeyboardEvent) {
  const count = shown.value.length
  if (event.key === 'ArrowDown' && count) { event.preventDefault(); active.value = (active.value + 1) % count }
  else if (event.key === 'ArrowUp' && count) { event.preventDefault(); active.value = (active.value - 1 + count) % count }
  else if (event.key === 'Enter') { event.preventDefault(); choose(shown.value[active.value]) }
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
const optionId = (index: number) => `ginko-block-${index}`
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
      <div class="flex h-10 items-center gap-2 border-b px-3 pointer-coarse:h-11">
        <Search class="size-4 shrink-0 opacity-50" aria-hidden="true" />
        <input
          ref="input" v-model="query" type="text" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="ginko-block-list"
          :aria-activedescendant="shown.length ? optionId(active) : undefined" :aria-label="t('editor.blockMenu.search')" :placeholder="t('editor.blockMenu.search')"
          class="h-full w-full bg-transparent text-base outline-hidden placeholder:text-muted-foreground md:text-sm" autocomplete="off" spellcheck="false" @keydown="onKey"
        >
      </div>
      <div id="ginko-block-list" ref="list" role="listbox" :aria-label="t('editor.toolbar.blockType')" class="max-h-80 overflow-y-auto p-1">
        <p v-if="inCell" class="px-2 py-1.5 text-xs text-muted-foreground">{{ t('editor.blockMenu.inCell') }}</p>
        <p v-if="!shown.length" class="p-3 text-center text-sm text-muted-foreground" role="status">{{ t('editor.slash.empty') }}</p>
        <div v-for="g in groups" :key="g.name" role="group" :aria-label="g.name">
          <p class="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground" aria-hidden="true">{{ g.name }}</p>
          <div
            v-for="{ item, index } in g.items" :id="optionId(index)" :key="item.id" role="option" :aria-selected="index === active" :data-active="index === active"
            class="flex min-h-9 cursor-default items-start gap-2 rounded-sm px-2 py-1.5 text-sm pointer-coarse:min-h-11" :class="index === active && 'bg-accent text-accent-foreground'"
            @mousedown.prevent @pointermove="active = index" @click="choose(item)"
          >
            <component :is="iconOf(item)" class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span>{{ item.label }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ item.describe }}</span>
            </span>
            <template v-if="item.kind === 'style' && item.id === current">
              <Check class="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span class="sr-only">{{ t('editor.blockMenu.current') }}</span>
            </template>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
