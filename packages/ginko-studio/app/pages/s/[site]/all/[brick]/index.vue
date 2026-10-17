<!-- One area: a single's form, or a collection's entries (with order and the removed ones). -->
<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import { api } from '#convex/api'
import { visibleUntil } from '@lupinum/ginko/internal'
import { formatDay, languageName, relevantDate } from '../../../../../utils/content'
import type { ListSort } from '../../../../../components/SavedViews.vue'
import { whenText } from '../../../../../utils/when'
import { opErrorOf } from '../../../../../composables/useOps'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'

definePageMeta({ layout: 'site' })
const route = useRoute()
const s = await useSiteData()
const { editable, tasksFor } = allAccess(s)
const key = computed(() => String(route.params.brick))
const brick = computed(() => s.schema.value?.bricks[key.value])
const access = computed(() => (brick.value ? tasksFor(key.value, brick.value) : undefined))
const allowed = computed(() => editable.value.some(([k]) => k === key.value))
const { shown } = useStudioSite()
const { t, format, locale: uiLocale } = useI18n()
useHead(() => ({ title: t('site.title.area', { area: brick.value ? shown(brick.value.label) : t('site.fallback.area') }) }))

// Search and sort of the list (UI.md 10.6) run on the server (entries.list), which sends the first `limit` rows.
// Entries match by text in every language. The search box asks once typing pauses.
const PAGE = 50
const search = ref('')
const asked = ref('')
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (text) => {
  clearTimeout(typing)
  typing = setTimeout(() => { asked.value = text.trim() }, 250)
})
onBeforeUnmount(() => clearTimeout(typing))
const sort = ref<ListSort | undefined>()
const narrowed = computed(() => !!search.value.trim() || !!sort.value)
const limit = ref(PAGE)
watch([key, asked, sort], () => { limit.value = PAGE })
const list = useConvexQuery(api.entries.list, () => (brick.value?.kind === 'collection' && allowed.value
  ? { site: s.slug.value, brick: key.value, ...(asked.value ? { search: asked.value } : {}), ...(sort.value ? { sort: sort.value } : {}), limit: limit.value, language: uiLocale.value }
  : 'skip'), { keepPreviousData: true })
// While a new answer loads (another search, more rows), the last one stays on screen, dimmed. Nuxt keys the page
// by its path, so each area has its own list and never shows another area's last answer. When the new answer
// fails, the last one also stays (better-convex marks it stale): the page says why and does not dim it as loading.
// `list.isStale` (the shown page is not the answer to the current arguments) guards the search box and the empty
// state; `loading` (an answer is on its way) only drives the dimming and aria-busy.
const page = computed(() => list.data.value)
const rows = computed(() => page.value?.rows ?? [])
const total = computed(() => page.value?.total ?? 0)
const loading = computed(() => list.isStale.value && !list.error.value)
type Row = (typeof rows.value)[number]

const single = useConvexQuery(api.entries.single, () => (brick.value?.kind === 'single' && allowed.value ? { site: s.slug.value, brick: key.value } : 'skip'))
const manual = computed(() => brick.value?.kind === 'collection' && brick.value.order === 'manual')
const canCreate = computed(() => !!access.value && (access.value.all || !!access.value.create))

const rowTitle = (row: Row) => row.title ?? (brick.value ? shown(brick.value.label) : '')

/** "Draft" / "Online from …" for drafts; "expired on …" / "ended" (daterange) / "" for an entry of a timed collection. */
function status(row: Row): string {
  const b = brick.value
  // A draft is not on the website, whatever its dates say (SPEC 15).
  if (row.state === 'draft') return row.publishAt ? t('site.status.onlineFrom', { when: whenText(row.publishAt, s.schema.value?.timeZone ?? 'Europe/Vienna', format) }) : t('site.status.draft')
  if (!b || b.kind !== 'collection' || !b.visible || b.visible.mode === 'always') return ''
  const until = visibleUntil(b, row.dates)
  if (until === undefined || until >= s.today.value) return ''
  return b.fields[b.visible.field]?.type === 'daterange' ? t('site.status.ended') : t('site.status.expired', { date: formatDay(until, format) })
}

const moving = ref(false)
async function move(row: Row, by: -1 | 1) {
  moving.value = true
  try {
    await ops.moveEntry(row._id, by < 0 ? 'up' : 'down')
  } finally {
    moving.value = false
  }
}

const { data: removed, error: removedError } = useConvexQuery(api.entries.removed, () => (brick.value?.kind === 'collection' && access.value && (access.value.all || access.value.remove) ? { site: s.slug.value, brick: key.value } : 'skip'))
// One alert above both lists: a failed "Entfernt" keeps its last answer (an entry restored meanwhile still shows), so
// the page says it is out of date. The next write in this area runs both queries again.
const loadError = computed(() => list.error.value ?? removedError.value)
const ops = useOps(s.slug)
</script>

