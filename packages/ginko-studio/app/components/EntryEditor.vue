<!-- Alles bearbeiten (UI.md 4): every field of one entry, the language switch with translation
     status, a sticky save bar, and the preview beside it on wide screens. Same engine as the tasks. -->
<script setup lang="ts">
import type { Brick, CollectionBrick, Field, Fields, Json, Label as LabelText, Locale } from '@lupinum/ginko'
import { SITE_BUDGET, defaultsFor, entryBytes, isShown, isTranslatable, ordered, routeUrls, textIn, untranslatedMode, urlsFor, type Schema } from '@lupinum/ginko/internal'
import type { Entry } from '../composables/useSiteData'
import { api } from '#convex/api'
import { draftSlugs, languageName, leafTranslation, previewFileIds, publishQuestion, titleOf } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { msToZoned, scheduleProblem, whenText } from '../utils/when'
import { sizeText } from '../utils/size'
import { isProposal, opErrorOf } from '../composables/useOps'
import { TRANSLATION } from '@lupinum/ginko-editor'
import { EllipsisIcon } from '@lucide/vue'
import WhyNotPublic from './WhyNotPublic.vue'
import ScheduleField from './ScheduleField.vue'
import EntryGoneBanner from './EntryGoneBanner.vue'
import LocalDraftOffer from './LocalDraftOffer.vue'
import ConflictPanel from './ConflictPanel.vue'
import EntryRemoveDialog from './EntryRemoveDialog.vue'
import { rememberEntry } from '../composables/useRecentEntries'
import EntryFields from './EntryFields.vue'
import { groupFields, type FieldGroup } from '../utils/groups'
import { refDebounced, useMediaQuery } from '@vueuse/core'
import { OWN_BOTTOM_BAR } from '../utils/siteLinks'
import { provideSiteRefs } from '../composables/useSiteRefs'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Badge } from '@studio/components/ui/badge'
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
  /** Staff work through tasks (SPEC 2.7): the task refs that allow saving, creating and removing here, and the fields the save task covers. Owners pass none. */
  tasks?: { save?: string; fields?: readonly string[]; create?: string; remove?: string }
  canRemove: boolean
  /** Someone removed `entry` while it was open (useKeptEntry): the form keeps the input and offers a way out. */
  removed?: boolean
  /**
   * Called after a removal, and after "Verwerfen" on an entry someone else removed. A prop, not an emit:
   * a caller without a kept entry unmounts this editor when the entry leaves the live list, before the
   * mutation returns, and an unmounted component's emits go nowhere.
   */
  onRemoved?: () => void
}>()
const emit = defineEmits<{ created: [entry: string] }>()
const { t, format, locale: uiLocale } = useI18n()

