<!-- The files of a view as square thumbnails or as a list (UI.md 10.3). Selection logic lives in the
     Finder; this component reports clicks, Space (quick look) and drags. -->
<script setup lang="ts">
import { FileTextIcon } from '@lucide/vue'
import { useI18n } from '#imports'
import { Badge } from '@studio/components/ui/badge'
import type { LibFile } from '../../composables/useFilesLibrary'
import { DRAG_TYPE, sizeText } from './util'

const props = defineProps<{ files: LibFile[]; layout: 'grid' | 'list'; selected: ReadonlySet<string>; draggable: boolean }>()
const emit = defineEmits<{ pick: [id: string, how: { shift: boolean; toggle: boolean }]; quicklook: [id: string] }>()
const { t, format } = useI18n()

function click(id: string, event: MouseEvent | KeyboardEvent) {
  emit('pick', id, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey })
}
function key(id: string, event: KeyboardEvent) {
  if (event.key === ' ') {
    event.preventDefault()
    emit('quicklook', id)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    click(id, event)
  }
}
function dragstart(id: string, event: DragEvent) {
  if (!props.selected.has(id)) emit('pick', id, { shift: false, toggle: false })
  const ids = props.selected.has(id) ? [...props.selected] : [id]
  event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(ids))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
const dimensions = (f: LibFile) => (f.width && f.height ? `${f.width} × ${f.height}` : '–')
const date = (f: LibFile) => format.date(f.createdAt, { day: 'numeric', month: 'numeric', year: 'numeric' })
const typeText = (f: LibFile) => (f.kind === 'image' ? f.mime.replace('image/', '').toUpperCase() : 'PDF')
</script>

<template>
  <ul v-if="layout === 'grid'" class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 p-0">
    <li v-for="file in files" :key="file.id">
      <button
        type="button"
        :aria-pressed="selected.has(file.id)"
        :draggable="draggable"
        class="grid w-full cursor-pointer gap-2 rounded-xl border p-2 text-left outline-none transition-colors hover:border-border hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-ring/80"
        :class="selected.has(file.id) ? 'border-primary ring-2 ring-primary' : 'border-transparent'"
        @click="click(file.id, $event)"
        @keydown="key(file.id, $event)"
        @dragstart="dragstart(file.id, $event)"
      >
        <span class="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-md bg-muted">
          <img v-if="file.kind === 'image' && file.url" :src="file.url" alt="" loading="lazy" class="size-full object-cover">
          <FileTextIcon v-else class="size-10 text-muted-foreground" aria-hidden="true" />
          <Badge v-if="file.missingAlt" variant="destructive" class="absolute bottom-1 left-1">{{ t('files.noAlt') }}</Badge>
        </span>
        <span class="truncate px-0.5 text-sm font-medium" :title="file.name">{{ file.name }}</span>
      </button>
    </li>
  </ul>

  <div v-else class="overflow-x-auto rounded-xl border">
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="border-b bg-muted/40 text-left text-[13px] text-muted-foreground">
        <th class="px-4 py-2.5 font-medium">{{ t('files.col.name') }}</th>
        <th class="hidden px-3 py-2 font-medium sm:table-cell">{{ t('files.col.type') }}</th>
        <th class="hidden px-3 py-2 font-medium sm:table-cell">{{ t('files.col.size') }}</th>
        <th class="hidden px-3 py-2 font-medium md:table-cell">{{ t('files.col.dimensions') }}</th>
        <th class="hidden px-3 py-2 font-medium md:table-cell">{{ t('files.col.usedIn') }}</th>
        <th class="hidden px-3 py-2 font-medium lg:table-cell">{{ t('files.col.date') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="file in files"
        :key="file.id"
        class="cursor-pointer border-b last:border-b-0 hover:bg-muted/55"
        :class="selected.has(file.id) ? 'bg-accent' : ''"
        :draggable="draggable"
        @click="click(file.id, $event)"
        @dragstart="dragstart(file.id, $event)"
      >
        <td class="px-4 py-2">
          <button type="button" :aria-pressed="selected.has(file.id)" class="flex w-full items-center gap-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/80" @keydown="key(file.id, $event)">
            <span class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
              <img v-if="file.kind === 'image' && file.url" :src="file.url" alt="" loading="lazy" class="size-full object-cover">
              <FileTextIcon v-else class="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <span class="truncate font-medium">{{ file.name }}</span>
            <Badge v-if="file.missingAlt" variant="destructive">{{ t('files.noAlt') }}</Badge>
          </button>
        </td>
        <td class="hidden px-3 sm:table-cell">{{ typeText(file) }}</td>
        <td class="hidden px-3 sm:table-cell">{{ sizeText(file.size) }}</td>
        <td class="hidden px-3 md:table-cell">{{ dimensions(file) }}</td>
        <td class="hidden px-3 md:table-cell">{{ file.usedCount || '–' }}</td>
        <td class="hidden px-3 lg:table-cell">{{ date(file) }}</td>
      </tr>
    </tbody>
  </table>
  </div>
</template>
