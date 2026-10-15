<!-- The Finder (UI.md 10.3): sidebar | grid or list | info panel. The same component is the page
     (`mode="page"`) and the picker inside an image or file field (`mode="picker"`: Recent first,
     single select, no info panel; the picker reports the chosen file). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from '#imports'
import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon, LayoutGridIcon, ListIcon, SearchIcon, UploadIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { Input } from '@studio/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@studio/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@studio/components/ui/sheet'
import type { FilesLibrary, LibFile, ListView } from '../../composables/useFilesLibrary'
import { useToast } from '../../composables/useToast'
import FileGrid from './FileGrid.vue'
import FileInfoPanel from './FileInfoPanel.vue'
import FileRemoveDialog, { type RemoveItem } from './FileRemoveDialog.vue'
import FilesSidebar from './FilesSidebar.vue'
import type { PickKind } from './util'

const props = defineProps<{ lib: FilesLibrary; mode: 'page' | 'picker'; kind?: PickKind; locales: string[] }>()
const emit = defineEmits<{ select: [id: string | null]; uploaded: [id: string] }>()
const { t } = useI18n()
const { show } = useToast()
const lib = props.lib
const picker = props.mode === 'picker'

// ---- What is shown ----

const view = ref<ListView>(picker ? 'recent' : 'all')
const folder = ref<string | null>(null)
const search = ref('')
const searchNow = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { searchNow.value = value }, 250)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const LAYOUT_KEY = 'ginko:files:layout'
function storedLayout(): 'grid' | 'list' {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}
const layout = ref<'grid' | 'list'>(storedLayout())
function setLayout(value: 'grid' | 'list') {
  layout.value = value
  try {
    localStorage.setItem(LAYOUT_KEY, value)
  } catch { /* private window: the choice lasts for this visit */ }
}

const list = lib.list(() => ({ view: view.value, ...(folder.value ? { folder: folder.value } : {}), search: searchNow.value }))
const wanted = (file: LibFile) => !props.kind || file.kind === props.kind
const files = computed(() => list.files.value.filter(wanted))
const folderName = computed(() => lib.folders.value.find((f) => f.id === folder.value)?.name ?? t('files.views.all'))
const inTrash = computed(() => view.value === 'trash')

// A picker filtered to one type can show few files per page: read on while the page looks empty.
const loadingMore = ref(false)
async function more() {
  if (loadingMore.value || !list.hasMore.value) return
  loadingMore.value = true
  try {
    await list.more()
  } finally {
    loadingMore.value = false
  }
}
watch([files, () => list.hasMore.value], () => {
  if (picker && files.value.length < 12 && list.hasMore.value) void more()
})

function setView(next: ListView) {
  view.value = next
  folder.value = null
  clear()
}
function setFolder(id: string) {
  view.value = 'all'
  folder.value = id
  clear()
}

// ---- Selection ----

const selected = ref<Set<string>>(new Set())
let anchor: string | null = null
function clear() {
  selected.value = new Set()
  anchor = null
}
function pick(id: string, how: { shift: boolean; toggle: boolean }) {
  if (picker) {
    selected.value = new Set([id])
  } else if (how.shift && anchor) {
    const ids = files.value.map((f): string => f.id)
    const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)]
    selected.value = new Set(a < 0 || b < 0 ? [id] : ids.slice(Math.min(a, b), Math.max(a, b) + 1))
    return
  } else if (how.toggle) {
    const next = new Set(selected.value)
    if (!next.delete(id)) next.add(id)
    selected.value = next
  } else {
    selected.value = new Set([id])
  }
  anchor = id
}
// Files that left the view (removed, moved) leave the selection.
watch(files, (now) => {
  if (picker) return
  const ids = new Set<string>(now.map((f) => f.id))
  const keep = [...selected.value].filter((id) => ids.has(id))
  if (keep.length !== selected.value.size) selected.value = new Set(keep)
})
const chosen = computed(() => files.value.filter((f) => selected.value.has(f.id)))
watch(selected, (now) => { if (picker) emit('select', [...now][0] ?? null) })

