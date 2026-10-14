<!-- Alles bearbeiten (UI.md 4): every field of one entry, the language switch with translation
     status, a sticky save bar, and the preview beside it on wide screens. Same engine as the tasks. -->
<script setup lang="ts">
import type { Brick, CollectionBrick, Field, Fields, Json, Label as LabelText, Locale } from '@lupinum/ginko'
import { defaultsFor, isShown, isTranslatable, ordered, printOf, urlsFor, type Schema } from '@lupinum/ginko/internal'
import type { Entry } from '../composables/useSiteData'
import { api } from '#convex/api'
import { displayValue, fileIdsIn, languageName, publishQuestion, titleOf } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { msToZoned, zonedToMs } from '../utils/when'
import { opErrorOf } from '../composables/useOps'
import { TRANSLATION } from '@lupinum/ginko-editor'
import { EllipsisIcon } from '@lucide/vue'
import WhyNotPublic from './WhyNotPublic.vue'
import { rememberEntry } from '../composables/useRecentEntries'
import EntryFields from './EntryFields.vue'
import { groupFields, type FieldGroup } from '../utils/groups'
import { useMediaQuery } from '@vueuse/core'
import { OWN_BOTTOM_BAR } from '../utils/siteLinks'
import { provideRefs } from './fields/refs'
import { Button } from '@studio/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@studio/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Badge } from '@studio/components/ui/badge'
import { Input } from '@studio/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { Label } from '@studio/components/ui/label'
import { Separator } from '@studio/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@studio/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@studio/components/ui/radio-group'

const props = defineProps<{
  site: { slug: string; url: string; previewOrigins: string[]; schemaRev: number; contentRev: number; name: string }
  schema: Schema
  brickKey: string
  brick: Brick
  /** None = a new entry of a collection. */
  entry?: Entry
  entries: Entry[]
  /** Staff work through tasks (SPEC 2.7): the task refs that allow saving, creating and removing here, and the fields the save task covers. Owners pass none. */
  tasks?: { save?: string; fields?: readonly string[]; create?: string; remove?: string }
  canRemove: boolean
  /**
   * Called after a removal. A prop, not an emit: the removed entry leaves the live list at once, which
   * unmounts this editor before the mutation returns, and an unmounted component's emits go nowhere.
   */
  onRemoved?: () => void
}>()
const emit = defineEmits<{ created: [entry: string] }>()
const { t, format, locale: uiLocale } = useI18n()

const main = computed(() => props.schema.locales[0]!)
// Ref fields list the entries of their target brick by title.
provideRefs(() => props.schema, () => props.entries, () => main.value)
// A link from a translation badge opens the entry in that language (?lang=en).
const wantedLocale = String(useRoute().query.lang ?? '')
const locale = ref<Locale>(props.schema.locales.includes(wantedLocale) ? wantedLocale : main.value)
const foreign = computed(() => locale.value !== main.value)

/** All live fields; a new entry has no slug yet; a foreign language shows only translatable ones. */
const fields = computed<Fields>(() => Object.fromEntries(ordered(props.brick.fields).filter(([key, f]) => {
  if (f.retired) return false
  if (!props.entry && f.type === 'slug') return false
  if (props.entry && props.tasks?.fields && !props.tasks.fields.includes(key)) return false
  if (foreign.value) return hasTranslation(f)
  return true
})))

/** A field with text to translate: translatable itself, an image (alt text), or a list with such columns (Astra phase 8). */
function hasTranslation(f: Field): boolean {
  if (f.type === 'list') return Object.values(f.of).some(hasTranslation)
  return (isTranslatable(f) && f.type !== 'slug') || f.type === 'image'
}

const form = useEntryForm({
  site: computed(() => props.site.slug),
  brickKey: () => props.brickKey,
  brick: () => props.brick,
  fields: () => fields.value,
  entry: () => props.entry,
  main: () => main.value,
  locale: () => locale.value,
  task: () => (props.entry ? props.tasks?.save : props.tasks?.create),
  removeTask: () => props.tasks?.remove,
  draft: () => props.entry?.state === 'draft',
  timeZone: () => props.schema.timeZone,
})
const { draft, baseline, issues, problem, conflict, busy, slow, waiting, dirty, confirm } = form

