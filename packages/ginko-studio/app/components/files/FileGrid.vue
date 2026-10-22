<!-- The files of a view as square cards or as a list (UI.md 10.3). Selection logic lives in the
     Finder; this component reports clicks, Space (quick look) and drags. -->
<script setup lang="ts">
import { FileTextIcon } from '@lucide/vue'
import { useI18n } from '#imports'
import { Badge } from '@studio/components/ui/badge'
import type { LibFile } from '../../composables/useFilesLibrary'
import { DRAG_TYPE } from './util'
import { sizeText } from '../../utils/size'

/** `dense`: the picker's dialog, where more and smaller cards help to find the one photo. */
const props = defineProps<{ files: LibFile[]; layout: 'grid' | 'list'; selected: ReadonlySet<string>; draggable: boolean; dense?: boolean }>()
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
/** The crop of a square thumbnail keeps the focus point in view (centred when none is set). */
const focusStyle = (f: LibFile) => (f.focus ? { objectPosition: `${f.focus.x * 100}% ${f.focus.y * 100}%` } : undefined)
</script>

<template>
  <!-- A card per file: the photo square, cropped around its focus point, the name, and type and size below. Only the photo
       and the name are inside the button (its name stays the file name, the e2e tests click by it); the button stretches
       over the whole card. Two columns in a narrow container (phone, 1024 with the details open), else 11rem cards. -->
  <div v-if="layout === 'grid'" class="@container">
    <ul class="m-0 grid list-none grid-cols-2 gap-3 p-0" :class="dense ? '@sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]' : '@sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] @sm:gap-4'">
      <li
        v-for="file in files"
        :key="file.id"
        class="relative grid content-start gap-0.5 rounded-xl p-1.5 pb-2 transition-colors hover:bg-foreground/[0.04]"
        :class="selected.has(file.id) ? 'bg-accent/60 ring-2 ring-primary hover:bg-accent/60' : ''"
      >
        <button
          type="button"
          :aria-pressed="selected.has(file.id)"
          :draggable="draggable"
          class="grid min-w-0 cursor-pointer gap-2 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/80"
          @click="click(file.id, $event)"
          @keydown="key(file.id, $event)"
          @dragstart="dragstart(file.id, $event)"
        >
          <span class="grid aspect-square place-items-center overflow-hidden rounded-lg bg-muted">
            <img v-if="file.kind === 'image' && file.url" :src="file.url" alt="" loading="lazy" class="size-full object-cover" :style="focusStyle(file)">
            <FileTextIcon v-else class="size-10 text-muted-foreground" aria-hidden="true" />
          </span>
          <span class="truncate px-1 text-sm font-medium" :title="file.name">{{ file.name }}</span>
        </button>
        <p class="m-0 truncate px-1 text-[13px] text-muted-foreground tabular-nums">{{ typeText(file) }} · {{ sizeText(file.size, format.number) }}</p>
        <Badge v-if="file.missingAlt" variant="warning" class="mx-1 mt-1 justify-self-start">{{ t('files.noAlt') }}</Badge>
      </li>
    </ul>
  </div>

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
            <Badge v-if="file.missingAlt" variant="warning">{{ t('files.noAlt') }}</Badge>
          </button>
        </td>
        <td class="hidden px-3 sm:table-cell">{{ typeText(file) }}</td>
        <td class="hidden px-3 sm:table-cell">{{ sizeText(file.size, format.number) }}</td>
        <td class="hidden px-3 md:table-cell">{{ dimensions(file) }}</td>
        <td class="hidden px-3 md:table-cell">{{ file.usedCount || '–' }}</td>
        <td class="hidden px-3 lg:table-cell">{{ date(file) }}</td>
      </tr>
    </tbody>
  </table>
  </div>
</template>
