<!-- ⌘K / Ctrl+K on every site page (UI.md 10.6). Empty: the last entries opened, then actions. Typing: search.studio
     (entries by title in all languages, areas by label), and the person's other sites by name or address. Enter opens,
     ⌘/Ctrl+Enter opens in a new tab. The server decides what matches, so the Command's own client-side filter is not
     used (the filter field is a plain ListboxFilter). -->
<script setup lang="ts">
import { api } from '#convex/api'
import { navigateTo, useConvexQuery, useI18n } from '#imports'
import { computed, nextTick, ref, watch } from 'vue'
import { ListboxFilter } from 'reka-ui'
import { SearchIcon } from '@lucide/vue'
import type { Schema } from '@lupinum/ginko/internal'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '@studio/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { readRecent, type RecentEntry } from '../composables/useRecentEntries'
import { creatableBricks, entryPath } from '../utils/basics'
import { shownLabel } from '../utils/labels'
import { bySiteName, siteHost, siteMatches } from '../utils/sites'

const props = defineProps<{ open: boolean; slug: string; schema: Schema | undefined; role: string | undefined; grants: readonly string[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; update: [] }>()
const { t, locale } = useI18n()

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

// While the next search loads, the last results stay on screen.
const { data, isStale, error } = useConvexQuery(api.search.studio, () => (props.open && asked.value ? { site: props.slug, query: asked.value } : 'skip'), { keepPreviousData: true })
const searching = computed(() => !!query.value.trim())
// A failed search keeps the last answer, which belongs to another word: it is hidden, and the palette says so.
const failed = computed(() => searching.value && !!asked.value && !!error.value)
const nothing = computed(() => !failed.value && !!asked.value && !isStale.value && !!data.value && !data.value.entries.length && !data.value.bricks.length && !sites.value.length)
/**
 * Asks again with the same word: dropping the subscription for a tick and taking it up again makes Convex run the query
 * anew, because the palette is its only subscriber with these arguments. No reload: the page under the palette may hold
 * unsaved input. A different word asks again by itself.
 */
async function retry() {
  const text = asked.value
  asked.value = ''
  await nextTick()
  asked.value = text
}

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
const entries = computed<Item[]>(() => (searching.value && !failed.value ? data.value?.entries ?? [] : []).map((e) => ({
  value: `entry:${e.entry}`, label: e.label, area: areaLabel(e.brick, e.brickLabel), state: e.state === 'draft' ? t('entry.status.draft') : t('entry.status.online'),
  run: () => go(entryPath(props.slug, props.schema, e.brick, e.entry)),
})))
const areas = computed<Item[]>(() => (searching.value && !failed.value ? data.value?.bricks ?? [] : []).map((b) => ({ value: `area:${b.brick}`, label: areaLabel(b.brick, b.label), run: () => go(site(`/all/${b.brick}`)) })))
// Switching sites (an agency has dozens): the person's other sites, asked only while the palette is open, matched here.
// A site being deleted opens on its deletion page, so it says so, as in "Meine Seiten".
const { data: mySites } = useConvexQuery(api.sites.mine, () => (props.open ? {} : 'skip'))
const sites = computed<Item[]>(() => (searching.value ? mySites.value ?? [] : [])
  .filter((s) => s.slug !== props.slug && siteMatches(s, query.value))
  .toSorted(bySiteName(locale.value))
  .map((s) => ({
    value: `site:${s.slug}`, label: s.name, area: s.deleting ? `${siteHost(s.url)} · ${t('sites.deleting')}` : siteHost(s.url), run: () => go(`/s/${s.slug}`),
  })))

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
// After a failed search Enter opens nothing: the word may have been meant for an entry, not a site whose name matches.
const highlighted = ref<HTMLElement>()
function onEnter(event: KeyboardEvent) {
  if (highlighted.value?.isConnected) return
  const first = searching.value && !failed.value ? (entries.value[0] ?? areas.value[0] ?? sites.value[0]) : undefined
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
            :aria-activedescendant="highlighted?.isConnected ? highlighted.id : undefined"
            class="flex h-11 w-full rounded-md bg-transparent text-base outline-hidden placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/80 md:text-sm" @keydown.enter="onEnter"
          />
        </div>
        <CommandList class="max-h-[60dvh] p-1.5" :aria-label="t('basics.palette.title')">
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
          <CommandGroup v-if="sites.length" :heading="t('basics.palette.sites')">
            <CommandItem v-for="item in sites" :key="item.value" :value="item.value" class="min-h-10 rounded-md data-[highlighted]:bg-muted data-[highlighted]:text-foreground" @select="pick(item, $event)">
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ item.area }}</span>
            </CommandItem>
          </CommandGroup>
          <p v-if="nothing" class="py-6 text-center text-sm" role="status">{{ t('basics.palette.empty', { query: asked }) }}</p>
          <p v-if="failed" class="py-6 text-center text-sm" role="status">
            {{ t('basics.palette.failed') }} <Button type="button" variant="link" class="h-9 px-1 pointer-coarse:h-11" @click="retry">{{ t('basics.retry') }}</Button>
          </p>
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>
</template>
