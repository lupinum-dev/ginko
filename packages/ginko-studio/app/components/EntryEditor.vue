<!-- Alles bearbeiten (UI.md 4): every field of one entry, the language switch with translation status, Save, and the
     preview. Same engine as the tasks. Phones: a sticky save bar at the bottom, the preview under the form. Wide
     screens (design A): Save, Preview and the save state in the panel's top bar; from 1280px a right column with the
     status (publishing) and the entry's address, picture and search fields; with the preview open the area list folds
     away and the form and the preview share the panel. -->
<script setup lang="ts">
import type { Brick, CollectionBrick, Fields, Json, Label as LabelText, Locale } from '@lupinum/ginko'
import { SITE_BUDGET, defaultsFor, entryBytes, isShown, ordered, routeUrls, textIn, todayIn, untranslatedMode, urlsFor, visibleUntil, type Schema } from '@lupinum/ginko/internal'
import type { Entry } from '../composables/useSiteData'
import { api } from '#convex/api'
import { draftSlugs, formatDay, hasTranslation, hidesUntranslated, languageName, leafTranslation, leafValue, missingNote, pageOf, previewFileIds, publishQuestion, taskRef, titleOf, translationLines, weekShortcuts, type Task } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { msToZoned, scheduleProblem, whenText } from '../utils/when'
import { sizeText } from '../utils/size'
import { isModKey } from '../utils/keys'
import { shrunkHint, shrunkTexts } from '../utils/shrunk'
import { isProposal, opErrorOf } from '../composables/useOps'
import { TRANSLATION } from '@lupinum/ginko-editor'
import { EllipsisIcon, EyeIcon, EyeOffIcon } from '@lucide/vue'
import WhyNotPublic from './WhyNotPublic.vue'
import EntryGoneBanner from './EntryGoneBanner.vue'
import LocalDraftOffer from './LocalDraftOffer.vue'
import ConflictPanel from './ConflictPanel.vue'
import EntryRemoveDialog from './EntryRemoveDialog.vue'
import EntryPublishPanel from './EntryPublishPanel.vue'
import LanguageSwitch from './LanguageSwitch.vue'
import { rememberEntry } from '../composables/useRecentEntries'
import EntryFields from './EntryFields.vue'
import { groupFields, type FieldGroup } from '../utils/groups'
import { refDebounced, useElementSize, useMediaQuery } from '@vueuse/core'
import { useId } from 'vue'
import { useBottomBar } from '../composables/useBottomBar'
import { siteOrigin } from '../utils/origin'
import { provideSiteRefs } from '../composables/useSiteRefs'
import { provideFactUses } from '../composables/useFacts'
import { useCrumbs, usePanelBar } from '../composables/usePageHeader'
import { useAreaList } from '../composables/useAreaList'
import { focusText, previewPageOf } from '../utils/previewPage'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Badge } from '@studio/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@studio/components/ui/tabs'

