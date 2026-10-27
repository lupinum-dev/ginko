<!-- Views and folders of the Finder (UI.md 10.3). Desktop: a quiet list; phone: one select at the top. A folder
     accepts dragged files (move); owner and admin rename and delete folders from its menu. The nav holds only the
     view and folder buttons named by their label (the e2e tests click them by name); counts sit inside as text. -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from '#imports'
import { AlertCircleIcon, ClockIcon, CopyIcon, EllipsisIcon, FolderIcon, ImagesIcon, PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, UnlinkIcon } from '@lucide/vue'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Input } from '@studio/components/ui/input'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@studio/components/ui/native-select'
import type { Folder, ListView } from '../../composables/useFilesLibrary'
import { DRAG_TYPE } from './util'

const props = defineProps<{
  view: ListView
  folder: string | null
  folders: Folder[]
  missingAlt: number | null
  canManage: boolean
  /** Picker mode: no folder creation, rename or delete. */
  picker?: boolean
}>()
const emit = defineEmits<{
  view: [view: ListView]; folder: [id: string]; create: [name: string]; rename: [id: string, name: string]; delete: [id: string]
  drop: [folder: string, files: string[]]
}>()
const { t, format } = useI18n()

// Failed uploads are for the Files page, not for the picker.
const VIEWS = computed<ListView[]>(() => ['all', 'recent', 'unused', 'missingAlt', 'duplicates', ...(props.picker ? [] : ['problems' as const]), 'trash'])
const ICONS = { all: ImagesIcon, recent: ClockIcon, unused: UnlinkIcon, missingAlt: AlertCircleIcon, duplicates: CopyIcon, problems: TriangleAlertIcon, trash: Trash2Icon }
const badge = computed(() => (props.missingAlt ? format.number(props.missingAlt) : null))
const manage = computed(() => props.canManage && !props.picker)

