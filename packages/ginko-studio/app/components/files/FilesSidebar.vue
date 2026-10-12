<!-- Views and folders of the Finder (UI.md 10.3). Desktop: a list; phone: one select at the top. A folder
     accepts dragged files (move). -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '#imports'
import { FolderIcon, PlusIcon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
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
  /** Picker mode: no folder creation. */
  picker?: boolean
  error?: string | null
}>()
const emit = defineEmits<{ view: [view: ListView]; folder: [id: string]; create: [name: string]; drop: [folder: string, files: string[]] }>()
const { t } = useI18n()

const VIEWS: ListView[] = ['all', 'recent', 'unused', 'missingAlt', 'duplicates', 'trash']
const badge = computed(() => (props.missingAlt ? String(props.missingAlt) : null))

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
</script>

<template>
  <div class="grid content-start gap-2">
    <!-- The wrapper hides the select and its chevron icon together. -->
    <div class="md:hidden">
    <NativeSelect class="w-full" :model-value="current" :aria-label="t('files.title')" @change="chooseMobile(($event.target as HTMLSelectElement).value)">
      <NativeSelectOption v-for="v in VIEWS" :key="v" :value="`view:${v}`">{{ t(`files.views.${v}`) }}</NativeSelectOption>
      <NativeSelectOptGroup v-if="tree.length" :label="t('files.folders')">
        <NativeSelectOption v-for="f in tree" :key="f.id" :value="`folder:${f.id}`">{{ '  '.repeat(f.depth) + f.name }}</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
    </div>

    <nav class="hidden gap-4 md:grid" :aria-label="t('files.title')">
      <ul class="m-0 grid list-none gap-0.5 p-0">
        <li v-for="v in VIEWS" :key="v">
          <button
            type="button"
            class="flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/80"
            :class="!folder && view === v ? 'bg-accent font-medium' : ''"
            :aria-current="!folder && view === v ? 'true' : undefined"
            @click="emit('view', v)"
          >
            <span>{{ t(`files.views.${v}`) }}</span>
            <Badge v-if="v === 'missingAlt' && badge" variant="destructive">{{ badge }}</Badge>
          </button>
        </li>
      </ul>

      <div class="grid gap-1">
        <h2 class="px-3 text-xs font-medium text-muted-foreground">{{ t('files.folders') }}</h2>
        <ul class="m-0 grid list-none gap-0.5 p-0">
          <li v-for="f in tree" :key="f.id">
            <button
              type="button"
              class="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/80"
              :class="[folder === f.id ? 'bg-accent font-medium' : '', over === f.id ? 'ring-2 ring-primary' : '']"
              :style="{ paddingLeft: `${0.75 + f.depth}rem` }"
              :aria-current="folder === f.id ? 'true' : undefined"
              @click="emit('folder', f.id)"
              @dragover="dragover($event, f.id)"
              @dragleave="over = null"
              @drop="drop($event, f.id)"
            >
              <FolderIcon class="size-4 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ f.name }}</span>
            </button>
          </li>
        </ul>
        <p v-if="error" class="px-3 text-sm font-medium text-destructive" role="alert">{{ error }}</p>
      </div>
    </nav>
    <template v-if="canManage && !picker">
      <form v-if="creating" class="grid gap-2 px-1" @submit.prevent="create">
        <Input v-model="name" :aria-label="t('files.folderName')" autofocus @keydown.esc="creating = false" />
        <div class="flex gap-2">
          <Button type="submit" size="sm" :disabled="!name.trim()">{{ t('files.createFolder') }}</Button>
          <Button type="button" size="sm" variant="ghost" @click="creating = false">{{ t('files.cancel') }}</Button>
        </div>
      </form>
      <Button v-else type="button" variant="ghost" class="justify-start" @click="creating = true"><PlusIcon aria-hidden="true" />{{ t('files.newFolder') }}</Button>
    </template>
  </div>
</template>
