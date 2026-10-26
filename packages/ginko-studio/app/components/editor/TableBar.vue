<!-- The table tools of the toolbar, while the cursor is in a table: "Zeile" and "Spalte" menus (add, move, delete, the
     column's alignment) and "Tabelle löschen", which offers to undo. The commands keep a valid GFM table (see
     ginko-editor's table.ts), so an entry that would break it is greyed out. Tab and Shift+Tab move between cells; Tab in
     the last cell adds a row. `inline`: a group at the end of the tool row (nothing below moves when it comes); else a
     row of its own under the tools, where the tool row has no room. -->
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
import { useToast } from '@studio/composables/useToast'

const props = defineProps<{ editor: Editor; at: TableAt; inline?: boolean }>()
const { t } = useI18n()
const toast = useToast()

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

// One click deletes the table, as for any block; the message offers it back. Right after, that is the editor's own undo;
// once the text has changed since, the table goes back in before the block that is now where it stood.
function deleteTable() {
  const { editor } = props
  const { $from } = editor.state.selection
  let depth = $from.depth
  while (depth > 0 && $from.node(depth).type.spec.tableRole !== 'table') depth--
  if (!depth) return
  const table = $from.node(depth).toJSON()
  const pos = $from.before(depth)
  if (!runTable(editor, 'deleteTable')) return
  const after = editor.state.doc
  toast.show(t('editor.table.deleted'), { action: { label: t('ops.undo'), run: () => {
    if (editor.isDestroyed) return
    if (editor.state.doc !== after || !editor.commands.undo()) {
      const $at = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size))
      editor.chain().focus().insertContentAt($at.depth ? $at.before(1) : $at.pos, table).run()
    }
    toast.show(t('ops.undone'))
  } } })
}
</script>

<template>
  <div :role="inline ? 'group' : 'toolbar'" :aria-label="t('editor.table.label')" :class="inline ? 'flex shrink-0 items-center gap-0.5' : 'flex items-center gap-0.5 border-t pt-1'">
    <div v-if="inline" class="mx-1 h-5 w-px bg-border" aria-hidden="true" />
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
        <Button type="button" variant="ghost" size="icon-sm" class="shrink-0 [@media(pointer:coarse)]:size-11" :class="!inline && 'ml-auto'" :aria-label="t('editor.table.deleteTable')" @mousedown.prevent @click="deleteTable">
          <Trash2 aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ t('editor.table.deleteTable') }}</TooltipContent>
    </Tooltip>
  </div>
</template>
