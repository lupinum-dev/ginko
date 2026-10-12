<!-- ⌘K / Ctrl+K on every site page (UI.md 10.6). Empty: the last entries opened, then actions. Typing: search.studio
     (entries by title in all languages, areas by label). Enter opens, ⌘/Ctrl+Enter opens in a new tab. The server decides
     what matches, so the Command's own client-side filter is not used (the filter field is a plain ListboxFilter). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { navigateTo, useConvexQuery, useI18n } from '#imports'
import { computed, ref, watch } from 'vue'
import { ListboxFilter } from 'reka-ui'
import { SearchIcon } from '@lucide/vue'
import type { Schema } from '@lupinum/ginko'
import { Badge } from '@studio/components/ui/badge'
import { Command, CommandGroup, CommandItem, CommandList } from '@studio/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { readRecent, type RecentEntry } from '../composables/useRecentEntries'
import { creatableBricks, entryPath } from '../utils/basics'
import { shownLabel } from '../utils/labels'

const props = defineProps<{ open: boolean; slug: string; schema: Schema | undefined; role: string | undefined; grants: readonly string[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; update: [] }>()
const { t } = useI18n()

const manager = computed(() => props.role === 'owner' || props.role === 'admin')
const main = computed(() => props.schema?.locales[0] ?? '')

const query = ref('')
// The search starts a moment after the last key, so one word is one call.
const asked = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (text) => {
  clearTimeout(timer)
  if (!text.trim()) asked.value = ''
  else timer = setTimeout(() => { asked.value = text.trim() }, 150)
})
const recent = ref<RecentEntry[]>([])
watch(() => props.open, (open) => {
  if (open) recent.value = readRecent(props.slug)
  else { query.value = ''; asked.value = '' }
}, { immediate: true })

const { data } = useConvexQuery(api.search.studio, () => (props.open && asked.value ? { site: props.slug, query: asked.value } : 'skip'))
const searching = computed(() => !!query.value.trim())
const nothing = computed(() => !!asked.value && !!data.value && !data.value.entries.length && !data.value.bricks.length)

const site = (path: string) => `/s/${props.slug}${path}`
interface Item { value: string; label: string; area?: string; state?: string; run: () => void }

const actions = computed<Item[]>(() => [
  ...creatableBricks(props.schema ?? ({ bricks: {} } as Schema), props.role, props.grants).map(([key, brick]) => ({
    value: `new:${key}`, label: t('basics.palette.newIn', { area: shownLabel(brick.label, main.value) }), run: () => go(site(`/all/${key}/new`)),
  })),
  { value: 'files', label: t('nav.files'), run: () => go(site('/files')) },
  { value: 'history', label: t('nav.history'), run: () => go(site('/history')) },
  ...(manager.value ? [
    { value: 'review', label: t('basics.palette.review'), run: () => go(site('/review')) },
    { value: 'update', label: t('basics.update.menu'), run: () => emit('update') },
  ] : []),
])
const recents = computed<Item[]>(() => recent.value.map((r) => ({ value: `recent:${r.to}`, label: r.label, area: r.area, run: () => go(r.to) })))
/** An area's label in the Studio language; the server words labels in the site's main language. */
const areaLabel = (brick: string, fallback: string) => {
  const def = props.schema?.bricks[brick]
  return def ? shownLabel(def.label, main.value) : fallback
}
const entries = computed<Item[]>(() => (searching.value ? data.value?.entries ?? [] : []).map((e) => ({
  value: `entry:${e.entry}`, label: e.label, area: areaLabel(e.brick, e.brickLabel), state: e.state === 'draft' ? t('entry.status.draft') : t('entry.status.online'),
  run: () => go(entryPath(props.slug, props.schema, e.brick, e.entry)),
})))
const areas = computed<Item[]>(() => (searching.value ? data.value?.bricks ?? [] : []).map((b) => ({ value: `area:${b.brick}`, label: areaLabel(b.brick, b.label), run: () => go(site(`/all/${b.brick}`)) })))

/** `inNewTab`: ⌘Enter / Ctrl+Enter. */
let newTab = false
function go(path: string) {
  emit('update:open', false)
  void navigateTo(path, newTab ? { open: { target: '_blank' } } : undefined)
}
function pick(item: Item, event: { detail?: { originalEvent?: Event } }) {
  const original = event.detail?.originalEvent as KeyboardEvent | MouseEvent | undefined
  newTab = !!(original && (original.metaKey || original.ctrlKey))
  item.run()
  newTab = false
}

// Typing highlights the first item at once, but the list is replaced when the answer arrives, so that item is gone.
// Enter then opens the first result; with a highlighted item still on screen (arrow keys, pointer) the Command opens that one.
const highlighted = ref<HTMLElement>()
function onEnter(event: KeyboardEvent) {
  if (highlighted.value?.isConnected) return
  const first = searching.value ? (entries.value[0] ?? areas.value[0]) : undefined
  if (!first) return
  event.preventDefault()
  pick(first, { detail: { originalEvent: event } })
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="overflow-hidden rounded-2xl p-0" :show-close-button="false">
      <DialogHeader class="sr-only">
        <DialogTitle>{{ t('basics.palette.title') }}</DialogTitle>
        <DialogDescription>{{ t('basics.palette.description') }}</DialogDescription>
      </DialogHeader>
      <Command @highlight="highlighted = $event?.ref">
        <div data-slot="command-input-wrapper" class="flex h-12 items-center gap-2 border-b px-4">
          <SearchIcon class="size-4 shrink-0 opacity-50" aria-hidden="true" />
          <ListboxFilter
            v-model="query" auto-focus :placeholder="t('basics.palette.placeholder')" :aria-label="t('basics.palette.title')"
            class="flex h-11 w-full rounded-md bg-transparent text-base outline-hidden placeholder:text-muted-foreground md:text-sm" @keydown.enter="onEnter"
          />
        </div>
        <CommandList class="max-h-[60dvh] p-1.5">
          <CommandGroup v-if="!searching && recents.length" :heading="t('basics.palette.recent')">
            <CommandItem v-for="item in recents" :key="item.value" :value="item.value" class="min-h-10 rounded-md data-[highlighted]:bg-muted data-[highlighted]:text-foreground" @select="pick(item, $event)">
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ item.area }}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup v-if="!searching" :heading="t('basics.palette.actions')">
            <CommandItem v-for="item in actions" :key="item.value" :value="item.value" class="min-h-10 rounded-md data-[highlighted]:bg-muted data-[highlighted]:text-foreground" @select="pick(item, $event)">{{ item.label }}</CommandItem>
          </CommandGroup>
          <CommandGroup v-if="entries.length" :heading="t('basics.palette.entries')">
            <CommandItem v-for="item in entries" :key="item.value" :value="item.value" class="min-h-10 rounded-md data-[highlighted]:bg-muted data-[highlighted]:text-foreground" @select="pick(item, $event)">
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ item.area }}</span>
              <Badge variant="soft">{{ item.state }}</Badge>
            </CommandItem>
          </CommandGroup>
          <CommandGroup v-if="areas.length" :heading="t('basics.palette.areas')">
            <CommandItem v-for="item in areas" :key="item.value" :value="item.value" class="min-h-10 rounded-md data-[highlighted]:bg-muted data-[highlighted]:text-foreground" @select="pick(item, $event)">{{ item.label }}</CommandItem>
          </CommandGroup>
          <p v-if="nothing" class="py-6 text-center text-sm" role="status">{{ t('basics.palette.empty', { query: asked }) }}</p>
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>
</template>
