<!-- One area: a single's form, or a collection's entries (with order and the removed ones). -->
<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
import { api } from '#convex/api'
import type { CollectionBrick } from '@lupinum/ginko'
import { isVisible } from '@lupinum/ginko/internal'
import type { Entry } from '../../../../../composables/useSiteData'
import { languageName, relevantDate, searchable, titleOf } from '../../../../../utils/content'
import { haystackOf, sortRows } from '../../../../../utils/basics'
import type { ListSort } from '../../../../../components/SavedViews.vue'
import { whenText } from '../../../../../utils/when'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'

definePageMeta({ layout: 'site', convexAuth: true })
const route = useRoute()
const s = await useSiteData()
const { editable, tasksFor } = allAccess(s)
const key = computed(() => String(route.params.brick))
const brick = computed(() => s.schema.value?.bricks[key.value])
const access = computed(() => (brick.value ? tasksFor(key.value, brick.value) : undefined))
const { shown } = useStudioSite()
const { t, format, locale: uiLocale } = useI18n()
useHead(() => ({ title: t('site.title.area', { area: brick.value ? shown(brick.value.label) : t('site.fallback.area') }) }))

const entries = computed(() => s.entriesOf(key.value))
// Search and sort of the list (UI.md 10.6): in the browser, over the entries already loaded. Entries match by text in every language.
const search = ref('')
const sort = ref<ListSort | undefined>()
const narrowed = computed(() => !!search.value.trim() || !!sort.value)
const listed = computed(() => {
  const b = brick.value
  if (!b) return entries.value
  const words = searchable(search.value.trim()).split(/\s+/).filter(Boolean)
  const found = words.length ? entries.value.filter((e) => { const hay = haystackOf(b, e.data, s.schema.value?.locales ?? []); return words.every((w) => hay.includes(w)) }) : entries.value
  return sort.value ? sortRows(found, b, sort.value, s.main.value) : found
})
// Translation gaps per entry and language; a click opens the entry in that language.
const { data: translation } = useConvexQuery(api.sites.translationStatus, () => ({ site: s.slug.value }))
function gaps(entry: string) {
  const status = translation.value?.bricks.find((x) => x.brick === key.value)
  return (translation.value?.locales ?? []).map((locale) => {
    const hit = status?.locales[locale]?.entries.find((x) => x.entry === entry)
    return { locale, missing: hit?.missing.length ?? 0, outdated: hit?.outdated.length ?? 0 }
  })
}
const single = computed(() => (brick.value?.kind === 'single' ? s.single(key.value) : undefined))
const manual = computed(() => brick.value?.kind === 'collection' && brick.value.order === 'manual')
const canCreate = computed(() => !!access.value && (access.value.all || !!access.value.create))

/** "Draft" / "Online from …" for drafts; "expired" / "ended" (daterange) / "" for an entry of a timed collection. */
function status(entry: Entry): string {
  const b = brick.value
  // A draft is not on the website, whatever its dates say (SPEC 15).
  if (entry.state === 'draft') return entry.publishAt ? t('site.status.onlineFrom', { when: whenText(entry.publishAt, s.schema.value?.timeZone ?? 'Europe/Vienna', format) }) : t('site.status.draft')
  if (!b || b.kind !== 'collection' || !b.visible || b.visible.mode === 'always') return ''
  if (isVisible(b, entry.data, s.today.value)) return ''
  return b.fields[b.visible.field]?.type === 'daterange' ? t('site.status.ended') : t('site.status.expired')
}

const moving = ref(false)
async function move(index: number, by: -1 | 1) {
  const order = entries.value.map((e) => e._id)
  const [id] = order.splice(index, 1)
  order.splice(index + by, 0, id!)
  moving.value = true
  try {
    await ops.reorderEntries(key.value, order, s.site.value?.orderRevs[key.value] ?? 0)
  } finally {
    moving.value = false
  }
}

const { data: removed } = useConvexQuery(api.entries.removed, () => (brick.value?.kind === 'collection' && access.value && (access.value.all || access.value.remove) ? { site: s.slug.value, brick: key.value } : 'skip'))
const ops = useOps(s.slug)
</script>