const props = defineProps<{
  /** `release`: the site's last release, null before the first (nothing of it is online yet). */
  site: { slug: string; url: string; previewOrigins: string[]; schemaRev: number; contentRev: number; name: string; release: object | null }
  schema: Schema
  brickKey: string
  brick: Brick
  /** None = a new entry of a collection. */
  entry?: Entry
  /**
   * Staff work through tasks (SPEC 2.7): the task refs that allow saving, creating and removing here, the fields the
   * save task covers (none: every field), and the tasks of this brick they hold. `saveFor` picks the task of one save
   * by the fields it changes (an entry they created, useAll.ts). Owners pass none.
   */
  tasks?: { save?: string; saveFor?: (roots: readonly string[]) => string | undefined; fields?: readonly string[]; create?: string; remove?: string; held?: readonly Task[] }
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
// Fact fields say which texts quote them (EntryFields).
provideFactUses(() => props.site.slug, () => props.schema, () => props.brickKey)
// A link from a translation badge opens the entry in that language (?lang=en).
const wantedLocale = String(useRoute().query.lang ?? '')
const locale = ref<Locale>(props.schema.locales.includes(wantedLocale) ? wantedLocale : main.value)
const foreign = computed(() => locale.value !== main.value)

/**
 * All live fields; a new entry has no slug yet; a foreign language shows only translatable ones, and the address the
 * page has there (display only: the form never sends a slug, the server makes it from the translated title).
 */
const fields = computed<Fields>(() => Object.fromEntries(ordered(props.brick.fields).filter(([key, f]) => {
  if (f.retired) return false
  if (!props.entry && f.type === 'slug') return false
  if (props.entry && props.tasks?.fields && !props.tasks.fields.includes(key)) return false
  if (foreign.value) return hasTranslation(f) || (f.type === 'slug' && props.brick.kind === 'collection' && !!props.brick.route?.[locale.value])
  return true
})))

const form = useEntryForm({
  site: computed(() => props.site.slug),
  brickKey: () => props.brickKey,
  brick: () => props.brick,
  fields: () => fields.value,
  entry: () => props.entry,
  main: () => main.value,
  locale: () => locale.value,
  task: (roots) => (!props.entry ? props.tasks?.create : roots && props.tasks?.saveFor ? props.tasks.saveFor(roots) : props.tasks?.save),
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

/**
 * A new entry starts like the brick's create task in Schnell ändern: its title and its prefill (e.g. today's date).
 * With several create tasks the general one counts (no prefill); "Heute ausgebucht" fills in values for its own case
 * only. Staff get it only when it is the create task they work with.
 */
const createTask = computed(() => {
  if (props.entry || props.brick.kind !== 'collection') return undefined
  const creates = (props.brick.tasks ?? []).filter((task): task is Extract<Task, { kind: 'create' }> => task.kind === 'create')
  const general = creates.length === 1 ? creates[0] : creates.find((task) => !task.prefill)
  if (!general || (props.tasks && props.tasks.create !== taskRef(props.brickKey, general))) return undefined
  return general
})
const createPrefill = useConvexQuery(api.tasks.prefill, () => (createTask.value ? { site: props.site.slug, task: taskRef(props.brickKey, createTask.value) } : 'skip'), { server: false })
/** The server resolves the prefill (tokens such as @today in the site's time zone); only fields of this form. */
const prefilled = computed<Record<string, Json>>(() => {
  const values = createTask.value ? createPrefill.data.value : undefined
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  return Object.fromEntries(Object.entries(values).filter(([key]) => key in fields.value))
})

function start() {
  form.load(props.entry ? { ...props.entry.data } : { ...defaultsFor(fields.value), ...prefilled.value })
}
start()
// The prefill arrives after the form opened: it fills the new form unless the person has typed already.
watch(prefilled, () => { if (!props.entry && !dirty.value) start() })
// Another entry opened, or a language switch with nothing unsaved: start from the stored state.
watch(() => props.entry?._id, start)
watch(locale, () => { if (!dirty.value) start() })
/** Unsaved input blocks the switch. The reason shows when the person tries (a toast, so the layout stays put). */
function switchLanguage(next: Locale) {
  if (next === locale.value) return
  if (dirty.value) return useToast().show(t('entry.saveBeforeLanguage'), { tone: 'err' })
  locale.value = next
}

const storedAt = (path: string) => leafValue(props.entry?.data, path)
const draftAt = (path: string) => leafValue(draft.value, path)

/** Translation state of one translatable leaf in the foreign language (top level or inside a list row). */
function translation(path: string): 'missing' | 'stale' | 'fine' | undefined {
  if (!foreign.value) return undefined
  const value = draftAt(path)
  const stored = storedAt(path) as Record<string, unknown> | undefined
  return leafTranslation({
    draft: value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined,
    locale: locale.value,
    main: main.value,
    storedMain: stored?.[main.value],
    storedForeign: stored?.[locale.value],
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

/** The main-language text shown above a translation: all of it, Markdown as written (the field shows it rich). */
function sourceText(path: string): string {
  const value = storedAt(path) as Record<string, unknown> | undefined
  const text = value?.[main.value]
  return typeof text === 'string' ? text : ''
}

// The link opens the local site on a local platform; the browser decides, so only after mount (no hydration mismatch).
const mounted = ref(false)
onMounted(() => { mounted.value = true })
/** The entry's page in the open language: none while it is not translated there; a link only while the website shows it. */
function address() {
  if (!props.entry || props.brick.kind !== 'collection') return undefined
  const page = pageOf(props.schema, props.brickKey, props.brick, props.entry, locale.value, { released: !!props.site.release, today: todayIn(props.schema.timeZone) })
  if (!page) return undefined
  return page.online && mounted.value ? { path: page.path, href: `${siteOrigin(props.site)}${page.path}` } : { path: page.path }
}

// A confirmed leaf whose row was removed meanwhile would make the save INVALID: drop it (Astra 11).
watch(draft, () => {
  const kept = confirm.value.filter((path) => draftAt(path) !== undefined)
  if (kept.length !== confirm.value.length) confirm.value = kept
}, { deep: true })

// What the website shows in the open foreign language now (the stored entry; none for a draft), for the notes under
// untranslated fields and the lines under the language switch. The server decides it (lib/translation.ts).
const storedTranslation = computed(() => (foreign.value ? props.entry?.translation?.[locale.value] : undefined))
const languageNames = computed(() => ({ lang: languageName(locale.value, uiLocale.value), main: languageName(main.value, uiLocale.value) }))
const translationState = computed(() => translationLines(storedTranslation.value, t, languageNames.value))

// Lists show the same state per cell (Phase 11: confirming translations inside lists).
provide(TRANSLATION, {
  state: translation, source: sourceText, confirm: confirmTranslation, mainName: () => languageNames.value.main,
  missingNote: (leaf) => missingNote(storedTranslation.value, leaf, t, languageNames.value, hidesUntranslated(props.brick, leaf) ? title.value : undefined),
  // History shows the main-language text before and after each change of this entry.
  changesUrl: () => (props.entry ? `/s/${props.site.slug}/history?entry=${props.entry._id}` : undefined),
  address,
})

const shown = (label: LabelText) => shownLabel(label, main.value)
/**
 * Staff without a right to change this entry (no edit task, and not one they created with their create task): the
 * form shows no fields and no Speichern, but a note that says why and whom to ask. Vorschau, Mehr and publishing stay.
 */
const readOnly = computed(() => !!props.entry && !!props.tasks && !props.tasks.save)
const readOnlyNote = computed(() => props.tasks?.create
  ? t('entry.readOnlyOthers')
  : t('entry.readOnly', { area: shown(props.brick.label), tasks: (props.tasks?.held ?? []).map((task) => shown(task.label)).join(', ') }))
const title = computed(() => {
  if (props.brick.kind === 'single') return shown(props.brick.label)
  if (props.entry) return titleOf(props.brick, props.entry.data, main.value)
  return createTask.value ? shown(createTask.value.label) : t('entry.newIn', { brick: shown(props.brick.label) })
})
const savedOnce = ref(false)
const formEl = ref<HTMLFormElement | null>(null)
const formId = useId()

// Wide screens remember whether the preview was open (per browser; storage can be missing or refused). Phones start
// closed: there the preview sits under the long form.
const PREVIEW_OPEN = 'ginko:preview-open'
const showPreview = ref(false)
function togglePreview() {
  showPreview.value = !showPreview.value
  if (bar.value) try { localStorage.setItem(PREVIEW_OPEN, showPreview.value ? '1' : '0') } catch { /* not remembered */ }
}
// Wide screens: the panel's top bar takes Save and Preview; the crumbs say where the entry is.
const bar = usePanelBar()
onMounted(() => {
  if (!bar.value) return
  try { if (localStorage.getItem(PREVIEW_OPEN) === '1') showPreview.value = true } catch { /* closed */ }
})
const areaList = useAreaList()
watch([bar, showPreview], ([wide, open]) => areaList.foldFor(wide && open), { immediate: true })
onBeforeUnmount(() => areaList.foldFor(false))
const split = computed(() => bar.value && showPreview.value)
// Before sideMode: with the panel bar already shown (a move within the Studio), the tab watcher below reads it during setup.
// Drafts (SPEC 15): only collections that ask for them. A draft is saved without going online;
// "Veröffentlichen …" puts it online now or at a time; a live entry can be taken back to a draft.
const timeZone = computed(() => props.schema.timeZone)
const drafts = computed(() => props.brick.kind === 'collection' && props.brick.drafts === true)
const state = computed(() => props.entry?.state ?? 'live')
// A draft stays a draft when the collection later turns drafts off (SPEC 15), so it can still be published.
const isDraft = computed(() => (props.entry ? state.value === 'draft' : drafts.value))
/**
 * Save without publishing: on a live entry of a collection with drafts, Speichern keeps the changes unpublished;
 * Veröffentlichen puts them live (now or later), Verwerfen goes back to the version on the website.
 */
const keepsChanges = computed(() => drafts.value && !!props.entry && state.value === 'live')
const pending = computed(() => (keepsChanges.value ? props.entry?.pending : undefined))
/** The planned time of a scheduled draft, or of a live entry's unpublished changes. */
const scheduledAt = computed(() => props.entry?.publishAt ?? pending.value?.publishAt)
/** "Veröffentlichen …": a draft, or unpublished changes (saved, or typed and saved on the way). */
const publishable = computed(() => isDraft.value || (keepsChanges.value && (!!pending.value || dirty.value)))
const statusText = computed(() => {
  if (!props.entry || (!drafts.value && state.value === 'live')) return ''
  if (pending.value) {
    return pending.value.publishAt
      ? t('entry.status.changesFrom', { when: whenText(pending.value.publishAt, timeZone.value, format) })
      : t('entry.status.changes')
  }
  if (state.value === 'live') return t('entry.status.online')
  return props.entry.publishAt
    ? t('entry.status.onlineFrom', { when: whenText(props.entry.publishAt, timeZone.value, format) })
    : t('entry.status.draft')
})
const statusVariant = computed(() => (pending.value || (state.value !== 'live' && props.entry?.publishAt) ? 'warning' : state.value === 'live' ? 'success' : 'soft'))
/** The right column's status card: for entries that can be drafts, or that have a status to show. */
const statusCard = computed(() => !!statusText.value || drafts.value)
const wideSide = useMediaQuery('(min-width: 1280px)')
/** The right column: from 1280px while the preview is closed (the preview takes that room when open), when it has something to show. */
const sideMode = computed(() => bar.value && wideSide.value && !showPreview.value && (statusCard.value || !!sideImage.value || sideSlug.value.length > 0 || sideGroups.value.length > 0))
const base = computed(() => `/s/${props.site.slug}/all`)
useCrumbs(() => [
  { label: t('nav.all'), to: base.value },
  ...(props.brick.kind === 'collection' ? [{ label: shown(props.brick.label), to: `${base.value}/${props.brickKey}` }, { label: title.value }] : [{ label: title.value }]),
])
// After a refused save, the first field with an error gets the focus (its message is read with it).
watch(issues, (list) => { if (list.length) nextTick(() => formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()) })

// Field groups (display only). Phones always show headings; tabs need room.
const grouped = computed(() => groupFields(fields.value))
const visibleGroups = computed(() => grouped.value.groups.filter((g) => g.fields.some(([, f]) => isShown(f, draft.value))))
/**
 * What the right column shows besides the status: the address (slug), the first picture outside a group (the cover),
 * and a group for search engines and sharing. Display only: in one column they stay where the config puts them.
 */
const SIDE_GROUP = /^(seo|search|sharing|meta)$/i
const sideSlug = computed(() => grouped.value.ungrouped.filter(([, f]) => f.type === 'slug'))
const sideImage = computed(() => grouped.value.ungrouped.find(([, f]) => f.type === 'image'))
const sideGroups = computed(() => visibleGroups.value.filter((g) => SIDE_GROUP.test(g.id)))
const sideKeys = computed(() => new Set([...sideSlug.value, ...(sideImage.value ? [sideImage.value] : [])].map(([key]) => key)))
const mainUngrouped = computed(() => (sideMode.value ? grouped.value.ungrouped.filter(([key]) => !sideKeys.value.has(key)) : grouped.value.ungrouped))
const mainGroups = computed(() => (sideMode.value ? visibleGroups.value.filter((g) => !SIDE_GROUP.test(g.id)) : visibleGroups.value))
const wide = useMediaQuery('(min-width: 768px)', { ssrWidth: 1024 })
const tabbed = computed(() => props.brick.layout === 'tabs' && wide.value)
const activeTab = ref('')
watch(() => mainGroups.value, (list) => { if (!list.some((g) => g.id === activeTab.value)) activeTab.value = list[0]?.id ?? '' }, { immediate: true })
// A fact's panel ("In Praxis ändern") opens the entry at one field (`?field=price`): its tab shows and it gets the focus.
const wantedField = String(useRoute().query.field ?? '')
onMounted(() => {
  if (!wantedField || !Object.hasOwn(props.brick.fields, wantedField)) return
  const group = mainGroups.value.find((g) => g.fields.some(([key]) => key === wantedField))
  if (tabbed.value && group) activeTab.value = group.id
  nextTick(() => {
    const control = document.getElementById(`f-${wantedField}`)
    control?.scrollIntoView({ block: 'center' })
    control?.focus({ preventScroll: true })
  })
})
const groupHasIssue = (g: FieldGroup) => g.fields.some(([key]) => issues.value.some((i) => i.path === key || i.path.startsWith(`${key}.`)))
// In another language, a tab whose fields miss a translation or hold an outdated one says so, like the language switch.
const gapRoots = computed(() => new Set([...(storedTranslation.value?.missing ?? []), ...(storedTranslation.value?.outdated ?? [])].map((leaf) => leaf.split('.')[0]!)))
const groupHasGap = (g: FieldGroup) => g.fields.some(([key]) => gapRoots.value.has(key))
// A refused save shows the first tab that holds an error.
watch(issues, () => { const first = mainGroups.value.find(groupHasIssue); if (tabbed.value && first) activeTab.value = first.id })
const setField = (key: string, value: Json | undefined) => form.setField(key, value)
const fieldProps = computed(() => ({ all: props.brick.fields, draft: draft.value, baseline: baseline.value, locale: locale.value, locales: props.schema.locales, issues: issues.value, route: props.brick.kind === 'collection' ? props.brick.route : undefined, weeks: (key: string) => weekShortcuts(props.brick, key) }))

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

/** Long texts that lost most of their length since the last save (a slip, or a rewrite): a hint, never a block. */
const shrunk = computed(() => (dirty.value ? shrunkTexts(fields.value, baseline.value, typed.value, locale.value).map((s) => shrunkHint(s, shown(fields.value[s.key]!.label), { t, format })) : []))

/** Save is only aria-disabled (it keeps the focus): while saving, for an entry someone removed, or with nothing new. */
const saveBlocked = computed(() => busy.value || !!props.removed || (!dirty.value && !!props.entry))
const saveLabel = computed(() => (busy.value ? (offline.value ? t('entry.save.waiting') : t('entry.save.saving')) : isDraft.value ? t('entry.save.draft') : t('entry.save.save')))
async function save() {
  // The save button is only aria-disabled (below), so a keyboard press still lands here.
  if (busy.value || props.removed || (!dirty.value && props.entry)) return
  if (await form.save()) {
    if (!waiting.value) savedOnce.value = true
    if (form.created.value) emit('created', form.created.value)
  }
}
/** Cmd/Ctrl+S anywhere in the form saves like the button (its guards included), never the browser's "Save page as". */
function onFormKey(event: KeyboardEvent) {
  if (!isModKey(event, 's')) return
  event.preventDefault()
  save()
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
const moreButton = ref<{ $el: HTMLElement } | null>(null)
/** The remove question opens from a menu item that leaves with the menu: closing it hands the focus back to "Mehr". */
function focusMore(event: Event) {
  event.preventDefault()
  moreButton.value?.$el.focus()
}
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

/** The status card's line under the badge: what a draft or a scheduled entry means for the website. */
const statusNote = computed(() => {
  if (pending.value) return pending.value.publishAt ? t('entry.side.changesScheduledNote') : t('entry.side.changesNote')
  if (!props.entry || state.value === 'live') return ''
  return props.entry.publishAt ? t('entry.side.scheduledNote') : t('entry.side.draftNote')
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
  const scheduled = scheduledAt.value
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
    if (keepsChanges.value) {
      // The rev the form last saved or read: a newer save of someone else refuses the publish.
      await ops.publishChanges(props.entry._id, props.entry.lifeRev, form.baseRev.value, { at: ms, task: publishTask.value, timeZone: timeZone.value, main: main.value })
      publishing.value = false
      return
    }
    await ops.publishEntry(props.entry._id, props.entry.lifeRev, { at: ms, task: publishTask.value, timeZone: timeZone.value, main: main.value })
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
    if (pending.value?.publishAt !== undefined) {
      // A planned publish of unpublished changes: only the time goes, the entry stays online.
      await ops.clearChangesSchedule(props.entry._id, props.entry.lifeRev, publishTask.value)
      publishing.value = false
      return
    }
    await ops.unpublishEntry(props.entry._id, props.entry.lifeRev, { task: publishTask.value, timeZone: timeZone.value, wasLive: state.value === 'live', at: props.entry.publishAt, main: main.value })
    askUnpublish.value = false
    publishing.value = false
  } catch (error) {
    publishError.value = opErrorOf(error).message
  } finally {
    publishBusy.value = false
  }
}

const askDiscard = ref(false)
const discardBusy = ref(false)
const discardError = ref('')
/** Verwerfen: unsaved input goes too, then the saved changes; the form shows the website's version again. */
async function doDiscard() {
  if (!props.entry) return
  discardBusy.value = true
  discardError.value = ''
  try {
    form.discard()
    await ops.discardChanges(props.entry._id, props.entry.rev, props.tasks?.save)
    askDiscard.value = false
    savedOnce.value = false
  } catch (error) {
    discardError.value = opErrorOf(error).message
  } finally {
    discardBusy.value = false
  }
}
/** After a save: "Gespeichert", or for unpublished changes that they are not online yet. */
const savedText = computed(() => (pending.value ? t('entry.savedNotLive') : t('entry.saved')))
const publishQuestionText = computed(() => {
  if (!keepsChanges.value) return publishQuestion(props.brick, draft.value, main.value, t)
  return t('entry.publish.changesWhen', { title: title.value })
})

// A new entry has no address yet: the preview gives it the one the server will make from its title (draftSlugs), so
// the site finds it on its own page. Read after the typing pause, so the page does not reload on every key.
const newSlugs = computed(() => (props.entry ? undefined : draftSlugs(props.brick, props.schema.locales, typed.value)))
const previewData = computed(() => (newSlugs.value ? { ...draft.value, ...newSlugs.value } : draft.value))
/** The field with the focus (its frame carries path, type and label): the preview outlines where the page shows it. */
const focused = ref<{ path: string; type: string; label: string }>()
function onFocusIn(event: FocusEvent) {
  const frame = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-path]') : null
  if (frame?.dataset.path) focused.value = { path: frame.dataset.path, type: frame.dataset.type ?? '', label: frame.dataset.label ?? '' }
}
const previewFocus = computed(() => focused.value && { ...focused.value, text: focusText(focused.value.type, leafValue(previewData.value, focused.value.path), locale.value) })
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
/**
 * Why the preview shows no page: the entry's time is over (the site shows it no more, its page would be "not found"),
 * a new entry's address cannot be made yet, or the entry has no page in this language until it is translated.
 */
const previewNotice = computed(() => {
  const last = visibleUntil(props.brick, { ...props.entry?.data, ...typed.value })
  if (last && last < todayIn(timeZone.value)) return t('entry.preview.ended', { date: formatDay(last, format) })
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
// Preview: the entry's own page when it has one in this language, else the page that shows its brick (previewPageOf).
const previewPath = computed(() => {
  if (previewNotice.value) return undefined
  return previewUrls.value?.pages[locale.value] ?? previewPageOf(props.schema, props.brickKey, locale.value)
})

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

// The save bar sits at the bottom: while this editor is open, the layout hides the phone tab bar and the toast sits
// above the bar (its height changes with the publish panel and the notes in it).
const barEl = ref<HTMLElement>()
const { height: barHeight } = useElementSize(barEl, undefined, { box: 'border-box' })
const bottomBar = useBottomBar()
// Above 0 from mount to unmount, also before the browser first reports the bar's height, so the tab bar never flashes.
onMounted(() => { bottomBar.value ||= 1 })
watch(barHeight, (height) => { bottomBar.value = Math.max(1, Math.ceil(height)) })
onBeforeUnmount(() => { bottomBar.value = 0 })
</script>

<template>
  <div :class="['editor', split && 'is-split']" @keydown="onFormKey">
    <form
      :id="formId" ref="formEl" novalidate
      :class="['entry-form grid gap-x-10 gap-y-6', sideMode && 'has-side', split && 'px-8 pt-7 pb-12']"
      @submit.prevent="save" @focusin="onFocusIn"
    >
      <div class="main-col grid min-w-0 content-start gap-6">
        <header class="grid gap-2.5">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 class="text-xl font-semibold tracking-tight min-[900px]:text-[1.375rem]">{{ title }}</h1>
              <Badge v-if="bar && !sideMode && statusText" :variant="statusVariant">{{ statusText }}</Badge>
            </div>
            <DropdownMenu v-if="entry && !removed">
              <DropdownMenuTrigger as-child>
                <Button ref="moreButton" type="button" variant="ghost" :size="bar ? 'icon-sm' : 'default'" :aria-label="bar ? t('entry.more') : undefined" class="-mr-2 shrink-0 text-muted-foreground"><EllipsisIcon aria-hidden="true" /><template v-if="!bar">{{ t('entry.more') }}</template></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem v-if="canDuplicate" class="min-h-9 pointer-coarse:min-h-11" :disabled="duplicating" @select="duplicate">{{ t('basics.duplicate.menu') }}</DropdownMenuItem>
                <DropdownMenuItem as-child class="min-h-9 pointer-coarse:min-h-11">
                  <NuxtLink :to="`/s/${site.slug}/history?entry=${entry._id}`">{{ t('basics.history.ofEntry') }}</NuxtLink>
                </DropdownMenuItem>
                <DropdownMenuItem v-if="pending && !readOnly" class="min-h-9 pointer-coarse:min-h-11" @select="askDiscard = true">{{ t('entry.discard.menu') }}</DropdownMenuItem>
                <DropdownMenuItem v-if="canRemove && brick.kind === 'collection'" variant="destructive" class="min-h-9 pointer-coarse:min-h-11" @select="askRemove = true">{{ t('entry.removeEntry') }}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <!-- Phones and the one-column desktop form: the status under the title. The right column has its own card. -->
          <div v-if="statusText && !sideMode && !(bar && state === 'live')" class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge v-if="!bar" :variant="statusVariant" class="text-sm">{{ statusText }}</Badge>
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
          <LanguageSwitch v-if="schema.locales.length > 1" :locales="schema.locales" :model-value="locale" :gap="gapIn" :blocked="dirty" @update:model-value="switchLanguage" />
          <p v-if="foreign" class="text-sm text-muted-foreground">{{ t('entry.foreignHint') }}</p>
          <p v-for="line in translationState" :key="line" class="text-sm text-muted-foreground" data-slot="translation-state">{{ line }}</p>
        </header>

        <!-- Verwerfen asks first: the unpublished changes cannot come back. -->
        <div v-if="askDiscard && pending" class="grid gap-2.5 rounded-lg border bg-sidebar p-3.5" role="group" aria-labelledby="discard-warning">
          <p id="discard-warning">{{ t('entry.discard.warning', { title }) }}</p>
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" :disabled="discardBusy" @click="doDiscard">{{ t('entry.discard.button') }}</Button>
            <Button type="button" variant="outline" @click="askDiscard = false">{{ t('entry.cancel') }}</Button>
          </div>
          <p v-if="discardError" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ discardError }}</p>
        </div>

        <!-- Wide screens without the right column: publishing under the header (the top bar has no room for the panel). -->
        <template v-if="bar && !sideMode">
          <EntryPublishPanel
            v-if="publishing" v-model:when="when" v-model:at="at" v-model:picked="picked" :question="publishQuestionText"
            :time-zone="timeZone" :scheduled="!!scheduledAt" :busy="publishBusy || busy" :error="publishError"
            @publish="doPublish" @clear-schedule="doUnpublish" @cancel="publishing = false"
          />
          <div v-if="askUnpublish" class="grid gap-2.5 rounded-lg border bg-sidebar p-3.5">
            <p>{{ t('entry.unpublish.warning', { title }) }}</p>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" :disabled="publishBusy" @click="doUnpublish">{{ t('entry.unpublish.button') }}</Button>
              <Button type="button" variant="outline" @click="askUnpublish = false">{{ t('entry.cancel') }}</Button>
            </div>
            <p v-if="publishError" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ publishError }}</p>
          </div>
        </template>

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
        <p v-if="readOnly" class="rounded-md bg-muted px-3 py-2.5 text-muted-foreground" role="status">{{ readOnlyNote }}</p>

        <EntryFields v-bind="fieldProps" :entries="mainUngrouped" @update="setField" />
        <template v-if="tabbed">
          <Tabs v-if="mainGroups.length" v-model="activeTab">
            <!-- Underlined, so the tabs never look like the language switch above them. -->
            <TabsList class="h-auto w-full flex-wrap justify-start gap-5 rounded-none border-b bg-transparent p-0">
              <TabsTrigger v-for="g in mainGroups" :key="g.id" :value="g.id" class="-mb-px flex-none rounded-none border-0 border-b-2 border-transparent px-0 pt-1 pb-2 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent">
                {{ shown(g.label) }}
                <span v-if="groupHasIssue(g)" class="size-2 rounded-full bg-destructive" role="img" :aria-label="t('entry.groupHasIssues')" />
                <span v-if="groupHasGap(g)" class="size-2 rounded-full bg-warning" role="img" :aria-label="t('entry.groupHasGaps')" />
              </TabsTrigger>
            </TabsList>
            <TabsContent v-for="g in mainGroups" :key="g.id" :value="g.id" force-mount class="grid gap-4 pt-4 data-[state=inactive]:hidden">
              <EntryFields v-bind="fieldProps" :entries="g.fields" @update="setField" />
            </TabsContent>
          </Tabs>
        </template>
        <template v-else>
          <section v-for="g in mainGroups" :key="g.id" class="grid gap-4 border-t pt-6">
            <h2 class="text-base font-semibold">{{ shown(g.label) }}</h2>
            <EntryFields v-bind="fieldProps" :entries="g.fields" @update="setField" />
          </section>
        </template>

        <!-- Phones: the save bar. z-20: above the text toolbar (z-5) and a card's settings button (z-10) that scroll
             under it; below popovers and the docked phone bar. Wide screens: Save is in the top bar, so this bar only
             holds the notes about the entry's size and shortened texts, and shows only while it has one. -->
        <div
          ref="barEl"
          :class="['bar sticky bottom-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-background py-3', bar && !(size || shrunk.length || offline) && 'sr-only']"
        >
          <!-- The live region must be in the accessibility tree before its text appears, so empty means sr-only (no space), not hidden. -->
          <p :class="['basis-full text-sm empty:sr-only', size?.over ? 'font-medium text-destructive' : 'text-muted-foreground']" aria-live="polite">{{ size?.text }}</p>
          <p v-if="shrunk.length" id="entry-shrunk" class="basis-full text-sm text-muted-foreground">{{ shrunk.join(' ') }}</p>
          <p v-if="offline" class="basis-full text-sm font-medium text-warning" role="status">{{ t('entry.save.offlineKept') }}</p>
          <template v-if="!bar">
            <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
            <Button v-if="!readOnly" type="submit" aria-keyshortcuts="Meta+S Control+S" :aria-describedby="shrunk.length ? 'entry-shrunk' : undefined" :aria-disabled="saveBlocked ? 'true' : undefined">{{ saveLabel }}</Button>
            <Button v-if="publishable && !publishing && !removed" type="button" variant="ghost" :disabled="busy" @click="openPublish">{{ scheduledAt ? t('entry.publish.changeSchedule') : t('entry.publish.open') }}</Button>
            <template v-if="!readOnly">
              <span v-if="!dirty && waiting" class="font-medium text-warning">{{ t('history.waiting') }}</span>
              <span v-else-if="!dirty && savedOnce" class="font-medium text-success">{{ savedText }}</span>
              <!-- While a save runs the button says what happens; text typed meanwhile is "Nicht gespeichert" once it ends. -->
              <span v-else-if="dirty && !busy" class="font-medium text-warning">{{ t('entry.unsaved') }}</span>
            </template>
            <Button type="button" variant="ghost" class="ml-auto" :aria-pressed="showPreview" @click="togglePreview">{{ showPreview ? t('entry.preview.close') : t('entry.preview.label') }}</Button>
            <template v-if="drafts && entry && state === 'live' && !removed">
              <Button v-if="!askUnpublish" type="button" variant="ghost" @click="askUnpublish = true">{{ t('entry.unpublish.button') }}</Button>
              <span v-else class="flex basis-full flex-wrap items-center gap-2">
                {{ t('entry.unpublish.warning', { title }) }}
                <Button type="button" variant="destructive" :disabled="publishBusy" @click="doUnpublish">{{ t('entry.unpublish.button') }}</Button>
                <Button type="button" variant="outline" @click="askUnpublish = false">{{ t('entry.cancel') }}</Button>
              </span>
              <p v-if="publishError && askUnpublish" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ publishError }}</p>
            </template>
            <EntryPublishPanel
              v-if="publishing" v-model:when="when" v-model:at="at" v-model:picked="picked" :question="publishQuestionText"
              :time-zone="timeZone" :scheduled="!!scheduledAt" :busy="publishBusy || busy" :error="publishError"
              @publish="doPublish" @clear-schedule="doUnpublish" @cancel="publishing = false"
            />
          </template>
        </div>
      </div>

      <!-- The right column (from 1280px, preview closed): status and publishing, then the entry's address, picture and
           search fields. Inside the form, so Enter and the shortcuts work there too. -->
      <aside v-if="sideMode" class="side-col grid content-start gap-4" :aria-label="t('entry.side.label')">
        <section v-if="statusCard" class="grid gap-3 rounded-xl border bg-card p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold">{{ t('entry.side.status') }}</h2>
            <Badge v-if="statusText" :variant="statusVariant">{{ statusText }}</Badge>
          </div>
          <p v-if="statusNote" class="text-[13px] text-muted-foreground">{{ statusNote }}</p>
          <Popover v-if="entry && state !== 'live'" v-model:open="whyOpen">
            <PopoverTrigger as-child>
              <Button type="button" variant="link" class="h-auto justify-self-start px-0 text-[13px]">{{ t('basics.why.link') }}</Button>
            </PopoverTrigger>
            <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)]">
              <WhyNotPublic
                :site="site.slug" :entry="entry._id" :locale="locale" :time-zone="timeZone" :main="main"
                @publish="whyOpen = false; openPublish()" @restore="whyOpen = false; ops.restoreEntry(entry._id, entry.lifeRev, tasks?.remove)" @translate="whyOpen = false; switchLanguage($event)"
              />
            </PopoverContent>
          </Popover>
          <EntryPublishPanel
            v-if="publishing" v-model:when="when" v-model:at="at" v-model:picked="picked" :question="publishQuestionText"
            :time-zone="timeZone" :scheduled="!!scheduledAt" :busy="publishBusy || busy" :error="publishError"
            @publish="doPublish" @clear-schedule="doUnpublish" @cancel="publishing = false"
          />
          <div v-else-if="!removed" class="flex flex-wrap gap-2">
            <Button v-if="publishable" type="button" variant="outline" size="sm" :disabled="busy" @click="openPublish">{{ scheduledAt ? t('entry.publish.changeSchedule') : t('entry.publish.open') }}</Button>
            <Button v-if="drafts && entry && state === 'live' && !askUnpublish" type="button" variant="ghost" size="sm" class="text-muted-foreground" @click="askUnpublish = true">{{ t('entry.unpublish.button') }}</Button>
          </div>
          <div v-if="askUnpublish" class="grid gap-2.5 border-t pt-3">
            <p class="text-sm">{{ t('entry.unpublish.warning', { title }) }}</p>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" size="sm" :disabled="publishBusy" @click="doUnpublish">{{ t('entry.unpublish.button') }}</Button>
              <Button type="button" variant="outline" size="sm" @click="askUnpublish = false">{{ t('entry.cancel') }}</Button>
            </div>
            <p v-if="publishError" class="rounded-md bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive" role="alert">{{ publishError }}</p>
          </div>
        </section>
        <section v-if="sideImage || sideSlug.length" class="grid gap-5 rounded-xl border bg-card p-4">
          <EntryFields v-if="sideImage" v-bind="fieldProps" :entries="[sideImage]" @update="setField" />
          <EntryFields v-if="sideSlug.length" v-bind="fieldProps" :entries="sideSlug" @update="setField" />
        </section>
        <section v-for="g in sideGroups" :key="g.id" class="grid gap-4 rounded-xl border bg-card p-4">
          <h2 class="text-sm font-semibold">{{ shown(g.label) }}</h2>
          <EntryFields v-bind="fieldProps" :entries="g.fields" @update="setField" />
        </section>
      </aside>
    </form>

    <!-- Wide screens: the save state, Preview and Save in the panel's top bar. Save submits the form by its id. -->
    <Teleport v-if="bar" to="#studio-actions">
      <span v-if="!readOnly" class="text-sm font-medium" aria-live="polite">
        <span v-if="!dirty && waiting" class="text-warning">{{ t('history.waiting') }}</span>
        <span v-else-if="!dirty && savedOnce" class="text-success">{{ savedText }}</span>
        <span v-else-if="dirty && !busy" class="inline-flex items-center gap-1.5 text-warning"><span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />{{ t('entry.unsaved') }}</span>
      </span>
      <Button type="button" :variant="showPreview ? 'secondary' : 'ghost'" class="h-9 gap-2 px-3" :aria-pressed="showPreview" @click="togglePreview">
        <component :is="showPreview ? EyeOffIcon : EyeIcon" aria-hidden="true" />{{ showPreview ? t('entry.preview.close') : t('entry.preview.label') }}
      </Button>
      <Button v-if="publishable && !publishing && !removed && !sideMode" type="button" variant="outline" class="h-9" :disabled="busy" @click="openPublish">{{ scheduledAt ? t('entry.publish.changeSchedule') : t('entry.publish.open') }}</Button>
      <Button v-if="drafts && entry && state === 'live' && !removed && !sideMode && !askUnpublish" type="button" variant="ghost" class="h-9 text-muted-foreground" @click="askUnpublish = true">{{ t('entry.unpublish.button') }}</Button>
      <Button v-if="!readOnly" type="submit" :form="formId" class="h-9" aria-keyshortcuts="Meta+S Control+S" :aria-describedby="shrunk.length ? 'entry-shrunk' : undefined" :aria-disabled="saveBlocked ? 'true' : undefined">{{ saveLabel }}</Button>
    </Teleport>

    <!-- The destructive action sits in "Mehr", away from Speichern and Vorschau; the question stays. -->
    <EntryRemoveDialog v-model:open="askRemove" :slug="site.slug" :title="title" :uses="removeUses.error.value ? [] : removeUses.data.value" :overflow="removeOverflow.error.value ? [] : removeOverflow.data.value" :busy="removing" :draft="entry?.state === 'draft'" @confirm="remove" @close-auto-focus="focusMore" />

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
      :docked="split"
      :focus="previewFocus"
      @close="togglePreview"
    />
  </div>
</template>

<style scoped>
/* One column: the form keeps a readable width, centred like every page frame (StudioPage). With the right column:
   form and an 18rem column. */
.entry-form { max-width: 45rem; margin-inline: auto; }
.entry-form.has-side { max-width: 72rem; grid-template-columns: minmax(0, 1fr) 18rem; align-items: start; }
.editor > .preview-col { margin-top: 1.5rem; height: 80dvh; }
/* Wide screens with the preview open: form and preview share the panel, the preview flush with its edges. */
@media (min-width: 900px) {
  .editor.is-split { display: grid; grid-template-columns: minmax(24rem, 40rem) minmax(0, 1fr); align-items: start; }
  /* No auto margins here: in a grid cell they shrink the form to its content. */
  .editor.is-split .entry-form { max-width: none; margin-inline: 0; }
  .editor.is-split > .preview-col {
    margin-top: 0; position: sticky; top: var(--studio-header-height);
    height: calc(100dvh - var(--studio-header-height) - 0.75rem);
  }
}
/* The save bar keeps clear of the home indicator. */
.bar { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
</style>