function start() {
  form.load(props.entry ? { ...props.entry.data } : defaultsFor(fields.value))
}
start()
// Another entry opened, or a language switch with nothing unsaved: start from the stored state.
watch(() => props.entry?._id, start)
watch(locale, () => { if (!dirty.value) start() })
/** Unsaved input blocks the switch. The reason shows when the person tries (a toast, so the layout stays put). */
function switchLanguage(next: Locale) {
  if (next === locale.value) return
  if (dirty.value) return useToast().show(t('entry.saveBeforeLanguage'), { tone: 'err' })
  locale.value = next
}

/**
 * The value at a leaf path: `name`, `image.alt`, or inside a list `days.<rowId>.dish` and
 * `images.<rowId>.image.alt` (the paths of the server's leavesOf and of the prints).
 */
function valueAt(data: Record<string, unknown> | undefined, path: string): unknown {
  const [root, ...rest] = path.split('.')
  let value: unknown = data?.[root!]
  if (rest.length && rest[0] !== 'alt') {
    const [rowId, column, ...tail] = rest
    const row = Array.isArray(value) ? value.find((r) => (r as { _id?: string })._id === rowId) : undefined
    value = (row as Record<string, unknown> | undefined)?.[column!]
    if (tail[0] === 'alt') value = (value as { alt?: unknown } | undefined)?.alt
  } else if (rest[0] === 'alt') {
    value = (value as { alt?: unknown } | undefined)?.alt
  }
  return value
}
const storedAt = (path: string) => valueAt(props.entry?.data, path)
const draftAt = (path: string) => valueAt(draft.value, path)

/** Translation state of one translatable leaf in the foreign language (top level or inside a list row). */
function translation(path: string): 'missing' | 'stale' | 'fine' | undefined {
  if (!foreign.value) return undefined
  const value = draftAt(path)
  const own = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[locale.value] : undefined
  if (own === undefined || own === '') return 'missing'
  if (confirm.value.includes(path)) return 'fine'
  const mainValue = (storedAt(path) as Record<string, unknown> | undefined)?.[main.value]
  const print = props.entry?.prints[path]?.[locale.value]
  return mainValue !== undefined && print !== printOf(mainValue) ? 'stale' : 'fine'
}
/** Whether the stored entry has missing or outdated texts in language `l` (a dot on the language switch). */
const { data: trStatus } = useConvexQuery(api.sites.translationStatus, () => (props.entry && props.schema.locales.length > 1 ? { site: props.site.slug } : 'skip'))
function gapIn(l: Locale) {
  if (!props.entry || l === main.value) return false
  const hit = trStatus.value?.bricks.find((b) => b.brick === props.brickKey)?.locales[l]?.entries.find((x) => x.entry === props.entry!._id)
  return !!hit && hit.missing.length + hit.outdated.length > 0
}
function confirmTranslation(path: string) {
  if (!confirm.value.includes(path)) confirm.value = [...confirm.value, path]
}

/** The main-language text shown above a translation (Markdown as written). */
function sourceText(path: string): string {
  const value = storedAt(path) as Record<string, unknown> | undefined
  const text = value?.[main.value]
  return typeof text === 'string' ? text.slice(0, 400) : ''
}

// A confirmed leaf whose row was removed meanwhile would make the save INVALID: drop it (Astra 11).
watch(draft, () => {
  const kept = confirm.value.filter((path) => draftAt(path) !== undefined)
  if (kept.length !== confirm.value.length) confirm.value = kept
}, { deep: true })

// Lists show the same state per cell (Phase 11: confirming translations inside lists).
provide(TRANSLATION, { state: translation, source: sourceText, confirm: confirmTranslation, mainName: () => languageName(main.value, uiLocale.value) })

