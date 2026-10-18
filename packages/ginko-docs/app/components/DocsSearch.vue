<script setup lang="ts">
// Search over /__ginko/search/<locale>.json (built at build time), loaded when the dialog first opens.
// Hits are grouped by page: the page itself first, then its sections. Arrow keys move, Enter opens.
import type { SearchHit, SearchIndex, SearchIndexJson } from '@lupinum/ginko/search'

// `shortcut` (default true): `/` and Ctrl/⌘ K open this search. A second trigger on the same page sets it to false.
const { shortcut = true } = defineProps<{ shortcut?: boolean }>()
const { t, locale } = useI18n()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const input = useTemplateRef<HTMLInputElement>('input')
const query = ref('')
const active = ref(0)
// The engine is imported on first open, so MiniSearch stays out of the page's entry chunk.
const engine = shallowRef<{ index: SearchIndex; search: typeof import('@lupinum/ginko/search').search }>()
const mac = ref(true)

async function open() {
  dialog.value?.showModal()
  input.value?.select()
  if (engine.value) return
  try {
    const { loadIndex, search } = await import('@lupinum/ginko/search')
    const url: string = `/__ginko/search/${locale.value}.json` // a plain string: the typed route union is too deep to compare
    engine.value = { index: await loadIndex(await $fetch<SearchIndexJson>(url)), search }
  } catch { /* no index: the dialog shows "no results" */ }
}
watch(locale, () => { engine.value = undefined })

const hits = computed<SearchHit[]>(() => {
  const q = query.value.trim()
  return q && engine.value ? engine.value.search(engine.value.index, q, { limit: 12 }) : []
})
// One group per page, in the order of its best hit; the page hit (no heading) leads its group and its sections
// are indented under it. Pages then sit under their area (Docs, Blog, Changelog), again in the order of the best
// hit; the area labels show only when hits come from more than one area.
const AREAS = { docs: 'docs.docs', blog: 'docs.blog', changelog: 'docs.changelog' } as const
function areaOf(url: string): keyof typeof AREAS | undefined {
  const local = url.startsWith(`/${locale.value}/`) ? url.slice(locale.value.length + 1) : url
  const first = local.split(/[/#?]/)[1] ?? ''
  return Object.hasOwn(AREAS, first) ? (first as keyof typeof AREAS) : undefined
}
const groups = computed(() => {
  const byPage = new Map<string, SearchHit[]>()
  for (const hit of hits.value) {
    const page = hit.url.split('#')[0]!
    byPage.set(page, [...(byPage.get(page) ?? []), hit])
  }
  const byArea = new Map<string, { label?: string; rows: { hit: SearchHit; indent: boolean }[] }>()
  for (const list of byPage.values()) {
    const area = areaOf(list[0]!.url)
    const group = byArea.get(area ?? '') ?? { label: area ? t(AREAS[area]) : undefined, rows: [] }
    byArea.set(area ?? '', group)
    const hasPage = list.some((h) => !h.heading)
    group.rows.push(...list.sort((a, b) => Number(!!a.heading) - Number(!!b.heading)).map((hit) => ({ hit, indent: hasPage && !!hit.heading })))
  }
  const list = [...byArea.values()]
  return list.length > 1 ? list : list.map((g) => ({ ...g, label: undefined }))
})
const flat = computed(() => groups.value.flatMap((g) => g.rows))
const indexOf = (hit: SearchHit) => flat.value.findIndex((r) => r.hit.id === hit.id)
watch(query, () => { active.value = 0 })

function move(step: number) {
  if (!flat.value.length) return
  active.value = (active.value + step + flat.value.length) % flat.value.length
  nextTick(() => document.getElementById(`docs-hit-${active.value}`)?.scrollIntoView({ block: 'nearest' }))
}
function go() {
  const row = flat.value[active.value]
  if (row) navigateTo(row.hit.url)
}

const route = useRoute()
watch(() => route.fullPath, () => dialog.value?.close())
function onKey(e: KeyboardEvent) {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable
  if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault()
    open()
  }
}
onMounted(() => {
  mac.value = /Mac|iPhone|iPad/.test(navigator.platform)
  if (shortcut) window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <button type="button" class="docs-search-trigger" :aria-label="t('docs.search')" @click="open">
    <DocsIcon name="lucide:search" class="docs-icon" />
    <span class="docs-search-label">{{ t('docs.searchPlaceholder') }}</span>
    <kbd class="docs-kbd">{{ mac ? '⌘' : 'Ctrl' }} K</kbd>
  </button>
  <Teleport to="body">
    <dialog ref="dialog" class="docs-search-dialog" :aria-label="t('docs.search')" @click.self="dialog?.close()">
      <div class="docs-search-field">
        <DocsIcon name="lucide:search" class="docs-icon" />
        <input
          ref="input" v-model="query" type="search" role="combobox" aria-autocomplete="list" aria-controls="docs-search-list"
          :aria-expanded="flat.length > 0" :aria-activedescendant="flat.length ? `docs-hit-${active}` : undefined"
          :placeholder="t('docs.searchPlaceholder')" :aria-label="t('docs.searchPlaceholder')" autocomplete="off" spellcheck="false"
          @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="go" @keydown.esc.prevent="dialog?.close()"
        >
        <button type="button" class="docs-kbd" @click="dialog?.close()">Esc</button>
      </div>
      <div class="docs-search-body" tabindex="0" role="region" :aria-label="t('docs.searchResults')">
        <ul v-if="flat.length" id="docs-search-list" class="docs-search-results" role="listbox" :aria-label="t('docs.search')">
          <li v-for="(g, n) in groups" :key="n" role="none">
            <p v-if="g.label" :id="`docs-hit-group-${n}`" class="docs-search-group">{{ g.label }}</p>
            <ul role="group" :aria-labelledby="g.label ? `docs-hit-group-${n}` : undefined">
              <li
                v-for="{ hit, indent } in g.rows" :id="`docs-hit-${indexOf(hit)}`" :key="hit.id" role="option" :aria-selected="indexOf(hit) === active"
                class="docs-search-hit" :class="{ 'is-section': indent }" @mousemove="active = indexOf(hit)" @click="active = indexOf(hit); go()"
              >
                <span class="docs-search-tile"><DocsIcon :name="hit.heading ? 'lucide:hash' : 'lucide:file-text'" class="docs-icon" /></span>
                <span class="docs-search-text">
                  <strong>{{ hit.heading ?? hit.title }}</strong>
                  <span>{{ indent ? hit.excerpt : hit.heading ? hit.title : hit.excerpt }}</span>
                </span>
                <DocsIcon name="lucide:corner-down-left" class="docs-icon docs-search-enter" />
              </li>
            </ul>
          </li>
        </ul>
        <p v-else-if="query.trim()" class="docs-search-empty">{{ t('docs.noResults', { query: query.trim() }) }}</p>
        <p v-else class="docs-search-empty">{{ t('docs.searchHint') }}</p>
      </div>
      <div class="docs-search-foot" aria-hidden="true">
        <span><kbd class="docs-kbd">↑</kbd><kbd class="docs-kbd">↓</kbd> {{ t('docs.searchMove') }}</span>
        <span><kbd class="docs-kbd">↵</kbd> {{ t('docs.searchOpen') }}</span>
        <span><kbd class="docs-kbd">Esc</kbd> {{ t('docs.close') }}</span>
      </div>
    </dialog>
  </Teleport>
</template>
