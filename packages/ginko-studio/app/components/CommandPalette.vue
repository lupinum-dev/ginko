<!-- ⌘K / Ctrl+K on every site page (UI.md 10.6). Empty: the last entries opened, then actions. Typing: search.studio
     (entries by title in all languages, areas by label or by a field's label, which then shows next to the area), and the
     person's other sites by name or address. Enter opens, ⌘/Ctrl+Enter opens in a new tab. The server decides what
     matches, so the Command's own client-side filter is not used (the filter field is a plain ListboxFilter). Each result
     carries an icon for its kind (entry, area, action, site); the footer names the keys on screens with a keyboard. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { navigateTo, useConvexQuery, useI18n } from '#imports'
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { ListboxFilter } from 'reka-ui'
import { CircleCheckIcon, FileTextIcon, FolderIcon, GlobeIcon, HistoryIcon, ImageIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from '@lucide/vue'
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
interface Item { value: string; label: string; icon: Component; area?: string; state?: string; detail?: string; run: () => void }

const actions = computed<Item[]>(() => [
  ...creatableBricks(props.schema ?? ({ bricks: {} } as Schema), props.role, props.grants).map(([key, brick]) => ({
    value: `new:${key}`, icon: PlusIcon, label: t('basics.palette.newIn', { area: shownLabel(brick.label, main.value) }), run: () => go(site(`/all/${key}/new`)),
  })),
  { value: 'files', icon: ImageIcon, label: t('nav.files'), run: () => go(site('/files')) },
  { value: 'history', icon: HistoryIcon, label: t('nav.history'), run: () => go(site('/history')) },
  // Removed entries of every area; the page itself says what the person may restore.
  { value: 'trash', icon: Trash2Icon, label: t('basics.removed.link'), run: () => go(site('/all?removed')) },
  ...(manager.value ? [
    { value: 'review', icon: CircleCheckIcon, label: t('basics.palette.review'), run: () => go(site('/review')) },
    { value: 'update', icon: RefreshCwIcon, label: t('basics.update.menu'), run: () => emit('update') },
  ] : []),
])
const recents = computed<Item[]>(() => recent.value.map((r) => ({ value: `recent:${r.to}`, icon: FileTextIcon, label: r.label, area: r.area, run: () => go(r.to) })))
/** An area's label in the Studio language; the server words labels in the site's main language. */
const areaLabel = (brick: string, fallback: string) => {
  const def = props.schema?.bricks[brick]
  return def ? shownLabel(def.label, main.value) : fallback
}
const entries = computed<Item[]>(() => (searching.value && !failed.value ? data.value?.entries ?? [] : []).map((e) => ({
  value: `entry:${e.entry}`, icon: FileTextIcon, label: e.label, area: areaLabel(e.brick, e.brickLabel),
  // Most results are online: only a draft says what it is, so the word stands out where it matters.
  state: e.state === 'draft' ? t('entry.status.draft') : undefined,
  run: () => go(entryPath(props.slug, props.schema, e.brick, e.entry)),
})))
/** The field an area was found by ("Telefon" in "Adresse und Kontakt"), in the Studio language. */
const fieldLabel = (brick: string, field: string) => {
  const def = props.schema?.bricks[brick]?.fields[field]
  return def ? shownLabel(def.label, main.value) : undefined
}
const areas = computed<Item[]>(() => (searching.value && !failed.value ? data.value?.bricks ?? [] : []).map((b) => ({
  value: `area:${b.brick}`, icon: FolderIcon, label: areaLabel(b.brick, b.label), detail: 'field' in b && b.field ? fieldLabel(b.brick, b.field) : undefined, run: () => go(site(`/all/${b.brick}`)),
})))
// Switching sites (an agency has dozens): the person's other sites, asked only while the palette is open, matched here.
// A site being deleted opens on its deletion page, so it says so, as in "Meine Seiten".
const { data: mySites } = useConvexQuery(api.sites.mine, () => (props.open ? {} : 'skip'))
const sites = computed<Item[]>(() => (searching.value ? mySites.value ?? [] : [])
  .filter((s) => s.slug !== props.slug && siteMatches(s, query.value))
  .toSorted(bySiteName(locale.value))
  .map((s) => ({
    value: `site:${s.slug}`, icon: GlobeIcon, label: s.name, area: s.deleting ? `${siteHost(s.url)} · ${t('sites.deleting')}` : siteHost(s.url), run: () => go(`/s/${s.slug}`),
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

// The footer's new-tab key, read from the device as the layout does for ⌘K (the server renders the Apple glyph).
const apple = ref(true)
onMounted(() => { apple.value = /Mac|iPhone|iPad/.test(navigator.platform) })
const item = 'min-h-10 gap-3 rounded-lg px-2.5 data-[highlighted]:bg-muted data-[highlighted]:text-foreground'
// Rows with a second part (area, host, field): side by side from 640px, on phones the second part goes under the label
// so neither is cut to a few letters. The spans stay direct children of the option (its text is label, then the rest).
const twoPart = `${item} max-sm:grid max-sm:grid-cols-[1rem_minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-0 max-sm:py-2 max-sm:[&>svg]:row-span-2`
const second = 'shrink-0 truncate text-[13px] text-muted-foreground sm:max-w-[45%] max-sm:col-start-2 max-sm:row-start-2'
const kbd = 'inline-grid h-5 min-w-5 place-items-center rounded border bg-muted px-1 font-sans text-[11px] text-foreground'
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="top-[max(1rem,12vh)] translate-y-0 gap-0 overflow-hidden rounded-xl bg-popover p-0 shadow-xl sm:max-w-[640px]" :show-close-button="false">
      <DialogHeader class="sr-only">
        <DialogTitle>{{ t('basics.palette.title') }}</DialogTitle>
        <DialogDescription>{{ t('basics.palette.description') }}</DialogDescription>
      </DialogHeader>
      <Command @highlight="highlighted = $event?.ref">
        <!-- The field is always focused while the palette is open, so it draws no ring of its own: the caret and the row
             are the focus. A second ring (the field's, inside the dialog's) only boxed the text in. -->
        <div data-slot="command-input-wrapper" class="flex h-13 items-center gap-3 border-b px-4">
          <SearchIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <ListboxFilter
            v-model="query" auto-focus :placeholder="t('basics.palette.placeholder')" :aria-label="t('basics.palette.title')"
            :aria-activedescendant="highlighted?.isConnected ? highlighted.id : undefined"
            class="flex h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground focus-visible:outline-none sm:text-[15px]" @keydown.enter="onEnter"
          />
        </div>
        <CommandList class="max-h-[min(60dvh,30rem)] p-1.5" :aria-label="t('basics.palette.title')">
          <CommandGroup v-if="!searching && recents.length" :heading="t('basics.palette.recent')">
            <CommandItem v-for="i in recents" :key="i.value" :value="i.value" :class="twoPart" @select="pick(i, $event)">
              <component :is="i.icon" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ i.label }}</span>
              <span :class="second">{{ i.area }}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup v-if="!searching" :heading="t('basics.palette.actions')">
            <CommandItem v-for="i in actions" :key="i.value" :value="i.value" :class="item" @select="pick(i, $event)">
              <component :is="i.icon" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ i.label }}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup v-if="entries.length" :heading="t('basics.palette.entries')">
            <CommandItem v-for="i in entries" :key="i.value" :value="i.value" :class="twoPart" @select="pick(i, $event)">
              <component :is="i.icon" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ i.label }}</span>
              <span :class="second">{{ i.area }}</span>
              <Badge v-if="i.state" variant="soft" class="max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1">{{ i.state }}</Badge>
            </CommandItem>
          </CommandGroup>
          <CommandGroup v-if="areas.length" :heading="t('basics.palette.areas')">
            <CommandItem v-for="i in areas" :key="i.value" :value="i.value" :class="twoPart" @select="pick(i, $event)">
              <component :is="i.icon" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ i.label }}</span>
              <span v-if="i.detail" :class="second">{{ i.detail }}</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup v-if="sites.length" :heading="t('basics.palette.sites')">
            <CommandItem v-for="i in sites" :key="i.value" :value="i.value" :class="twoPart" @select="pick(i, $event)">
              <component :is="i.icon" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ i.label }}</span>
              <span :class="second">{{ i.area }}</span>
            </CommandItem>
          </CommandGroup>
          <p v-if="nothing" class="px-4 py-8 text-center text-sm text-muted-foreground" role="status">{{ t('basics.palette.empty', { query: asked }) }}</p>
          <p v-if="failed" class="px-4 py-8 text-center text-sm" role="status">
            {{ t('basics.palette.failed') }} <Button type="button" variant="link" class="h-9 px-1 pointer-coarse:h-11" @click="retry">{{ t('basics.retry') }}</Button>
          </p>
        </CommandList>
        <!-- Phones have no keys to hint at. -->
        <div class="hidden items-center gap-5 border-t bg-sidebar px-4 py-2.5 text-xs text-muted-foreground sm:flex" aria-hidden="true">
          <span class="flex items-center gap-1.5"><kbd :class="kbd">↵</kbd>{{ t('basics.palette.keyOpen') }}</span>
          <span class="flex items-center gap-1.5"><kbd :class="kbd">{{ apple ? '⌘' : 'Ctrl' }}</kbd><kbd :class="kbd">↵</kbd>{{ t('basics.palette.keyNewTab') }}</span>
          <span class="ml-auto flex items-center gap-1.5"><kbd :class="kbd">Esc</kbd>{{ t('ui.close') }}</span>
        </div>
      </Command>
    </DialogContent>
  </Dialog>
</template>