// ---- Messages ----

const error = ref<string | null>(null)
async function run(action: () => Promise<unknown>) {
  error.value = null
  try {
    await action()
    return true
  } catch (e) {
    error.value = lib.errorText(e)
    return false
  }
}

// ---- Upload and drop ----

const input = ref<HTMLInputElement | null>(null)
const uploading = ref(0)
const accept = computed(() => (props.kind === 'image' ? 'image/jpeg,image/png,image/webp,image/heic' : props.kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/heic,application/pdf'))

async function upload(incoming: File[]) {
  error.value = null
  for (const file of incoming) {
    uploading.value++
    try {
      const id = await lib.upload(file, { folder: folder.value })
      selected.value = new Set([id])
      anchor = id
      emit('uploaded', id)
    } catch (e) {
      error.value = lib.errorText(e)
    } finally {
      uploading.value--
    }
  }
}
function chosenFiles(event: Event) {
  const el = event.target as HTMLInputElement
  const picked = [...(el.files ?? [])]
  el.value = ''
  void upload(picker ? picked.slice(0, 1) : picked)
}

const dragDepth = ref(0)
const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true
function dragenter(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragDepth.value++
}
function dragover(event: DragEvent) {
  if (hasFiles(event)) event.preventDefault()
}
function dragleave(event: DragEvent) {
  if (hasFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function drop(event: DragEvent) {
  dragDepth.value = 0
  if (!hasFiles(event)) return
  event.preventDefault()
  void upload([...(event.dataTransfer?.files ?? [])])
}

// ---- Move and remove ----

const moveOpen = ref(false)
const moveTarget = ref('')
function openMove() {
  moveTarget.value = ''
  moveOpen.value = true
}
async function confirmMove() {
  const ids = [...selected.value]
  if (await run(() => lib.move(ids, moveTarget.value || null))) moveOpen.value = false
}
async function dropOnFolder(target: string, ids: string[]) {
  await run(() => lib.move(ids, target))
}

const removeOpen = ref(false)
const removeItems = ref<RemoveItem[]>([])
const removeError = ref<string | null>(null)
const removing = ref(false)
const anyUsed = computed(() => chosen.value.some((f) => f.used))

async function askRemove() {
  removeError.value = null
  const rows = chosen.value
  const details = new Map((await lib.usage(rows.filter((f) => f.used).map((f) => f.id)).catch((e) => { removeError.value = lib.errorText(e); return [] })).map((d) => [d.id, d.usedIn]))
  removeItems.value = rows.map((f) => ({ id: f.id, name: f.name, used: f.used, usedIn: details.get(f.id) ?? [] }))
  removeOpen.value = true
}
async function confirmRemove() {
  removing.value = true
  removeError.value = null
  try {
    const ids = removeItems.value.map((i) => i.id)
    const result = await lib.trash(ids)
    if (result.refused.length) {
      // Used since the dialog opened: show the rule instead.
      const by = new Map(result.refused.map((r) => [r.file, r.usedIn]))
      removeItems.value = removeItems.value.map((i) => (by.has(i.id) ? { ...i, used: true, usedIn: by.get(i.id)! } : i))
      return
    }
    removeOpen.value = false
    clear()
    show(t('files.removed', { count: result.trashed.length }), { action: { label: t('files.restore'), run: () => lib.restore(result.trashed) } })
  } catch (e) {
    removeError.value = lib.errorText(e)
  } finally {
    removing.value = false
  }
}
async function restoreSelected() {
  const ids = [...selected.value]
  if (await run(() => lib.restore(ids))) clear()
}

// ---- Quick look ----

const lookAt = ref<string | null>(null)
const look = computed(() => files.value.find((f) => f.id === lookAt.value))
function openLook(id: string) {
  if (picker) return
  lookAt.value = id
  if (!selected.value.has(id)) pick(id, { shift: false, toggle: false })
}
function stepLook(step: number) {
  const index = files.value.findIndex((f) => f.id === lookAt.value)
  const next = files.value[index + step]
  if (next) lookAt.value = next.id
}
function lookKey(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') stepLook(1)
  else if (event.key === 'ArrowLeft') stepLook(-1)
}

// ---- Layout ----

const desktop = useMediaQuery('(min-width: 1024px)')
const panelOpen = computed(() => !picker && selected.value.size > 0)
const singleId = computed(() => (selected.value.size === 1 ? [...selected.value][0]! : null))
const emptyText = computed(() => {
  if (search.value.trim() || folder.value) return t('files.empty.none')
  return t(`files.empty.${view.value}` as const)
})
</script>

<template>
  <div
    class="relative grid min-h-0 gap-4 md:grid-cols-[13.75rem_minmax(0,1fr)]"
    :class="panelOpen && desktop ? 'lg:grid-cols-[13.75rem_minmax(0,1fr)_20rem]' : ''"
    @dragenter="dragenter"
    @dragover="dragover"
    @dragleave="dragleave"
    @drop="drop"
  >
    <FilesSidebar
      :view="view"
      :folder="folder"
      :folders="lib.folders.value"
      :missing-alt="lib.missingAlt.value"
      :can-manage="lib.canManage.value"
      :picker="picker"
      @view="setView"
      @folder="setFolder"
      @create="(name) => run(() => lib.createFolder(name, null))"
      @drop="dropOnFolder"
    />

    <div class="grid min-h-0 min-w-0 content-start gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-40 flex-1">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input v-model="search" type="search" class="pl-9" :aria-label="t('files.search')" :placeholder="t('files.search')" />
        </div>
        <ToggleGroup type="single" variant="segmented" :aria-label="t('files.title')" :model-value="layout" @update:model-value="(next) => next && setLayout(next as 'grid' | 'list')">
          <ToggleGroupItem value="grid" :aria-label="t('files.layoutGrid')"><LayoutGridIcon aria-hidden="true" /></ToggleGroupItem>
          <ToggleGroupItem value="list" :aria-label="t('files.layoutList')"><ListIcon aria-hidden="true" /></ToggleGroupItem>
        </ToggleGroup>
        <Button type="button" :disabled="inTrash" @click="input?.click()"><UploadIcon aria-hidden="true" />{{ t('files.upload') }}</Button>
        <input ref="input" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :multiple="!picker" :accept="accept" @change="chosenFiles">
      </div>

      <p v-if="uploading" class="text-sm font-medium text-muted-foreground" role="status">{{ t('files.uploading') }}</p>
      <p v-if="error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>

      <p v-if="list.error.value" class="text-sm font-medium text-destructive" role="alert">{{ list.error.value }}</p>
      <p v-else-if="list.pending.value" class="text-sm text-muted-foreground" role="status">{{ t('files.loading') }}</p>
      <p v-else-if="!files.length && !list.hasMore.value" class="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{{ emptyText }}</p>
      <FileGrid
        v-else
        :files="files"
        :layout="layout"
        :selected="selected"
        :draggable="!picker && lib.canManage.value && !inTrash"
        @pick="pick"
        @quicklook="openLook"
      />
      <p v-if="list.moreError.value" class="text-sm font-medium text-destructive" role="alert">{{ list.moreError.value }}</p>
      <Button v-if="list.hasMore.value" type="button" variant="secondary" class="justify-self-start" :disabled="loadingMore" @click="more">{{ list.moreError.value ? t('fields.retry') : t('files.loadMore') }}</Button>
    </div>

    <!-- Info panel: a column on a wide screen, a bottom sheet below. -->
    <aside v-if="singleId && desktop" class="min-w-0 overflow-y-auto" :aria-label="t('files.info.title')">
      <FileInfoPanel v-if="singleId" :id="singleId" :key="singleId" :lib="lib" :locales="locales" :in-trash="inTrash" :show-alt="mode !== 'picker'" @remove="askRemove" @move-to="openMove" @restore="restoreSelected" />
    </aside>
    <Sheet v-if="!desktop && !picker" :open="singleId !== null" @update:open="(open) => { if (!open) clear() }">
      <SheetContent side="bottom" class="max-h-[85vh] overflow-y-auto p-4" aria-describedby="undefined">
        <SheetHeader class="p-0"><SheetTitle>{{ t('files.info.title') }}</SheetTitle></SheetHeader>
        <FileInfoPanel v-if="singleId" :id="singleId" :key="singleId" :lib="lib" :locales="locales" :in-trash="inTrash" :show-alt="mode !== 'picker'" @remove="askRemove" @move-to="openMove" @restore="restoreSelected" />
      </SheetContent>
    </Sheet>

    <!-- Several files selected: the same actions for all of them. -->
    <div v-if="panelOpen && selected.size > 1" class="fixed inset-x-0 bottom-0 z-40 grid gap-2 border-t bg-background p-3 shadow-lg lg:static lg:col-start-3 lg:row-start-1 lg:border lg:rounded-xl" data-testid="multi-panel">
      <p class="text-sm font-medium">{{ t('files.selected', { count: selected.size }) }}</p>
      <div class="flex flex-wrap gap-2">
        <template v-if="inTrash">
          <Button v-if="lib.canManage.value" type="button" @click="restoreSelected">{{ t('files.restore') }}</Button>
        </template>
        <template v-else-if="lib.canManage.value">
          <Button type="button" variant="secondary" @click="openMove">{{ t('files.moveTo') }}</Button>
          <Button type="button" variant="secondary" @click="askRemove">{{ anyUsed ? t('files.removeUsed') : t('files.remove') }}</Button>
        </template>
        <Button type="button" variant="ghost" @click="clear">{{ t('files.cancel') }}</Button>
      </div>
    </div>

    <div v-if="dragDepth > 0" class="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-md border-2 border-dashed border-primary bg-background/80 text-lg font-medium" data-testid="drop-overlay">
      {{ t('files.dropTo', { folder: folderName }) }}
    </div>

    <FileRemoveDialog v-model:open="removeOpen" :slug="lib.slug.value" :items="removeItems" :busy="removing" :error="removeError" @confirm="confirmRemove" />

    <Dialog v-model:open="moveOpen">
      <DialogContent class="sm:max-w-sm" aria-describedby="undefined">
        <DialogHeader><DialogTitle>{{ t('files.moveTo') }}</DialogTitle></DialogHeader>
        <NativeSelect v-model="moveTarget" class="w-full" :aria-label="t('files.folders')">
          <NativeSelectOption value="">{{ t('files.noFolder') }}</NativeSelectOption>
          <NativeSelectOption v-for="f in lib.folders.value" :key="f.id" :value="f.id">{{ f.name }}</NativeSelectOption>
        </NativeSelect>
        <DialogFooter>
          <Button type="button" variant="secondary" @click="moveOpen = false">{{ t('files.cancel') }}</Button>
          <Button type="button" @click="confirmMove">{{ t('files.move') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="lookAt !== null" @update:open="(open) => { if (!open) lookAt = null }">
      <DialogContent class="sm:max-w-4xl" aria-describedby="undefined" @keydown="lookKey">
        <DialogHeader><DialogTitle class="truncate pr-8">{{ look?.name }}</DialogTitle></DialogHeader>
        <div class="grid min-h-64 place-items-center">
          <img v-if="look?.kind === 'image' && look.url" :src="look.url" alt="" class="max-h-[70vh] max-w-full object-contain">
          <FileTextIcon v-else class="size-24 text-muted-foreground" aria-hidden="true" />
        </div>
        <DialogFooter class="sm:justify-between">
          <Button type="button" variant="secondary" size="icon" :aria-label="t('files.previous')" @click="stepLook(-1)"><ChevronLeftIcon aria-hidden="true" /></Button>
          <Button type="button" variant="secondary" size="icon" :aria-label="t('files.next')" @click="stepLook(1)"><ChevronRightIcon aria-hidden="true" /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
