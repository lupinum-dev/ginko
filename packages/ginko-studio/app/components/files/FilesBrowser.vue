<!-- The Finder (UI.md 10.3): sidebar | grid or list | info panel. The same component is the page
     (`mode="page"`) and the picker inside an image or file field (`mode="picker"`: Recent first,
     single select, no info panel; the picker reports the chosen file). -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from '#imports'
import { acceptOf, limitOf, UPLOAD_TYPES } from '@lupinum/ginko/internal'
import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon, LayoutGridIcon, ListIcon, SearchIcon, UploadIcon, XIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { Input } from '@studio/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@studio/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@studio/components/ui/sheet'
import { Skeleton } from '@studio/components/ui/skeleton'
import type { FilesLibrary, LibFile, ListView } from '../../composables/useFilesLibrary'
import { useToast } from '../../composables/useToast'
import FileGrid from './FileGrid.vue'
import FileInfoPanel from './FileInfoPanel.vue'
import FileRemoveDialog, { type RemoveItem } from './FileRemoveDialog.vue'
import FilesSidebar from './FilesSidebar.vue'
import type { PickKind } from './util'
import { sizeText } from '../../utils/size'

const props = defineProps<{ lib: FilesLibrary; mode: 'page' | 'picker'; kind?: PickKind; locales: string[] }>()
const emit = defineEmits<{ select: [id: string | null]; uploaded: [id: string] }>()
const { t, format } = useI18n()
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

// A search looks in every folder: a photo is found wherever it was filed. The views keep their own scope.
const searching = computed(() => !!searchNow.value.trim())
const list = lib.list(() => ({ view: view.value, ...(folder.value && !searching.value ? { folder: folder.value } : {}), search: searchNow.value }))
const wanted = (file: LibFile) => !props.kind || file.kind === props.kind
const files = computed(() => list.files.value.filter(wanted))
const folderName = computed(() => lib.folders.value.find((f) => f.id === folder.value)?.name ?? t('files.views.all'))
/** Where the files shown come from: the open folder or view, or every file while searching. */
const scope = computed(() => (searching.value && view.value === 'all' ? t('files.searchAll') : folder.value ? folderName.value : t(`files.views.${view.value}`)))
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
  // A search would cover every folder: the folder asked for shows its files.
  clearTimeout(searchTimer)
  search.value = ''
  searchNow.value = ''
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
const accept = computed(() => (props.kind === 'image' ? acceptOf('image') : props.kind === 'pdf' ? acceptOf('file') : `${acceptOf('image')},${acceptOf('file')}`))

/** What the drop zone of an empty library accepts: the photo types and the PDF, each with its size limit. */
const acceptedText = computed(() => {
  const photos = Object.values(UPLOAD_TYPES).filter((type) => type.kind === 'image').map((type) => type.label).join(', ')
  return [
    ...(props.kind !== 'pdf' ? [t('files.dropPhotos', { types: photos, size: sizeText(limitOf('image'), format.number) })] : []),
    ...(props.kind !== 'image' ? [t('files.dropPdf', { size: sizeText(limitOf('file'), format.number) })] : []),
  ].join(' · ')
})

/** The files of the last upload that failed, each with its reason: one line per file, so none hides another. */
const failedUploads = ref<{ name: string; message: string }[]>([])

