<!-- The table row of the toolbar, while the cursor is in a table: "Zeile" and "Spalte" menus (add, move, delete, the
     column's alignment) and "Tabelle löschen". The commands keep a valid GFM table (see ginko-editor's table.ts), so an
     entry that would break it is greyed out. Tab and Shift+Tab move between cells; Tab in the last cell adds a row. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import { ChevronDown, Columns3, Rows3, Trash2 } from '@lucide/vue'
import type { Editor } from '@tiptap/core'
import { canRunTable, runTable, setColumnAlign, type ColumnAlign, type TableAt, type TableCommand } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@studio/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@studio/components/ui/tooltip'

const props = defineProps<{ editor: Editor; at: TableAt }>()
const { t } = useI18n()

// `at` is new after every change of the editor, so these are worked out again for the current state.
const entry = (command: TableCommand) => ({ command, label: t(`editor.table.${command}`), disabled: !canRunTable(props.editor.state, command) })
const rows = computed(() => { void props.at; return [
  [entry('addRowBefore'), entry('addRowAfter')],
  [entry('moveRowUp'), entry('moveRowDown')],
  [entry('deleteRow')],
] })
const columns = computed(() => { void props.at; return [
  [entry('addColumnBefore'), entry('addColumnAfter')],
  [entry('moveColumnLeft'), entry('moveColumnRight')],
] })
const deleteColumn = computed(() => { void props.at; return entry('deleteColumn') })
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
</script>

<template>
  <div role="toolbar" :aria-label="t('editor.table.label')" class="flex items-center gap-0.5 border-t pt-1">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="ghost" size="sm" class="shrink-0 gap-1 px-2 font-normal [@media(pointer:coarse)]:h-11" @mousedown.prevent>
          <Rows3 aria-hidden="true" />{{ t('editor.table.row') }}<ChevronDown class="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" @close-auto-focus="backToText">
        <template v-for="(group, i) in rows" :key="i">
          <DropdownMenuSeparator v-if="i > 0" />
          <DropdownMenuItem
            v-for="e in group" :key="e.command" :class="item" :disabled="e.disabled" :variant="e.command === 'deleteRow' ? 'destructive' : undefined"
            @select="runTable(editor, e.command)"
          >{{ e.label }}</DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button type="button" variant="ghost" size="sm" class="shrink-0 gap-1 px-2 font-normal [@media(pointer:coarse)]:h-11" @mousedown.prevent>
          <Columns3 aria-hidden="true" />{{ t('editor.table.column') }}<ChevronDown class="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" @close-auto-focus="backToText">
        <template v-for="(group, i) in columns" :key="i">
          <DropdownMenuSeparator v-if="i > 0" />
          <DropdownMenuItem v-for="e in group" :key="e.command" :class="item" :disabled="e.disabled" @select="runTable(editor, e.command)">{{ e.label }}</DropdownMenuItem>
        </template>
        <DropdownMenuSeparator />
        <DropdownMenuLabel class="text-xs font-medium text-muted-foreground">{{ t('editor.table.align') }}</DropdownMenuLabel>
        <DropdownMenuRadioGroup :model-value="align" @update:model-value="setAlign">
          <DropdownMenuRadioItem v-for="a in ['left', 'center', 'right'] as const" :key="a" :value="a" :class="item">{{ t(`editor.table.align_${a}`) }}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem :class="item" :disabled="deleteColumn.disabled" variant="destructive" @select="runTable(editor, 'deleteColumn')">{{ deleteColumn.label }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button type="button" variant="ghost" size="icon-sm" class="ml-auto shrink-0 [@media(pointer:coarse)]:size-11" :aria-label="t('editor.table.deleteTable')" @mousedown.prevent @click="runTable(editor, 'deleteTable')">
          <Trash2 aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ t('editor.table.deleteTable') }}</TooltipContent>
    </Tooltip>
  </div>
</template>
