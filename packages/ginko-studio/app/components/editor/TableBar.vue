<!-- The table tools at the end of the tool row, while the cursor is in a table: "Zeile" and "Spalte" menus (add, move,
     delete, the column's alignment) and "Tabelle löschen", which offers to undo. Where the row has no room for them
     (a phone), one "Tabelle" menu holds them all. Always in the row: a row of its own moved the text when the cursor
     entered a table. The commands keep a valid GFM table (see ginko-editor's table.ts), so an entry that would break it
     is greyed out. Tab and Shift+Tab move between cells; Tab in the last cell adds a row. -->
<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from '#imports'
import { ChevronDown, Columns3, Rows3, Table, Trash2 } from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import { canRunTable, runTable, setColumnAlign, type ColumnAlign, type TableAt, type TableCommand } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@studio/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@studio/components/ui/tooltip'
import { useToast } from '@studio/composables/useToast'

const props = defineProps<{ editor: Editor; at: TableAt; wide: boolean }>()
const { t } = useI18n()
const toast = useToast()

interface Entry { command: TableCommand; label: string; disabled: boolean }
/** A menu's part: groups of entries between separators; `'align'` is the column's alignment. */
interface Section { label: string; icon: Component; groups: Array<Entry[] | 'align'> }
// `at` is new after every change of the editor, so the entries are worked out again for the current state.
const entry = (command: TableCommand): Entry => ({ command, label: t(`editor.table.${command}`), disabled: !canRunTable(props.editor.state, command) })
const sections = computed((): Section[] => { void props.at; return [
  { label: t('editor.table.row'), icon: Rows3, groups: [[entry('addRowBefore'), entry('addRowAfter')], [entry('moveRowUp'), entry('moveRowDown')], [entry('deleteRow')]] },
  { label: t('editor.table.column'), icon: Columns3, groups: [[entry('addColumnBefore'), entry('addColumnAfter')], [entry('moveColumnLeft'), entry('moveColumnRight')], 'align', [entry('deleteColumn')]] },
] })
/** Wide: a menu per section and the bin beside them. Narrow: one menu with both sections and "Tabelle löschen". */
const menus = computed(() => (props.wide ? sections.value.map((s) => [s]) : [sections.value]))

// The default (`---`) shows as left, as the site shows it; choosing left writes the default again.
const align = computed(() => props.at.align ?? 'left')
function setAlign(value: unknown) {
  setColumnAlign(props.editor, value === 'left' ? undefined : value as ColumnAlign)
}

// After an entry, typing goes on in the cell; the menu would put the focus back on its own button.
function backToText(event: Event) {
  event.preventDefault()
  if (!props.editor.isDestroyed) props.editor.commands.focus()
}
const item = 'min-h-9 pointer-coarse:min-h-11'
const trigger = 'shrink-0 gap-1 px-2 font-normal [@media(pointer:coarse)]:h-11'

// One click deletes the table, as for any block; the message offers it back with the editor's own undo. Any later change
// (typing, Cmd+Z) closes the message: its undo would then take back that change, or bring the table back twice.
function deleteTable() {
  const { editor } = props
  if (!runTable(editor, 'deleteTable')) return
  const close = () => { editor.off('update', close); toast.clear() }
  toast.show(t('editor.table.deleted'), { action: { label: t('ops.undo'), run: () => {
    editor.off('update', close)
    if (!editor.isDestroyed && editor.commands.undo()) toast.show(t('ops.undone'))
  } } })
  editor.on('update', close)
}
</script>

<template>
  <div role="group" :aria-label="t('editor.table.label')" class="flex shrink-0 items-center gap-0.5">
    <div class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
    <DropdownMenu v-for="(menu, m) in menus" :key="m">
      <DropdownMenuTrigger v-if="wide" as-child>
        <Button type="button" variant="ghost" size="sm" :class="trigger" @mousedown.prevent>
          <component :is="menu[0]!.icon" aria-hidden="true" />{{ menu[0]!.label }}<ChevronDown class="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <!-- No tooltip here: a Tooltip around a menu's trigger left the menu without its anchor, off-screen. -->
      <DropdownMenuTrigger v-else as-child>
        <Button type="button" variant="ghost" size="sm" :class="trigger" :aria-label="t('editor.table.label')" @mousedown.prevent>
          <Table aria-hidden="true" /><ChevronDown class="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent :align="wide ? 'start' : 'end'" @close-auto-focus="backToText">
        <template v-for="(section, s) in menu" :key="section.label">
          <template v-if="!wide">
            <DropdownMenuSeparator v-if="s > 0" />
            <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ section.label }}</DropdownMenuLabel>
          </template>
          <template v-for="(group, g) in section.groups" :key="g">
            <DropdownMenuSeparator v-if="g > 0" />
            <template v-if="group === 'align'">
              <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('editor.table.align') }}</DropdownMenuLabel>
              <DropdownMenuRadioGroup :model-value="align" @update:model-value="setAlign">
                <DropdownMenuRadioItem v-for="a in ['left', 'center', 'right'] as const" :key="a" :value="a" :class="item">{{ t(`editor.table.align_${a}`) }}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </template>
            <template v-else>
              <DropdownMenuItem
                v-for="e in group" :key="e.command" :class="item" :disabled="e.disabled"
                :variant="e.command.startsWith('delete') ? 'destructive' : undefined" @select="runTable(editor, e.command)"
              >{{ e.label }}</DropdownMenuItem>
            </template>
          </template>
        </template>
        <template v-if="!wide">
          <DropdownMenuSeparator />
          <DropdownMenuItem :class="item" variant="destructive" @select="deleteTable">{{ t('editor.table.deleteTable') }}</DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
    <Tooltip v-if="wide">
      <TooltipTrigger as-child>
        <Button type="button" variant="ghost" size="icon-sm" class="shrink-0 [@media(pointer:coarse)]:size-11" :aria-label="t('editor.table.deleteTable')" @mousedown.prevent @click="deleteTable">
          <Trash2 aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ t('editor.table.deleteTable') }}</TooltipContent>
    </Tooltip>
  </div>
</template>