const main = computed(() => props.schema.locales[0]!)
// Ref fields list the entries of their target brick by title.
provideSiteRefs(() => props.site.slug, () => props.schema, () => main.value)
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
  removed: () => !!props.removed,
  // A local copy made in another language is restored in that language (its texts belong there).
  otherLocale: async (next) => {
    if (!props.schema.locales.includes(next)) return false
    if (dirty.value) {
      useToast().show(t('entry.saveBeforeLanguage'), { tone: 'err' })
      return false
    }
    locale.value = next
    await nextTick()
    return true
  },
})
const { draft, baseline, issues, problem, conflict, busy, offline, waiting, dirty, confirm, localOffer } = form

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
  return leafTranslation({
    draft: value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined,
    locale: locale.value,
    main: main.value,
    storedMain: (storedAt(path) as Record<string, unknown> | undefined)?.[main.value],
    print: props.entry?.prints[path]?.[locale.value],
    confirmed: confirm.value.includes(path),
  })
}
/** Whether the stored entry has missing or outdated texts in language `l` (a dot on the language switch). */
function gapIn(l: Locale) {
  const gap = l === main.value ? undefined : props.entry?.translation?.[l]
  return !!gap && gap.missing.length + gap.outdated.length > 0
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

// The entry limit spans all fields and languages, so no field counter shows it (SPEC 3). Counted as the server does
// (core entryBytes: the stored text, the draft over the stored data; the prints may lag by a few bytes), after the
// typing pause of the editors, not on every key. Save stays possible: a save that shrinks an entry over the limit passes.
const typed = refDebounced(draft, 300)
const size = computed(() => {
  const used = entryBytes({ ...props.entry?.data, ...typed.value }, props.entry?.prints ?? {})
  const limit = SITE_BUDGET.entryBytes
  const text = (bytes: number) => sizeText(bytes, format.number)
  if (used > limit) return { over: true, text: t('entry.size.over', { used: sizeText(used, format.number, 'up'), limit: text(limit), over: sizeText(used - limit, format.number, 'up') }) }
  if (used >= limit * 0.8) return { over: false, text: t('entry.size.near', { used: sizeText(used, format.number, 'down'), limit: text(limit) }) }
  return undefined
})

async function save() {
  // The save button is only aria-disabled (below), so a keyboard press still lands here.
  if (busy.value || props.removed || (!dirty.value && props.entry)) return
  if (await form.save()) {
    if (!waiting.value) savedOnce.value = true
    if (form.created.value) emit('created', form.created.value)
  }
}

async function keepMine() {
  if (await form.keepMine() && !waiting.value) savedOnce.value = true
}
async function keepBoth() {
  if (await form.mergeLists() && !waiting.value) savedOnce.value = true
}

const ops = useOps(computed(() => props.site.slug))
const removing = ref(false)
/** The person's own removal: the entry leaves the list before the mutation returns, and that is no news to them. */
const removingSelf = ref(false)
async function remove() {
  if (!props.entry) return
  removing.value = true
  removingSelf.value = true
  try {
    // A removal that went to approval leaves the entry where it is.
    if (await ops.removeEntry(props.entry._id, props.entry.lifeRev, props.tasks?.remove, title.value, props.entry.state === 'draft')) {
      // Removing it drops the input too, as closing would: nothing to ask on the way out.
      form.discard()
      props.onRemoved?.()
    } else {
      removingSelf.value = false
    }
  } finally {
    removing.value = false
    askRemove.value = false
  }
}
const askRemove = ref(false)
/** Entries that point at this one (N5), looked up only while the remove question is open. */
const removeUses = useConvexQuery(api.entries.usedBy, () => (askRemove.value && props.entry ? { site: props.site.slug, entry: props.entry._id } : 'skip'))
/** The older removed entries this removal would delete for good (a full trash), looked up the same way. */
const removeOverflow = useConvexQuery(api.entries.trashOverflow, () => (askRemove.value && props.entry ? { site: props.site.slug, entry: props.entry._id } : 'skip'))

// Someone else removed the entry (N1): restore and save, save as a new entry, or discard.
const mayCreate = computed(() => props.brick.kind === 'collection' && (!props.tasks || !!props.tasks.create))
async function restoreRemoved(lifeRev: number) {
  const typed = dirty.value
  if (await form.restoreAndSave(lifeRev, props.tasks?.remove) && typed && !waiting.value) savedOnce.value = true
}
async function saveAsNew() {
  if (await form.saveAsNew(props.tasks?.create) && form.created.value) emit('created', form.created.value)
}
function discardRemoved() {
  form.discard()
  props.onRemoved?.()
}

// More: a draft copy of this entry (UI.md 10.6). Copying belongs to the create right.
const canDuplicate = computed(() => !!props.entry && props.brick.kind === 'collection' && (!props.tasks || !!props.tasks.create))
const duplicateEntry = useConvexMutation(api.entries.duplicate)
const duplicating = ref(false)
async function duplicate() {
  if (!props.entry) return
  duplicating.value = true
  try {
    const result = await duplicateEntry.mutate({ site: props.site.slug, opId: crypto.randomUUID(), task: props.tasks?.create, entry: props.entry._id })
    // A proposal: the copy waits for approval, nothing to open yet.
    if (isProposal(result)) return useToast().show(t('basics.duplicate.sent'))
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
    ? t('entry.status.onlineFrom', { when: whenText(props.entry.publishAt, timeZone.value, format) })
    : t('entry.status.draft')
})
/** Publishing belongs to the brick's create and edit tasks (staff need one of them). */
const publishTask = computed(() => props.tasks?.save ?? props.tasks?.create)

const publishing = ref(false)
const when = ref<'now' | 'later'>('now')
const at = ref('')
/** The instant `at` names (ScheduleField); undefined while it names none or two. */
const picked = ref<number>()
const publishError = ref('')
const publishBusy = ref(false)
const HOUR = 60 * 60 * 1000

function openPublish() {
  const now = Date.now()
  const scheduled = props.entry?.publishAt
  when.value = scheduled ? 'later' : 'now'
  // A suggestion for "Online ab": tomorrow 9:00 at the site, or the time already planned.
  at.value = scheduled ? msToZoned(scheduled, timeZone.value) : `${msToZoned(now + 24 * HOUR, timeZone.value).slice(0, 10)}T09:00`
  picked.value = scheduled
  publishError.value = ''
  publishing.value = true
}

async function doPublish() {
  publishError.value = ''
  let ms: number | undefined
  if (when.value === 'later') {
    const problem = scheduleProblem(at.value, timeZone.value, picked.value, Date.now())
    if (problem === 'entry.publish.timeMissing') document.getElementById('publish-at')?.focus()
    else if (problem) publishError.value = t(problem)
    if (problem) return
    ms = picked.value
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

// A new entry has no address yet: the preview gives it the one the server will make from its title (draftSlugs), so
// the site finds it on its own page. Read after the typing pause, so the page does not reload on every key.
const newSlugs = computed(() => (props.entry ? undefined : draftSlugs(props.brick, props.schema.locales, typed.value)))
const previewData = computed(() => (newSlugs.value ? { ...draft.value, ...newSlugs.value } : draft.value))
/** The label of the field a new entry's address is made from, while it is empty: there is no page to show yet. */
const previewWaitsFor = computed(() => {
  if (props.entry || props.brick.kind !== 'collection' || !props.brick.route) return undefined
  const slug = Object.values(props.brick.fields).find((field) => field.type === 'slug' && !field.retired)
  if (slug?.type !== 'slug' || textIn(typed.value[slug.from], main.value).trim()) return undefined
  return shown(props.brick.fields[slug.from]!.label)
})
/**
 * The entry's addresses per language as the preview shows it, the typed values over the stored ones (a task form
 * holds only some fields), so a translation typed just now gives it its page: `routed` from the route alone, `pages`
 * without the languages it is untranslated in (core urlsFor). Undefined for a brick without a route.
 */
const previewUrls = computed(() => {
  const brick = props.brick
  if (brick.kind !== 'collection' || !brick.route) return undefined
  const entry = { id: props.entry?._id ?? 'new', data: { ...props.entry?.data, ...typed.value, ...newSlugs.value } as never }
  return { routed: routeUrls(props.schema, brick, entry), pages: urlsFor(props.schema, props.brickKey, brick, entry) }
})
/** Why the preview shows no page: a new entry's address cannot be made yet, or the entry has no page in this language until it is translated. */
const previewNotice = computed(() => {
  const urls = previewUrls.value
  if (!urls) return undefined
  if (previewWaitsFor.value) return t('entry.preview.needsTitle', { field: previewWaitsFor.value })
  if (!urls.routed[locale.value] || urls.pages[locale.value]) return undefined
  const language = languageName(locale.value, uiLocale.value)
  // How the site treats it there (core untranslatedMode): left out, or listed in the main language without a page.
  return untranslatedMode(props.brick as CollectionBrick) === 'hide'
    ? t('entry.preview.untranslated', { language })
    : t('entry.preview.untranslatedListed', { language, main: languageName(main.value, uiLocale.value) })
})
// Preview: the entry's own page when it has one in this language, else the site's first page in this language.
const previewPath = computed(() => {
  if (previewNotice.value) return undefined
  return previewUrls.value?.pages[locale.value] ?? Object.values(props.schema.pages)[0]?.[locale.value] ?? '/'
})
const showPreview = ref(false)

// The preview builds the site from all its entries, so it reads them only while it is open.
const previewRead = useConvexQuery(api.entries.ofBricks, () => (showPreview.value ? { site: props.site.slug, bricks: Object.keys(props.schema.bricks) } : 'skip'))
const previewEntries = computed(() => previewRead.data.value)
// The preview needs the URLs and library descriptions of the referenced photos and PDFs (fields and texts), also of one uploaded just now.
const fileIds = computed(() => previewFileIds(draft.value, (previewEntries.value ?? []).map((e) => e.data)))
const { data: fileInfo } = useConvexQuery(api.uploads.urls, () => (showPreview.value && fileIds.value.length ? { site: props.site.slug, ids: fileIds.value } : 'skip'))
function files(id: string) {
  const f = fileInfo.value?.[id]
  return f ? { url: f.url, name: f.name, size: f.size, alt: f.alt, ...(f.width ? { width: f.width } : {}), ...(f.height ? { height: f.height } : {}) } : undefined
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
          <DropdownMenu v-if="entry && !removed">
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
        <EntryGoneBanner
          v-if="removed && entry && !removingSelf"
          :site="site.slug" :brick-key="brickKey" :entry="entry" :dirty="dirty" :busy="busy"
          :may-restore="canRemove" :may-create="mayCreate"
          @restore="restoreRemoved" @save-as-new="saveAsNew" @discard="discardRemoved"
        />
        <LocalDraftOffer v-if="localOffer" :saved-at="localOffer.savedAt" :busy="busy" @restore="form.restoreLocal()" @discard="form.dropLocal()" />
        <ConflictPanel
          v-if="conflict"
          :conflict="conflict" :draft="draft" :baseline="baseline" :fields="brick.fields" :locale="locale" :main="main"
          :can-keep-both="!!form.listMerge.value"
          @keep-mine="keepMine" @take-theirs="form.takeTheirs()" @keep-both="keepBoth"
        />
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
          <!-- The live region must be in the accessibility tree before its text appears, so empty means sr-only (no space), not hidden. -->
          <p :class="['basis-full text-sm empty:sr-only', size?.over ? 'font-medium text-destructive' : 'text-muted-foreground']" aria-live="polite">{{ size?.text }}</p>
          <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
          <Button type="submit" :aria-disabled="busy || removed || (!dirty && !!entry) ? 'true' : undefined">{{ busy ? (offline ? t('entry.save.waiting') : t('entry.save.saving')) : isDraft ? t('entry.save.draft') : t('entry.save.save') }}</Button>
          <Button v-if="isDraft && !publishing && !removed" type="button" variant="ghost" :disabled="busy" @click="openPublish">{{ entry?.publishAt ? t('entry.publish.changeSchedule') : t('entry.publish.open') }}</Button>
          <span v-if="!dirty && waiting" class="font-medium text-warning">{{ t('history.waiting') }}</span>
          <span v-else-if="!dirty && savedOnce" class="font-medium text-success">{{ t('entry.saved') }}</span>
          <span v-else-if="dirty" class="font-medium text-warning">{{ t('entry.unsaved') }}</span>
          <Button type="button" variant="ghost" class="ml-auto" :aria-pressed="showPreview" @click="showPreview = !showPreview">{{ showPreview ? t('entry.preview.close') : t('entry.preview.label') }}</Button>
          <template v-if="drafts && entry && state === 'live' && !removed">
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
              <ScheduleField v-model:local="at" v-model:picked="picked" :zone="timeZone" input-id="publish-at" />
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
      <EntryRemoveDialog v-model:open="askRemove" :slug="site.slug" :title="title" :uses="removeUses.error.value ? [] : removeUses.data.value" :overflow="removeOverflow.error.value ? [] : removeOverflow.data.value" :busy="removing" :draft="entry?.state === 'draft'" @confirm="remove" />
    </div>

    <PreviewPane
      v-if="showPreview"
      class="preview-col"
      :site="site"
      :schema="schema"
      :entries="previewEntries"
      :editing="{ brick: brickKey, entry: entry?._id, data: previewData }"
      :locale="locale"
      :path="previewPath"
      :notice="previewNotice"
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