<template>
  <AllShell :slug="s.slug.value" :bricks="editable" :current="key" :back="{ to: `/s/${s.slug.value}/all`, label: t('site.all.allAreas') }">
    <p v-if="!brick" class="text-destructive">{{ t('site.area.missing') }}</p>
    <p v-else-if="!editable.some(([k]) => k === key)" class="text-muted-foreground">{{ t('site.area.noAccess') }}</p>
    <template v-else-if="brick.kind === 'single'">
      <EntryEditor
        v-if="single.data.value && s.site.value && s.schema.value"
        :site="s.site.value" :schema="s.schema.value" :brick-key="key" :brick="brick" :entry="single.data.value"
        :tasks="access?.all ? undefined : access" :can-remove="false"
      />
    </template>
    <template v-else>
      <header class="mb-4 flex items-center justify-between gap-3">
        <h1 class="text-xl font-semibold tracking-tight">{{ shownLabel(brick.label, s.main.value) }}</h1>
        <Button v-if="canCreate" as-child><NuxtLink :to="`/s/${s.slug.value}/all/${key}/new`"><PlusIcon aria-hidden="true" />{{ t('site.all.new') }}</NuxtLink></Button>
      </header>
      <!-- While the shown page is not the answer to the current arguments (loading, or that answer failed), it can be an
           empty search: the box stays (it may hold the focus) and no empty state shows. -->
      <SavedViews v-if="total || asked || search || (page && list.isStale.value)" v-model:search="search" v-model:sort="sort" :slug="s.slug.value" :brick-key="key" :brick="brick" />
      <p class="sr-only" aria-live="polite">{{ loading && asked ? t('site.all.searching') : '' }}</p>
      <p v-if="loadError" class="font-semibold text-destructive" role="alert">{{ opErrorOf(loadError, t('basics.loadFailed')).message }}</p>
      <p v-if="!page || (!total && list.isStale.value)" v-show="!list.error.value" class="text-muted-foreground" role="status">{{ t('entry.loading') }}</p>
      <p v-else-if="!total && !asked" class="text-muted-foreground">{{ t('site.all.noEntries') }}</p>
      <p v-else-if="!total" class="text-muted-foreground">{{ t('basics.views.noMatch') }}</p>
      <template v-else>
        <ol class="m-0 list-none overflow-hidden rounded-xl border bg-card p-0 transition-opacity aria-busy:opacity-60" :aria-busy="loading || undefined">
          <li v-for="(e, i) in rows" :key="e._id" class="group/row flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0 sm:flex-nowrap" :data-dim="!!status(e) || undefined">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/s/${s.slug.value}/all/${key}/${e._id}`" class="line-clamp-2 font-medium text-foreground no-underline group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground hover:underline">{{ rowTitle(e) }}</NuxtLink>
              <span v-if="relevantDate(brick, e.dates, { t, format })" class="block text-[13px] text-muted-foreground tabular-nums">{{ relevantDate(brick, e.dates, { t, format }) }}</span>
            </div>
            <!-- Phones: badges move under the title so the name keeps the full width. -->
            <div class="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:basis-full sm:justify-end">
              <Badge v-if="status(e)" variant="soft">{{ status(e) }}</Badge>
              <TranslationBadges
                v-for="g in e.gaps" :key="g.locale" :locale="g.locale" :missing="g.missing" :outdated="g.outdated"
                :to="`/s/${s.slug.value}/all/${key}/${e._id}?lang=${g.locale}`" :label="t('basics.translation.open', { title: rowTitle(e), language: languageName(g.locale, uiLocale) })"
              />
            </div>
            <span v-if="manual && s.isManager.value && !narrowed" class="-my-1 -mr-2 flex">
              <Button type="button" variant="ghost" size="icon" :disabled="i === 0 || moving" :aria-label="t('site.all.moveUp', { title: rowTitle(e) })" @click="move(e, -1)">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" /></svg>
              </Button>
              <Button type="button" variant="ghost" size="icon" :disabled="i === total - 1 || moving" :aria-label="t('site.all.moveDown', { title: rowTitle(e) })" @click="move(e, 1)">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" /></svg>
              </Button>
            </span>
          </li>
        </ol>
        <div v-if="total > rows.length" class="mt-3 flex flex-wrap items-center gap-3">
          <!-- After a failed answer the same limit would ask again with the same arguments and do nothing; the alert says why. -->
          <Button type="button" variant="outline" :disabled="loading || !!list.error.value" @click="limit = rows.length + PAGE">{{ t('site.all.showMore', { count: Math.min(PAGE, total - rows.length) }) }}</Button>
          <p class="text-sm text-muted-foreground">{{ t('site.all.shownOf', { shown: rows.length, total }) }}</p>
        </div>
      </template>
      <section v-if="removed?.length" class="mt-8" aria-labelledby="removed-title">
        <h2 id="removed-title" class="mb-2 text-[15px] font-semibold text-muted-foreground">{{ t('site.all.removed') }}</h2>
        <ul class="m-0 grid list-none gap-1.5 p-0">
          <li v-for="e in removed" :key="e._id" class="flex items-center justify-between gap-3 rounded-md border border-dashed py-1.5 pr-2 pl-3.5 text-muted-foreground">
            <span>{{ e.title ?? shown(brick.label) }}</span>
            <Button type="button" variant="outline" size="sm" @click="ops.restoreEntry(e._id, e.lifeRev, access?.all ? undefined : access?.remove)">{{ t('site.all.restore') }}</Button>
          </li>
        </ul>
      </section>
    </template>
  </AllShell>
</template>