const shown = (label: LabelText) => shownLabel(label, main.value)
const shownField = (key: string) => (props.brick.fields[key] ? shown(props.brick.fields[key]!.label) : key)
const title = computed(() => props.brick.kind === 'single' ? shown(props.brick.label) : props.entry ? titleOf(props.brick, props.entry.data, main.value) : t('entry.newEntry'))
const savedOnce = ref(false)
const formEl = ref<HTMLFormElement | null>(null)
// After a refused save, the first field with an error gets the focus (its message is read with it).
watch(issues, (list) => { if (list.length) nextTick(() => formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()) })

// Field groups (display only). Phones always show headings; tabs need room.
const grouped = computed(() => groupFields(fields.value))
const visibleGroups = computed(() => grouped.value.groups.filter((g) => g.fields.some(([, f]) => isShown(f, draft.value))))
const wide = useMediaQuery('(min-width: 768px)', { ssrWidth: 1024 })
const tabbed = computed(() => props.brick.layout === 'tabs' && wide.value)
const activeTab = ref('')
watch(visibleGroups, (list) => { if (!list.some((g) => g.id === activeTab.value)) activeTab.value = list[0]?.id ?? '' }, { immediate: true })
const groupHasIssue = (g: FieldGroup) => g.fields.some(([key]) => issues.value.some((i) => i.path === key || i.path.startsWith(`${key}.`)))
// A refused save shows the first tab that holds an error.
watch(issues, () => { const first = visibleGroups.value.find(groupHasIssue); if (tabbed.value && first) activeTab.value = first.id })
const setField = (key: string, value: Json | undefined) => form.setField(key, value)
const fieldProps = computed(() => ({ draft: draft.value, baseline: baseline.value, locale: locale.value, locales: props.schema.locales, issues: issues.value, route: props.brick.kind === 'collection' ? props.brick.route : undefined, weeks: props.brick.kind === 'collection' && props.brick.plans ? [props.brick.plans.field] : undefined }))

async function save() {
  // The save button is only aria-disabled (below), so a keyboard press still lands here.
  if (busy.value || (!dirty.value && props.entry)) return
  if (await form.save()) {
    if (!waiting.value) savedOnce.value = true
    if (form.created.value) emit('created', form.created.value)
  }
}

async function keepMine() {
  if (await form.keepMine() && !waiting.value) savedOnce.value = true
}

const ops = useOps(computed(() => props.site.slug))
const removing = ref(false)
async function remove() {
  if (!props.entry) return
  removing.value = true
  try {
    // A removal that went to approval leaves the entry where it is.
    if (await ops.removeEntry(props.entry._id, props.entry.lifeRev, props.tasks?.remove, title.value, props.entry.state === 'draft')) props.onRemoved?.()
  } finally {
    removing.value = false
    askRemove.value = false
  }
}
const askRemove = ref(false)

// More: a draft copy of this entry (UI.md 10.6). Copying belongs to the create right.
const canDuplicate = computed(() => !!props.entry && props.brick.kind === 'collection' && (!props.tasks || !!props.tasks.create))
const duplicateEntry = useConvexMutation(api.entries.duplicate)
const duplicating = ref(false)
async function duplicate() {
  if (!props.entry) return
  duplicating.value = true
  try {
    const result = await duplicateEntry.mutate({ site: props.site.slug, opId: crypto.randomUUID(), task: props.tasks?.create, entry: props.entry._id }) as { entry?: string; state?: string }
    // Without `entry` the copy waits for approval: nothing to open yet.
    if (!result.entry) return useToast().show(t('basics.duplicate.sent'))
    useToast().show(result.state === 'draft' ? t('basics.duplicate.done') : t('ops.created'))
    await navigateTo(`/s/${props.site.slug}/all/${props.brickKey}/${result.entry}`)
  } catch (error) {
    useToast().show(opErrorOf(error).message, { tone: 'err' })
  } finally {
    duplicating.value = false
  }
}
const whyOpen = ref(false)