<template>
  <AllShell :slug="s.slug.value" :bricks="editable" :current="key" :back="{ to: `/s/${s.slug.value}/all`, label: t('site.all.allAreas') }">
    <p v-if="!brick" class="text-destructive">{{ t('site.area.missing') }}</p>
    <p v-else-if="!editable.some(([k]) => k === key)" class="text-destructive">{{ t('site.area.noAccess') }}</p>
    <template v-else-if="brick.kind === 'single'">
      <EntryEditor
        v-if="single && s.site.value && s.schema.value"
        :site="s.site.value" :schema="s.schema.value" :brick-key="key" :brick="brick" :entry="single" :entries="s.entries.value"
        :tasks="access?.all ? undefined : access" :can-remove="false"
      />
    </template>
    <template v-else>
      <header class="mb-4 flex items-center justify-between gap-3">
        <h1 class="text-xl font-semibold tracking-tight">{{ shownLabel(brick.label, s.main.value) }}</h1>
        <Button v-if="canCreate" as-child><NuxtLink :to="`/s/${s.slug.value}/all/${key}/new`"><PlusIcon aria-hidden="true" />{{ t('site.all.new') }}</NuxtLink></Button>
      </header>
      <SavedViews v-if="entries.length" v-model:search="search" v-model:sort="sort" :slug="s.slug.value" :brick-key="key" :brick="brick" />
      <p v-if="!entries.length" class="text-muted-foreground">{{ t('site.all.noEntries') }}</p>
      <p v-else-if="!listed.length" class="text-muted-foreground">{{ t('basics.views.noMatch') }}</p>
      <ol v-else class="m-0 list-none overflow-hidden rounded-xl border bg-card p-0">
        <li v-for="(e, i) in listed" :key="e._id" class="group/row flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0 sm:flex-nowrap" :data-dim="!!status(e) || undefined">
          <div class="min-w-0 flex-1">
            <NuxtLink :to="`/s/${s.slug.value}/all/${key}/${e._id}`" class="line-clamp-2 font-medium text-foreground no-underline group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground hover:underline">{{ titleOf(brick, e.data, s.main.value) }}</NuxtLink>
            <span v-if="relevantDate(brick, e.data, { t, format })" class="block text-[13px] text-muted-foreground tabular-nums">{{ relevantDate(brick, e.data, { t, format }) }}</span>
          </div>
          <!-- Phones: badges move under the title so the name keeps the full width. -->
          <div class="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:basis-full sm:justify-end">
            <Badge v-if="status(e)" variant="soft">{{ status(e) }}</Badge>
            <TranslationBadges
              v-for="g in gaps(e._id)" :key="g.locale" :locale="g.locale" :missing="g.missing" :outdated="g.outdated"
              :to="`/s/${s.slug.value}/all/${key}/${e._id}?lang=${g.locale}`" :label="t('basics.translation.open', { title: titleOf(brick, e.data, s.main.value), language: languageName(g.locale, uiLocale) })"
            />
          </div>
          <span v-if="manual && s.isManager.value && !narrowed" class="-my-1 -mr-2 flex">
            <Button type="button" variant="ghost" size="icon" :disabled="i === 0 || moving" :aria-label="t('site.all.moveUp', { title: titleOf(brick, e.data, s.main.value) })" @click="move(i, -1)">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" /></svg>
            </Button>
            <Button type="button" variant="ghost" size="icon" :disabled="i === entries.length - 1 || moving" :aria-label="t('site.all.moveDown', { title: titleOf(brick, e.data, s.main.value) })" @click="move(i, 1)">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" /></svg>
            </Button>
          </span>
        </li>
      </ol>
      <section v-if="removed?.length" class="mt-8" aria-labelledby="removed-title">
        <h2 id="removed-title" class="mb-2 text-[15px] font-semibold text-muted-foreground">{{ t('site.all.removed') }}</h2>
        <ul class="m-0 grid list-none gap-1.5 p-0">
          <li v-for="e in removed" :key="e._id" class="flex items-center justify-between gap-3 rounded-md border border-dashed py-1.5 pr-2 pl-3.5 text-muted-foreground">
            <span>{{ titleOf(brick, e.data as never, s.main.value) }}</span>
            <Button type="button" variant="outline" size="sm" @click="ops.restoreEntry(e._id, e.lifeRev, access?.all ? undefined : access?.remove)">{{ t('site.all.restore') }}</Button>
          </li>
        </ul>
      </section>
    </template>
  </AllShell>
</template>