async function upload(incoming: File[]) {
  error.value = null
  failedUploads.value = []
  for (const file of incoming) {
    uploading.value++
    try {
      const id = await lib.upload(file, { folder: folder.value })
      selected.value = new Set([id])
      anchor = id
      emit('uploaded', id)
    } catch (e) {
      failedUploads.value = [...failedUploads.value, { name: file.name, message: lib.errorText(e) }]
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

// A folder is deleted only when it is empty (the server says so otherwise); the dialog stays open with the reason.
const folderGone = ref<{ id: string; name: string } | null>(null)
const folderError = ref<string | null>(null)
const deletingFolder = ref(false)
function askDeleteFolder(id: string) {
  folderError.value = null
  folderGone.value = { id, name: lib.folders.value.find((f) => f.id === id)?.name ?? '' }
}
async function confirmDeleteFolder() {
  const target = folderGone.value
  if (!target) return
  deletingFolder.value = true
  folderError.value = null
  try {
    await lib.deleteFolder(target.id)
    if (folder.value === target.id) setView('all')
    folderGone.value = null
  } catch (e) {
    folderError.value = lib.errorText(e)
  } finally {
    deletingFolder.value = false
  }
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

// Details is a column from lg (1024px), narrower below xl so the grid keeps two columns; below lg it opens as the bottom
// sheet. A modal sheet on a laptop would block a second (Cmd/Shift) click and dragging a file onto a folder.
const wide = useMediaQuery('(min-width: 1024px)')
const panelOpen = computed(() => !picker && selected.value.size > 0)
const singleId = computed(() => (selected.value.size === 1 ? [...selected.value][0]! : null))
const emptyText = computed(() => {
  if (search.value.trim() || folder.value) return t('files.empty.none')
  return t(`files.empty.${view.value}` as const)
})
/** An empty library (not an empty view, folder or search): the drop zone with the Upload button. */
const emptyLibrary = computed(() => (view.value === 'all' || view.value === 'recent') && !folder.value && !search.value.trim())
/** The empty library shows its drop zone (with its own Upload button); the picker toolbar then leaves out a second one. */
const showDrop = computed(() => !list.error.value && !list.pending.value && !files.value.length && !list.hasMore.value && emptyLibrary.value)
// Sticky columns stop under the Studio's top bar and stay within the screen; each scrolls on its own.
const stick = 'lg:sticky lg:top-[calc(var(--studio-header-height)+1rem)] lg:max-h-[calc(100dvh-var(--studio-header-height)-2rem)] lg:overflow-y-auto'

function chooseFiles() {
  if (!inTrash.value) input.value?.click()
}
/** The page puts its Upload button in the title row; it opens this Finder's chooser (folder and selection rules stay here). */
defineExpose({ chooseFiles, canUpload: computed(() => !inTrash.value) })
</script>

<template>
  <div
    class="relative grid min-h-0 gap-4 md:grid-cols-[12.5rem_minmax(0,1fr)] md:gap-6"
    :class="[panelOpen && wide ? 'lg:grid-cols-[12.5rem_minmax(0,1fr)_17rem] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]' : 'xl:grid-cols-[15rem_minmax(0,1fr)]', picker && 'md:h-[60vh] md:grid-rows-[minmax(0,1fr)]']"
    @dragenter="dragenter"
    @dragover="dragover"
    @dragleave="dragleave"
    @drop="drop"
  >
    <!-- In the picker (from md) the sidebar and the files scroll each on their own: a folder low in the list keeps the files in view. -->
    <!-- The padding (and the matching negative margin) gives the rows' focus ring room inside the scroll container. -->
    <FilesSidebar
      :class="picker ? 'md:min-h-0 md:overflow-y-auto' : [stick, 'lg:-m-1 lg:self-start lg:p-1']"
      :view="view"
      :folder="folder"
      :folders="lib.folders.value"
      :missing-alt="lib.missingAlt.value"
      :can-manage="lib.canManage.value"
      :picker="picker"
      @view="setView"
      @folder="setFolder"
      @create="(name) => run(() => lib.createFolder(name, null))"
      @rename="(id, name) => run(() => lib.renameFolder(id, name))"
      @delete="askDeleteFolder"
      @drop="dropOnFolder"
    />

    <div class="grid min-h-0 min-w-0 content-start gap-4" :class="picker && 'md:overflow-y-auto md:px-1 md:pb-1'">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <!-- Where the files shown come from, as the heading of the grid. -->
        <h2 data-scope class="m-0 min-w-0 flex-[1_1_10rem] truncate text-base font-semibold" :class="!searching && !folder && 'max-md:sr-only'">{{ scope }}</h2>
        <div class="relative min-w-40 flex-[1_1_12rem] sm:max-w-72">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input v-model="search" type="search" class="pl-9" :aria-label="t('files.search')" :placeholder="t('files.search')" />
        </div>
        <ToggleGroup type="single" variant="segmented" :aria-label="t('files.title')" :model-value="layout" @update:model-value="(next) => next && setLayout(next as 'grid' | 'list')">
          <ToggleGroupItem value="grid" :aria-label="t('files.layoutGrid')"><LayoutGridIcon aria-hidden="true" /></ToggleGroupItem>
          <ToggleGroupItem value="list" :aria-label="t('files.layoutList')"><ListIcon aria-hidden="true" /></ToggleGroupItem>
        </ToggleGroup>
        <Button v-if="picker && !showDrop" type="button" variant="outline" :disabled="inTrash" @click="chooseFiles"><UploadIcon aria-hidden="true" />{{ t('files.upload') }}</Button>
        <input ref="input" class="sr-only" type="file" tabindex="-1" aria-hidden="true" :multiple="!picker" :accept="accept" @change="chosenFiles">
      </div>

      <p v-if="uploading" class="text-sm font-medium text-muted-foreground" role="status">{{ t('files.uploading') }}</p>
      <p v-if="error" class="text-sm font-medium text-destructive" role="alert">{{ error }}</p>
      <!-- The alert wraps the list: on the <ul> itself the role would replace its list role. -->
      <div v-if="failedUploads.length" role="alert">
        <ul class="grid gap-1 text-sm font-medium text-destructive">
          <li v-for="(failed, i) in failedUploads" :key="i">{{ t('files.uploadFailedFile', { name: failed.name, message: failed.message }) }}</li>
        </ul>
      </div>

      <p v-if="list.error.value" class="text-sm font-medium text-destructive" role="alert">{{ list.error.value }}</p>
      <div v-else-if="list.pending.value" role="status" class="@container">
        <span class="sr-only">{{ t('files.loading') }}</span>
        <div class="grid grid-cols-2 gap-3 @sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] @sm:gap-4" aria-hidden="true">
          <div v-for="n in 8" :key="n" class="grid gap-2 p-1.5"><Skeleton class="aspect-square rounded-lg" /><Skeleton class="h-4 w-3/4" /><Skeleton class="h-3.5 w-1/2" /></div>
        </div>
      </div>
      <div
        v-else-if="showDrop"
        class="grid justify-items-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center min-[900px]:py-20"
        :class="picker && 'py-10 min-[900px]:py-12'"
      >
        <span class="grid size-12 place-items-center rounded-full bg-muted"><UploadIcon class="size-5 text-muted-foreground" aria-hidden="true" /></span>
        <p class="m-0 max-w-[42ch] text-[15px] font-medium text-balance">{{ emptyText }}</p>
        <p class="m-0 text-[13px] text-muted-foreground">{{ acceptedText }}</p>
        <Button type="button" variant="outline" class="mt-1" @click="chooseFiles"><UploadIcon aria-hidden="true" />{{ t('files.upload') }}</Button>
      </div>
      <p v-else-if="!files.length && !list.hasMore.value" class="rounded-xl bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">{{ emptyText }}</p>
      <FileGrid
        v-else
        :files="files"
        :layout="layout"
        :selected="selected"
        :dense="picker"
        :draggable="!picker && lib.canManage.value && !inTrash"
        @pick="pick"
        @quicklook="openLook"
      />
      <p v-if="list.moreError.value" class="text-sm font-medium text-destructive" role="alert">{{ list.moreError.value }}</p>
      <Button v-if="list.hasMore.value" type="button" variant="secondary" class="justify-self-start" :disabled="loadingMore" @click="more">{{ list.moreError.value ? t('basics.retry') : t('basics.loadMore') }}</Button>
    </div>

    <!-- Info panel: a column on a wide screen that stays in view while the grid scrolls (its own scroll), a bottom sheet below. -->
    <aside v-if="singleId && wide && !picker" class="min-w-0 self-start rounded-xl border bg-card" :class="stick" :aria-label="t('files.info.title')">
      <div class="flex items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
        <h2 class="m-0 text-sm font-semibold">{{ t('files.info.title') }}</h2>
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="t('files.close')" @click="clear"><XIcon class="size-4" aria-hidden="true" /></Button>
      </div>
      <FileInfoPanel class="p-4" v-if="singleId" :id="singleId" :key="singleId" :lib="lib" :locales="locales" :in-trash="inTrash" @remove="askRemove" @move-to="openMove" @restore="restoreSelected" />
    </aside>
    <!-- Rendered on every width (closed when wide): the server cannot know the width, so a v-if on it would differ
         between the server HTML and a wide browser. Its place before the remove dialog keeps that dialog on top. -->
    <Sheet v-if="!picker" :open="singleId !== null && !wide" @update:open="(open) => { if (!open) clear() }">
      <SheetContent side="bottom" class="max-h-[85vh] overflow-y-auto p-4" aria-describedby="undefined">
        <SheetHeader class="p-0"><SheetTitle>{{ t('files.info.title') }}</SheetTitle></SheetHeader>
        <FileInfoPanel v-if="singleId" :id="singleId" :key="singleId" :lib="lib" :locales="locales" :in-trash="inTrash" @remove="askRemove" @move-to="openMove" @restore="restoreSelected" />
      </SheetContent>
    </Sheet>

    <!-- Several files selected: the same actions for all of them. -->
    <div v-if="panelOpen && selected.size > 1" class="fixed inset-x-0 bottom-0 z-40 grid gap-3 border-t bg-background p-3 shadow-lg lg:bottom-auto lg:col-start-3 lg:row-start-1 lg:self-start lg:rounded-xl lg:border lg:bg-card lg:p-4 lg:shadow-none" :class="stick" data-testid="multi-panel">
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

    <div v-if="dragDepth > 0" class="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/85 text-lg font-medium" data-testid="drop-overlay">
      {{ t('files.dropTo', { folder: folderName }) }}
    </div>

    <FileRemoveDialog v-model:open="removeOpen" :slug="lib.slug.value" :items="removeItems" :busy="removing" :error="removeError" @confirm="confirmRemove" />

    <Dialog :open="folderGone !== null" @update:open="(open) => { if (!open) folderGone = null }">
      <DialogContent class="sm:max-w-md" aria-describedby="folder-delete-text">
        <DialogHeader>
          <DialogTitle>{{ t('files.deleteFolder') }}</DialogTitle>
          <DialogDescription id="folder-delete-text">{{ t('files.deleteFolderText', { name: folderGone?.name ?? '' }) }}</DialogDescription>
        </DialogHeader>
        <p v-if="folderError" class="text-sm font-medium text-destructive" role="alert">{{ folderError }}</p>
        <DialogFooter>
          <Button type="button" variant="outline" @click="folderGone = null">{{ t('files.cancel') }}</Button>
          <Button type="button" variant="destructive" :disabled="deletingFolder" @click="confirmDeleteFolder">{{ t('files.delete') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