// The command palette lists the last entries opened.
watch(() => props.entry?._id, () => {
  if (props.entry) rememberEntry(props.site.slug, { to: props.brick.kind === 'single' ? `/s/${props.site.slug}/all/${props.brickKey}` : `/s/${props.site.slug}/all/${props.brickKey}/${props.entry._id}`, label: titleOf(props.brick, props.entry.data, main.value), area: shownLabel(props.brick.label, main.value) })
}, { immediate: true })

// Drafts (SPEC 15): only collections that ask for them. A draft is saved without going online;
// "Veröffentlichen …" puts it online now or at a time; a live entry can be taken back to a draft.
const timeZone = computed(() => props.schema.timeZone)
const drafts = computed(() => props.brick.kind === 'collection' && props.brick.drafts === true)
const state = computed(() => props.entry?.state ?? 'live')
// A draft stays a draft when the collection later turns drafts off (SPEC 15), so it can still be published.
const isDraft = computed(() => (props.entry ? state.value === 'draft' : drafts.value))
const statusText = computed(() => {
  if (!props.entry || (!drafts.value && state.value === 'live')) return ''
  if (state.value === 'live') return t('entry.status.online')
  return props.entry.publishAt
    ? t('entry.status.onlineFrom', { when: format.date(props.entry.publishAt, { timeZone: timeZone.value, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
    : t('entry.status.draft')
})
/** Publishing belongs to the brick's create and edit tasks (staff need one of them). */
const publishTask = computed(() => props.tasks?.save ?? props.tasks?.create)

const publishing = ref(false)
const when = ref<'now' | 'later'>('now')
const at = ref('')
const publishError = ref('')
const publishBusy = ref(false)
const HOUR = 60 * 60 * 1000
const minAt = ref('')
const maxAt = ref('')
/** Shown only when the laptop is in another zone than the site, so 9:00 is not misread. */
const otherZone = ref(false)

function openPublish() {
  const now = Date.now()
  const scheduled = props.entry?.publishAt
  when.value = scheduled ? 'later' : 'now'
  // A suggestion for "Online ab": tomorrow 9:00 at the site, or the time already planned.
  at.value = scheduled ? msToZoned(scheduled, timeZone.value) : `${msToZoned(now + 24 * HOUR, timeZone.value).slice(0, 10)}T09:00`
  minAt.value = msToZoned(now, timeZone.value)
  maxAt.value = msToZoned(now + 365 * 24 * HOUR, timeZone.value)
  otherZone.value = Intl.DateTimeFormat().resolvedOptions().timeZone !== timeZone.value
  publishError.value = ''
  publishing.value = true
}

async function doPublish() {
  publishError.value = ''
  let ms: number | undefined
  if (when.value === 'later') {
    ms = zonedToMs(at.value, timeZone.value)
    if (ms === undefined || ms <= Date.now()) {
      publishError.value = t('entry.publish.futureTime')
      return
    }
  }
  publishBusy.value = true
  try {
    if (!props.entry) {
      // A new entry is created and published in one step.
      if (await form.save(undefined, ms === undefined ? {} : { at: ms })) {
        publishing.value = false
        if (!waiting.value) savedOnce.value = true
        if (form.created.value) emit('created', form.created.value)
      }
      return
    }
    // Unsaved input goes into the draft first; saving does not change lifeRev.
    if (dirty.value && !(await form.save())) return
    await ops.publishEntry(props.entry._id, props.entry.lifeRev, { at: ms, task: publishTask.value, timeZone: timeZone.value })
    publishing.value = false
  } catch (error) {
    publishError.value = opErrorOf(error).message
  } finally {
    publishBusy.value = false
  }
}

const askUnpublish = ref(false)
async function doUnpublish() {
  if (!props.entry) return
  publishBusy.value = true
  publishError.value = ''
  try {
    await ops.unpublishEntry(props.entry._id, props.entry.lifeRev, { task: publishTask.value, timeZone: timeZone.value, wasLive: state.value === 'live', at: props.entry.publishAt })
    askUnpublish.value = false
    publishing.value = false
  } catch (error) {
    publishError.value = opErrorOf(error).message
  } finally {
    publishBusy.value = false
  }
}

// Preview: the entry's own page when it has a route, else the site's first page in this language.
const previewPath = computed(() => {
  if (props.brick.kind === 'collection' && props.brick.route && props.entry) {
    const url = urlsFor(props.schema, props.brickKey, props.brick as CollectionBrick, { id: props.entry._id, data: props.entry.data as never }, () => undefined)[locale.value]
    if (url) return url
  }
  return Object.values(props.schema.pages)[0]?.[locale.value] ?? '/'
})
const showPreview = ref(false)

// The preview needs the URLs of every referenced photo and PDF, also of one uploaded just now.
const fileIds = computed(() => [...fileIdsIn([props.entries.map((e) => e.data), draft.value])].sort())
const { data: fileInfo } = useConvexQuery(api.uploads.urls, () => (showPreview.value && fileIds.value.length ? { site: props.site.slug, ids: fileIds.value } : 'skip'))
function files(id: string) {
  const f = fileInfo.value?.[id]
  return f ? { url: f.url, name: f.name, size: f.size, ...(f.width ? { width: f.width } : {}), ...(f.height ? { height: f.height } : {}) } : undefined
}

// The save bar sits at the bottom: the layout hides the phone tab bar while this editor is open.
const ownBottomBar = inject(OWN_BOTTOM_BAR, undefined)
onMounted(() => { if (ownBottomBar) ownBottomBar.value++ })
onBeforeUnmount(() => { if (ownBottomBar) ownBottomBar.value-- })
</script>

<template>
  <div :class="['grid gap-6', { 'with-preview': showPreview }]">
    <div class="form-col max-w-180">
      <header class="mb-4 grid gap-2.5">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-xl font-semibold tracking-tight">{{ title }}</h1>
          <DropdownMenu v-if="entry">
            <DropdownMenuTrigger as-child>
              <Button type="button" variant="ghost" class="-mr-2 shrink-0"><EllipsisIcon aria-hidden="true" />{{ t('entry.more') }}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem v-if="canDuplicate" class="min-h-9 pointer-coarse:min-h-11" :disabled="duplicating" @select="duplicate">{{ t('basics.duplicate.menu') }}</DropdownMenuItem>
              <DropdownMenuItem as-child class="min-h-9 pointer-coarse:min-h-11">
                <NuxtLink :to="`/s/${site.slug}/history?entry=${entry._id}`">{{ t('basics.history.ofEntry') }}</NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem v-if="canRemove && brick.kind === 'collection'" variant="destructive" class="min-h-9 pointer-coarse:min-h-11" @select="askRemove = true">{{ t('entry.removeEntry') }}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div v-if="statusText" class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge :variant="state === 'live' ? 'success' : entry?.publishAt ? 'warning' : 'soft'" class="text-sm">{{ statusText }}</Badge>
          <Popover v-if="entry && state !== 'live'" v-model:open="whyOpen">
            <PopoverTrigger as-child>
              <Button type="button" variant="link" class="h-9 px-0 pointer-coarse:h-11">{{ t('basics.why.link') }}</Button>
            </PopoverTrigger>
            <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)]">
              <WhyNotPublic
                :site="site.slug" :entry="entry._id" :locale="locale" :time-zone="timeZone" :main="main"
                @publish="whyOpen = false; openPublish()" @restore="whyOpen = false; ops.restoreEntry(entry._id, entry.lifeRev, tasks?.remove)" @translate="whyOpen = false; switchLanguage($event)"
              />
            </PopoverContent>
          </Popover>
        </div>
        <ToggleGroup
          v-if="schema.locales.length > 1" type="single" variant="segmented" :model-value="locale" :aria-label="t('entry.language')"
          @update:model-value="(next) => typeof next === 'string' && next && switchLanguage(next)"
        >
          <ToggleGroupItem v-for="l in schema.locales" :key="l" :value="l" :aria-disabled="dirty && l !== locale ? 'true' : undefined" class="px-4">
            {{ languageName(l, uiLocale) }}
            <template v-if="gapIn(l)">
              <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />
              <span class="sr-only">({{ t('basics.translation.incomplete') }})</span>
            </template>
          </ToggleGroupItem>
        </ToggleGroup>
        <p v-if="foreign" class="text-sm text-muted-foreground">{{ t('entry.foreignHint') }}</p>
      </header>

      <form ref="formEl" class="grid gap-6" novalidate @submit.prevent="save">
        <div v-if="conflict" class="grid gap-2 rounded-md bg-warning/10 p-3" role="alert">
          <p><strong>{{ t('entry.conflict.changed', { fields: conflict.fields.map((k) => shownField(k)).join(', ') || t('entry.conflict.thisEntry') }) }}</strong></p>
          <ul class="m-0 pl-4">
            <li v-for="k in conflict.fields" :key="k">{{ t('entry.conflict.item', { field: shownField(k), stored: displayValue(brick.fields[k]!, conflict.data[k], locale, { t, format }), mine: displayValue(brick.fields[k]!, draft[k], locale, { t, format }) }) }}</li>
          </ul>
          <div class="flex flex-wrap gap-2">
            <Button type="button" @click="keepMine">{{ t('entry.conflict.keepMine') }}</Button>
            <Button type="button" variant="outline" @click="form.takeTheirs()">{{ t('entry.conflict.takeTheirs') }}</Button>
          </div>
        </div>
        <p v-if="problem" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ problem }}</p>

        <EntryFields v-bind="fieldProps" :entries="grouped.ungrouped" @update="setField" />
        <template v-if="tabbed">
          <Tabs v-if="visibleGroups.length" v-model="activeTab">
            <!-- Underlined, so the tabs never look like the language switch above them. -->
            <TabsList class="h-auto w-full flex-wrap justify-start gap-5 rounded-none border-b bg-transparent p-0">
              <TabsTrigger v-for="g in visibleGroups" :key="g.id" :value="g.id" class="-mb-px flex-none rounded-none border-0 border-b-2 border-transparent px-0 pt-1 pb-2 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent">
                {{ shown(g.label) }}
                <span v-if="groupHasIssue(g)" class="size-2 rounded-full bg-destructive" role="img" :aria-label="t('entry.groupHasIssues')" />
              </TabsTrigger>
            </TabsList>
            <TabsContent v-for="g in visibleGroups" :key="g.id" :value="g.id" force-mount class="grid gap-4 pt-4 data-[state=inactive]:hidden">
              <EntryFields v-bind="fieldProps" :entries="g.fields" @update="setField" />
            </TabsContent>
          </Tabs>
        </template>
        <template v-else>
          <template v-for="g in visibleGroups" :key="g.id">
            <Separator />
            <section class="grid gap-4">
              <h2 class="text-base font-semibold">{{ shown(g.label) }}</h2>
              <EntryFields v-bind="fieldProps" :entries="g.fields" @update="setField" />
            </section>
          </template>
        </template>

        <div class="bar sticky bottom-0 flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-background py-3">
          <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
          <Button type="submit" :aria-disabled="busy || (!dirty && !!entry) ? 'true' : undefined">{{ busy ? (slow ? t('entry.save.waiting') : t('entry.save.saving')) : isDraft ? t('entry.save.draft') : t('entry.save.save') }}</Button>
          <Button v-if="isDraft && !publishing" type="button" variant="ghost" :disabled="busy" @click="openPublish">{{ entry?.publishAt ? t('entry.publish.changeSchedule') : t('entry.publish.open') }}</Button>
          <span v-if="!dirty && waiting" class="font-medium text-warning">{{ t('history.waiting') }}</span>
          <span v-else-if="!dirty && savedOnce" class="font-medium text-success">{{ t('entry.saved') }}</span>
          <span v-else-if="dirty" class="font-medium text-warning">{{ t('entry.unsaved') }}</span>
          <Button type="button" variant="ghost" class="ml-auto" :aria-pressed="showPreview" @click="showPreview = !showPreview">{{ showPreview ? t('entry.preview.close') : t('entry.preview.label') }}</Button>
          <template v-if="drafts && entry && state === 'live'">
            <Button v-if="!askUnpublish" type="button" variant="ghost" @click="askUnpublish = true">{{ t('entry.unpublish.button') }}</Button>
            <span v-else class="flex basis-full flex-wrap items-center gap-2">
              {{ t('entry.unpublish.warning', { title }) }}
              <Button type="button" variant="destructive" :disabled="publishBusy" @click="doUnpublish">{{ t('entry.unpublish.button') }}</Button>
              <Button type="button" variant="outline" @click="askUnpublish = false">{{ t('entry.cancel') }}</Button>
            </span>
            <p v-if="publishError && askUnpublish" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ publishError }}</p>
          </template>
          <div v-if="publishing" class="grid basis-full gap-2.5 rounded-lg border border-primary bg-card p-3.5" role="group" aria-labelledby="publish-title">
            <p id="publish-title" class="font-bold">{{ publishQuestion(brick, draft, main, t) }}</p>
            <RadioGroup v-model="when" class="flex flex-wrap gap-2" aria-labelledby="publish-title">
              <Label for="publish-now" class="min-h-10 cursor-pointer gap-2 rounded-md border border-input px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent pointer-coarse:min-h-11"><RadioGroupItem id="publish-now" value="now" />{{ t('entry.publish.now') }}</Label>
              <Label for="publish-later" class="min-h-10 cursor-pointer gap-2 rounded-md border border-input px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent pointer-coarse:min-h-11"><RadioGroupItem id="publish-later" value="later" />{{ t('entry.publish.later') }}</Label>
            </RadioGroup>
            <div v-if="when === 'later'" class="grid max-w-80 gap-1.5">
              <Label for="publish-at" class="font-semibold">{{ t('entry.publish.dateTime') }}</Label>
              <Input id="publish-at" v-model="at" type="datetime-local" :min="minAt" :max="maxAt" required />
              <p v-if="otherZone" class="text-sm text-muted-foreground">{{ t('entry.publish.siteZone', { zone: timeZone }) }}</p>
            </div>
            <p v-if="publishError" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ publishError }}</p>
            <div class="flex flex-wrap gap-2">
              <Button type="button" :disabled="publishBusy || busy" @click="doPublish">{{ when === 'now' ? t('entry.publish.publishNow') : t('entry.publish.schedule') }}</Button>
              <Button v-if="entry?.publishAt" type="button" variant="outline" :disabled="publishBusy" @click="doUnpublish">{{ t('entry.publish.clearSchedule') }}</Button>
              <Button type="button" variant="ghost" @click="publishing = false">{{ t('entry.cancel') }}</Button>
            </div>
          </div>
        </div>
      </form>

      <!-- The destructive action sits in "Mehr", away from Speichern and Vorschau; the question stays. -->
      <Dialog v-model:open="askRemove">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{{ t('entry.remove.title') }}</DialogTitle>
            <DialogDescription>{{ t('entry.remove.text', { title }) }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" @click="askRemove = false">{{ t('entry.cancel') }}</Button>
            <Button type="button" variant="destructive" :disabled="removing" @click="remove">{{ t('entry.remove.confirm') }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    <PreviewPane
      v-if="showPreview"
      class="preview-col"
      :site="site"
      :schema="schema"
      :entries="entries"
      :editing="{ brick: brickKey, entry: entry?._id, data: draft }"
      :locale="locale"
      :path="previewPath"
      :files="files"
      :revision="fileIds.join(',') + ':' + (fileInfo ? Object.values(fileInfo).filter(Boolean).length : 0)"
    />
  </div>
</template>

<style scoped>
.with-preview { grid-template-columns: 1fr; }
@media (min-width: 1200px) {
  .with-preview { grid-template-columns: minmax(0, 560px) minmax(0, 1fr); align-items: start; }
  .preview-col { position: sticky; top: calc(var(--studio-header-height) + 1.25rem); height: calc(100dvh - var(--studio-header-height) - 2.5rem); }
}
@media (max-width: 1199px) { .preview-col { height: 80dvh; } }
/* The save bar keeps clear of the home indicator. */
.bar { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
</style>