/** Folders as a flat list in tree order with their depth. */
const tree = computed(() => {
  const out: (Folder & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of props.folders.filter((x) => x.parent === parent)) {
      out.push({ ...f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const current = computed(() => (props.folder ? `folder:${props.folder}` : `view:${props.view}`))
function chooseMobile(text: string) {
  if (text.startsWith('folder:')) emit('folder', text.slice(7))
  else emit('view', text.slice(5) as ListView)
}

const creating = ref(false)
const name = ref('')
function create() {
  const given = name.value.trim()
  if (!given) return
  emit('create', given)
  name.value = ''
  creating.value = false
}

// Rename in place: the folder's row turns into its name field; Enter saves, Escape keeps the old name.
const renaming = ref<string | null>(null)
const newName = ref('')
async function startRename(f: Folder) {
  newName.value = f.name
  renaming.value = f.id
  // The menu hands focus back to its trigger as it closes; the field takes it after that.
  await nextTick()
  setTimeout(() => document.getElementById(`folder-name-${f.id}`)?.focus(), 0)
}
function rename(f: Folder, refocus = false) {
  // Enter saves and removes the field, whose blur then comes too late; Escape left it already.
  if (renaming.value !== f.id) return
  const given = newName.value.trim()
  renaming.value = null
  if (given && given !== f.name) emit('rename', f.id, given)
  if (refocus) void backToFolder(f)
}
function cancelRename(f: Folder) {
  renaming.value = null
  void backToFolder(f)
}
/** The field leaves the page; focus goes back to the folder's button instead of falling to the top of the page. */
async function backToFolder(f: Folder) {
  await nextTick()
  document.getElementById(`folder-${f.id}`)?.focus()
}

const over = ref<string | null>(null)
function dragover(event: DragEvent, id: string) {
  if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return
  event.preventDefault()
  over.value = id
}
function drop(event: DragEvent, id: string) {
  over.value = null
  const raw = event.dataTransfer?.getData(DRAG_TYPE)
  if (!raw) return
  event.preventDefault()
  emit('drop', id, JSON.parse(raw) as string[])
}

const row = 'flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium text-foreground outline-none hover:bg-foreground/[0.05] focus-visible:ring-3 focus-visible:ring-ring/80 aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground min-[900px]:min-h-9'
</script>

<template>
  <div class="grid content-start gap-2">
    <!-- The wrapper hides the select and its chevron icon together. -->
    <div class="md:hidden [&>[data-slot=native-select-wrapper]]:w-full">
    <NativeSelect class="h-11 w-full text-base" :model-value="current" :aria-label="t('files.title')" @change="chooseMobile(($event.target as HTMLSelectElement).value)">
      <NativeSelectOption v-for="v in VIEWS" :key="v" :value="`view:${v}`">{{ t(`files.views.${v}`) }}</NativeSelectOption>
      <NativeSelectOptGroup v-if="tree.length" :label="t('files.folders')">
        <NativeSelectOption v-for="f in tree" :key="f.id" :value="`folder:${f.id}`">{{ '  '.repeat(f.depth) + f.name }}</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
    </div>

    <nav class="hidden gap-4 md:grid" :aria-label="t('files.title')">
      <ul class="m-0 grid list-none gap-px p-0">
        <li v-for="v in VIEWS" :key="v">
          <button type="button" :class="row" :aria-current="!folder && view === v ? 'true' : undefined" @click="emit('view', v)">
            <component :is="ICONS[v]" class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            <span class="min-w-0 flex-1">{{ t(`files.views.${v}`) }}</span>
            <span v-if="v === 'missingAlt' && badge" class="flex-none text-xs font-medium text-warning tabular-nums">{{ badge }}</span>
          </button>
        </li>
      </ul>

      <div v-if="tree.length || manage" class="grid gap-1 border-t pt-3">
        <h2 class="m-0 px-2.5 pb-1 text-xs font-medium text-muted-foreground">{{ t('files.folders') }}</h2>
        <ul class="m-0 grid list-none gap-px p-0">
          <li v-for="f in tree" :key="f.id" class="group/folder relative">
            <form v-if="renaming === f.id" class="px-1 py-0.5" @submit.prevent="rename(f, true)">
              <Input
                :id="`folder-name-${f.id}`" v-model="newName" class="h-9" :aria-label="t('files.folderName')"
                @keydown.esc.prevent="cancelRename(f)" @blur="rename(f)"
              />
            </form>
            <template v-else>
              <button
                :id="`folder-${f.id}`"
                type="button"
                :class="[row, manage && 'pr-10', over === f.id && 'ring-2 ring-primary']"
                :style="{ paddingLeft: `${0.625 + f.depth}rem` }"
                :aria-current="folder === f.id ? 'true' : undefined"
                @click="emit('folder', f.id)"
                @dragover="dragover($event, f.id)"
                @dragleave="over = null"
                @drop="drop($event, f.id)"
              >
                <FolderIcon class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ f.name }}</span>
              </button>
              <DropdownMenu v-if="manage">
                <DropdownMenuTrigger as-child>
                  <Button
                    type="button" variant="ghost" size="icon-sm"
                    class="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground pointer-coarse:size-11 pointer-fine:opacity-0 pointer-fine:group-hover/folder:opacity-100 pointer-fine:focus-visible:opacity-100 data-[state=open]:opacity-100"
                    :aria-label="t('files.folderOptions', { name: f.name })"
                  >
                    <EllipsisIcon class="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem class="min-h-9 pointer-coarse:min-h-11" @select="startRename(f)"><PencilIcon aria-hidden="true" />{{ t('files.renameFolder') }}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" class="min-h-9 pointer-coarse:min-h-11" @select="emit('delete', f.id)"><Trash2Icon aria-hidden="true" />{{ t('files.deleteFolder') }}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </template>
          </li>
        </ul>
      </div>
    </nav>
    <template v-if="manage">
      <form v-if="creating" class="grid gap-2 px-1" @submit.prevent="create">
        <Input v-model="name" :aria-label="t('files.folderName')" autofocus @keydown.esc="creating = false" />
        <div class="flex gap-2">
          <Button type="submit" size="sm" :disabled="!name.trim()">{{ t('files.createFolder') }}</Button>
          <Button type="button" size="sm" variant="ghost" @click="creating = false">{{ t('files.cancel') }}</Button>
        </div>
      </form>
      <Button v-else type="button" variant="ghost" class="justify-start px-2.5 font-medium text-muted-foreground min-[900px]:h-9" @click="creating = true"><PlusIcon aria-hidden="true" />{{ t('files.newFolder') }}</Button>
    </template>
  </div>
</template>
