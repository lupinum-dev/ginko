<!-- The task form (UI.md 3.1, 3.2): only the task's fields, prefilled by the server, saved with one
     opId per attempt. Conflicts keep the person's input and show the new state next to it. On a site
     with more languages, a switch shows the texts to translate; one Speichern stores every language. The person's own
     proposal on the entry (SPEC 17) is where an edit starts while it waits; a rejected one can be reopened. A create task
     on a collection with drafts ends in a publish step (TEMPLATES 7.3): Veröffentlichen, Als Entwurf speichern, Später veröffentlichen. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick, Json, Label as LabelText, Locale } from '@lupinum/ginko'
import { defaultsFor, isShown, leavesOf, stableJson, weeklyTask, type Schema } from '@lupinum/ginko/internal'
import { textIn, TRANSLATION } from '@lupinum/ginko-editor'
import GinkoField from './fields/GinkoField.vue'
import LanguageSwitch from './LanguageSwitch.vue'
import EntryGoneBanner from './EntryGoneBanner.vue'
import LocalDraftOffer from './LocalDraftOffer.vue'
import ConflictPanel from './ConflictPanel.vue'
import ScheduleField from './ScheduleField.vue'
import ProposalWithdraw from './ProposalWithdraw.vue'
import { provideSiteRefs } from '../composables/useSiteRefs'
import { Button } from '@studio/components/ui/button'
import { XIcon } from '@lucide/vue'
import { ConfigProvider, injectConfigProviderContext } from 'reka-ui'
import { PROBLEM, SHEET_DIALOG } from '../utils/sheetDialog'
import type { Entry } from '../composables/useSiteData'
import { formatDay, hasTranslation, hidesUntranslated, languageName, leafTranslation, leafValue, taskFields, taskRef, titleOf, weekShortcuts, type Data, type Task } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { opErrorOf } from '../composables/useOps'
import { isModKey } from '../utils/keys'
import { shrunkHint, shrunkTexts } from '../utils/shrunk'
import { refDebounced } from '@vueuse/core'
import { msToZoned, scheduleProblem, whenFull } from '../utils/when'
import { whoText } from '../utils/who'

const props = defineProps<{
  site: string
  brickKey: string
  brick: Brick
  task: Task
  /** The entry an `edit` task changes (singles: their one entry; pick tasks: the chosen one). */
  entry?: Entry
  main: Locale
  locales: readonly Locale[]
  /** The brick's remove task, so the person can undo a creation (staff need the grant). */
  removeTask?: Task
  /** Someone removed `entry` while the sheet was open (useKeptEntry): the input stays, the banner offers a way out. */
  removed?: boolean
  /** The person may restore a removed entry (owners, admins, staff with the remove task). */
  mayRestore?: boolean
  /** The titles of the brick's current entries, to point out a new one that already exists. */
  existing?: string[]
  /** The site's schema, so ref fields can list the entries they point to. */
  schema: Schema
  /** A create task that plans a week ahead: the entry the website shows this week, to start from ("Von dieser Woche übernehmen"). */
  copyFrom?: string
  /** Opened to fix this rejected own proposal ("Korrigieren"): the form starts from its values. */
  reopen?: string
  /** The person is staff and the task needs approval (SPEC 17): what goes live waits for a yes, so the primary button sends it for review. */
  approval?: boolean
}>()
const emit = defineEmits<{ close: [] }>()
const { t, format, locale: uiLocale } = useI18n()
const shown = (label: LabelText) => shownLabel(label, props.main)

provideSiteRefs(() => props.site, () => props.schema, () => props.main)
const fields = computed(() => taskFields(props.brick, props.task))
const isCreate = computed(() => props.task.kind === 'create')
const ref_ = computed(() => taskRef(props.brickKey, props.task))
/** The weekly task ("Mittagsmenü dieser Woche") always covers this week: its week is shown, not asked (the server holds it to that). */
const fixedWeek = computed(() => {
  const weekly = weeklyTask(props.brick)
  return weekly?.task.id === props.task.id ? weekly.field : undefined
})
const dayText = (value: Json | undefined) => (typeof value === 'string' ? formatDay(value, format) : '–')

const form = useEntryForm({
  site: computed(() => props.site),
  brickKey: () => props.brickKey,
  brick: () => props.brick,
  fields: () => fields.value,
  // A create task makes a new entry even when one is passed.
  entry: () => (isCreate.value ? undefined : props.entry),
  main: () => props.main,
  timeZone: () => props.schema.timeZone,
  // Every language in one save (the switch below); local copies stay with the main language and hold whole values.
  locale: () => props.main,
  allLanguages: true,
  task: () => ref_.value,
  removeTask: () => (props.removeTask ? taskRef(props.brickKey, props.removeTask) : undefined),
  draft: () => !isCreate.value && props.entry?.state === 'draft',
  removed: () => !isCreate.value && !!props.removed,
})
const { draft, baseline, initial, ready, issues, problem, conflict, busy, offline, waiting, dirty, localOffer } = form
/** The form holds the values of an own proposal, not the stored ones. */
const fromProposal = ref(false)
/** The week an own proposal the form started from was made for, when it sent one (the weekly task keeps this week). */
const proposalWeek = ref<Json>()
/**
 * The weekly task opened on days of an older week: the stored ones, or those of an own proposal made in an older week
 * and still waiting. A rushed save would publish them as this week's.
 */
const oldWeek = computed(() => {
  const key = fixedWeek.value
  if (!key || !ready.value) return undefined
  const source = (fromProposal.value ? proposalWeek.value : undefined) ?? props.entry?.data[key]
  return typeof source === 'string' && source !== draft.value[key] ? source : undefined
})

// Prefill (SPEC 2.7): stored values of the task's fields, then the task's preset, resolved on the server. It seeds
// the form once, so it is asked for only until the form has loaded: a later run (every save on the site starts one)
// can no longer fail into the open form. Later server changes reach the form through `entry` (useEntryForm).
const retrying = ref(false)
const prefillArgs = computed(() => (ready.value || retrying.value ? 'skip' : { site: props.site, task: ref_.value, ...(props.entry && !isCreate.value ? { entry: props.entry._id } : {}) }))
const { data: prefill, error: prefillError } = useConvexQuery(api.tasks.prefill, prefillArgs, { server: false })

// The person's own proposal on the entry through this task (proposals.ownFor): an open one is where the form starts,
// so sending again replaces it with what they see; a rejected one can be reopened to fix it.
const ownArgs = () => (props.entry && !isCreate.value ? { site: props.site, entry: props.entry._id } : 'skip' as const)
const { data: own, error: ownError } = useConvexQuery(api.proposals.ownFor, ownArgs, { server: false })
const mine = computed(() => (own.value && own.value.task === ref_.value ? own.value : null))
/** The proposal's values of this task's fields; the weekly task keeps this week. */
const proposedValues = (o: NonNullable<typeof mine.value>): Data =>
  Object.fromEntries(Object.entries(o.fields as Data).filter(([k]) => Object.hasOwn(fields.value, k) && k !== fixedWeek.value))
/** Starts the form from an own proposal's values over `start`. */
function loadProposal(start: Data, o: NonNullable<typeof mine.value>) {
  form.load({ ...start, ...proposedValues(o) })
  fromProposal.value = true
  proposalWeek.value = fixedWeek.value ? (o.fields as Data)[fixedWeek.value] : undefined
}

// The values the form started from (the prefill, plus the schema defaults of a new entry). The prefill query is skipped
// once the form has loaded, so reopenOwn and the `mine` watch below cannot read `prefill`. The seed is frozen, so they
// read `startValues()`: the live stored values under the seed's preset.
const seed = shallowRef<Data>()
/** The fields whose seed differs from what the entry stored at load: the task's preset (or schema default) set them. */
const presetKeys = new Set<string>()
/** What an untouched form shows now: the live entry's values, except the fields the task presets, which keep the preset. */
function startValues(): Data {
  const start = { ...seed.value }
  if (isCreate.value || !props.entry) return start
  for (const k of Object.keys(fields.value)) {
    if (presetKeys.has(k)) continue
    const stored = props.entry.data[k]
    if (stored === undefined) delete start[k]
    else start[k] = stored
  }
  return start
}
watch([prefill, own, ownError], ([p]) => {
  // Both answers first, so the form does not start on the stored values and jump; a failed proposal read does not hold it up.
  if (!p || ready.value || (ownArgs() !== 'skip' && own.value === undefined && !ownError.value)) return
  // A new entry starts from the schema defaults; choices without a default stay unset on purpose (UI.md 5).
  const start: Data = isCreate.value ? { ...defaultsFor(fields.value) } : {}
  const o = mine.value
  seed.value = { ...start, ...(p as Data) }
  presetKeys.clear()
  if (props.entry && !isCreate.value) for (const k of Object.keys(fields.value)) if (stableJson(seed.value[k] ?? null) !== stableJson(props.entry.data[k] ?? null)) presetKeys.add(k)
  // An open proposal that no longer fits (someone changed its fields since) is not where the form starts: its banner says so.
  if (o && ((o.status === 'open' && o.fits) || o.proposal === props.reopen)) loadProposal(seed.value, o)
  else form.load(seed.value)
}, { immediate: true })
/** A refusal the server names keeps its own text; anything else (the connection) says it did not load. */
const prefillProblem = computed(() => (prefillError.value ? opErrorOf(prefillError.value, t('basics.notLoaded')).message : ''))
/**
 * "Erneut versuchen": Convex keeps one subscription per query and arguments, and only this sheet asks for this
 * prefill, so dropping it for a tick and asking again makes the server run it again (better-convex has no retry on
 * purpose). Not a reload: the page behind the sheet may hold input of its own.
 */
async function retry() {
  retrying.value = true
  await nextTick()
  retrying.value = false
}

// Languages (UI.md 3.1): the sheet opens in the main language with every field of the task. Another language shows the
// texts to translate; German input made there still counts and is saved with the rest.
const lang = ref<Locale>(props.main)
const foreign = computed(() => lang.value !== props.main)
const toTranslate = computed(() => Object.fromEntries(Object.entries(fields.value).filter(([, field]) => hasTranslation(field))))
const shownFields = computed(() => (foreign.value ? toTranslate.value : fields.value))
const multilingual = computed(() => props.locales.length > 1 && Object.keys(toTranslate.value).length > 0)
/** Input still waiting in an editor's pause goes into the language it was typed in. */
async function switchLanguage(next: Locale) {
  if (next === lang.value) return
  await form.flush()
  lang.value = next
}
/** The entry's name for the hints: what is typed, over the stored entry an edit task changes. */
const entryName = () => titleOf(props.brick, { ...(isCreate.value ? {} : props.entry?.data), ...draft.value }, props.main)
const textsAt = (data: Data, leaf: string) => {
  const value = leafValue(data, leaf)
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}
/**
 * A text's state in language `l` once saved: missing, or outdated when its main text changed here while its text in `l`
 * stayed (the save keeps that translation, made from the old main text). A text typed here counts as current.
 */
function stateIn(leaf: string, l: Locale): 'missing' | 'stale' | 'fine' {
  const now = textsAt(draft.value, leaf)
  const was = textsAt(baseline.value, leaf)
  const changed = (locale: Locale) => stableJson(now?.[locale] ?? null) !== stableJson(was?.[locale] ?? null)
  const state = leafTranslation({ draft: now, locale: l, main: props.main, storedMain: undefined, storedForeign: undefined, print: undefined, confirmed: false })
  return state === 'fine' && now?.[l] && changed(props.main) && !changed(l) ? 'stale' : state
}
/** A dot on a language whose texts are missing or outdated (the fields shown, as the switch shows them). */
const gapIn = (l: Locale) => l !== props.main && Object.entries(toTranslate.value).some(([key, field]) => isShown(field, draft.value)
  && [...leavesOf(field, draft.value[key], key).keys()].some((leaf) => stateIn(leaf, l) !== 'fine'))
// The sheet's own translation view: the German as typed here as the source, and no "Englisch stimmt noch" (the sheet saves every
// language at once; an outdated translation is confirmed in Alles bearbeiten, in its own language).
provide(TRANSLATION, {
  state: (leaf) => (foreign.value ? stateIn(leaf, lang.value) : undefined),
  source: (leaf) => textIn(leafValue(draft.value, leaf), props.main),
  mainName: () => languageName(props.main, uiLocale.value),
  hiddenWithout: (leaf) => (hidesUntranslated(props.brick, leaf) ? { title: entryName(), language: languageName(lang.value, uiLocale.value) } : undefined),
})

/** Long texts that lost most of their length (a slip, or a rewrite): a hint, never a block. After the typing pause, as in Alles bearbeiten. */
const typed = refDebounced(draft, 300)
const shrunk = computed(() => (dirty.value ? shrunkTexts(fields.value, baseline.value, typed.value, props.main).map((s) => shrunkHint(s, shown(fields.value[s.key]!.label), { t, format })) : []))

// "Zurückziehen" (here or in Verlauf), a decision, or a change that makes it no longer fit ends the open proposal the
// untouched form shows (it started from it, or just sent it): the form goes back to the stored values, so nothing
// suggests the old ones are on their way and Speichern does not send them again. Typed input stays.
const startable = (o: typeof mine.value) => o?.status === 'open' && o.fits
watch(mine, (now, before) => {
  if (!(fromProposal.value || waiting.value) || !startable(before) || startable(now) || dirty.value || !seed.value) return
  form.load(startValues())
  fromProposal.value = false
})
/**
 * The line of an open own proposal: it waits and Speichern replaces it; it no longer fits; or the input is back at the
 * stored values, so Speichern has nothing to send and only Zurückziehen drops it.
 */
const pendingText = computed(() => {
  const o = mine.value
  if (o?.status !== 'open') return ''
  const key = !o.fits ? 'entry.pendingStale' : form.changed.value.length ? 'entry.pending' : 'entry.pendingSame'
  return t(key, { when: whenFull(o.createdAt, props.schema.timeZone, format) })
})

/** "Deinen Vorschlag wieder öffnen": the rejected values, to fix what the approver asked for. */
function reopenOwn() {
  if (!mine.value || !seed.value) return
  loadProposal(startValues(), mine.value)
}

// "Von dieser Woche übernehmen": a new planned week starts from this week's days and note, its own week stays. The
// copied values are the form's start, so a dish changed without its allergens asks "Noch richtig?" like an edit does.
const convex = useConvex()
const copying = ref(false)
const copied = ref(false)
async function copyThisWeek() {
  const plans = props.brick.kind === 'collection' ? props.brick.plans : undefined
  const weekly = plans && Object.hasOwn(props.schema.bricks, plans.brick) ? weeklyTask(props.schema.bricks[plans.brick]!) : undefined
  if (!props.copyFrom || !plans || !weekly || weekly.task.kind !== 'edit') return
  copying.value = true
  try {
    // Slim rows have no lists: the source is read whole.
    const source = await convex.query(api.entries.get, { site: props.site, entry: props.copyFrom })
    if (!source || source.deleted) return
    const keys = weekly.task.fields.filter((k) => k !== weekly.field && k !== plans.field && Object.hasOwn(fields.value, k))
    const week: Data = {}
    for (const k of keys) if (source.data[k] !== undefined) week[k] = source.data[k]
    form.load({ ...draft.value, ...week })
    copied.value = true
  } catch (e) {
    problem.value = opErrorOf(e).message
  } finally {
    copying.value = false
  }
}

/** A new entry with the same name as one that is already there (e.g. a second "Heute ausgebucht"). */
const twin = computed(() => {
  if (!isCreate.value || !props.existing?.length) return undefined
  const mine = titleOf(props.brick, draft.value, props.main).trim().toLowerCase()
  return props.existing.find((title) => title.trim().toLowerCase() === mine)
})

const confirmClose = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
// The sheet is a modal <dialog> in the browser's top layer: anything rendered into <body> lies beneath it, unseen and
// out of reach. So every reka portal in the sheet (lists, menus, popovers, tooltips, the library picker; node views
// too, through EditorContent) and the slash menu render into the <dialog> instead, next to the <form>, never inside it.
// A nested ConfigProvider replaces the whole context: pass on what app.vue sets (today only useId).
const reka = injectConfigProviderContext({})
onMounted(() => dialog.value?.showModal())
/**
 * The view that shows an issue: a text in another language there (`name.en`, `days.<rowId>.dish.en`, `image.alt.en`),
 * anything else in the main language, which shows every field (`name.de`, a list column such as `exceptions.<rowId>.when`).
 */
function viewOf(path: string): Locale {
  const other = props.locales.find((l) => l !== props.main && path.endsWith(`.${l}`))
  return other && Object.hasOwn(toTranslate.value, path.split('.')[0]!) ? other : props.main
}
/** Each view marks only its own issues: a German error never sits on the English input, nor the other way round. */
const shownIssues = computed(() => issues.value.filter((issue) => viewOf(issue.path) === lang.value))
watch(issues, (list) => {
  if (!list.length) return
  // The view of the errors; with errors in several, the main language first (fixing a text there clears its others).
  const views = new Set(list.map((issue) => viewOf(issue.path)))
  lang.value = views.size === 1 ? [...views][0]! : props.main
  nextTick(() => dialog.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
})

// Closed while a save was still on its way (offline): the save goes on, and its outcome still reaches the person.
const { show } = useToast()
let leftWhileSaving = false
async function finish(ok: boolean) {
  if (leftWhileSaving) {
    if (!ok) show(problem.value ? t('entry.notSaved', { reason: problem.value }) : t('entry.notSavedReopen'), { tone: 'err' })
    return
  }
  // A proposal keeps the sheet open with the person's input and the waiting line; the toast already said where it went.
  if (ok && !dirty.value && !waiting.value) emit('close')
}
// The publish step (TEMPLATES 7.3): a create task on a collection with drafts asks what happens to the new entry.
const publishStep = computed(() => isCreate.value && props.brick.kind === 'collection' && props.brick.drafts === true)
const later = ref(false)
const at = ref('')
/** The instant `at` names (ScheduleField); undefined while it names none or two. */
const picked = ref<number>()
const laterProblem = ref('')
const HOUR = 60 * 60 * 1000
/** "Später veröffentlichen" opens the date and time, suggested as tomorrow 9:00 at the site, like the publish panel of Alles bearbeiten. */
function toggleLater() {
  later.value = !later.value
  laterProblem.value = ''
  if (later.value && !at.value) at.value = `${msToZoned(Date.now() + 24 * HOUR, props.schema.timeZone).slice(0, 10)}T09:00`
  if (later.value) nextTick(() => document.getElementById('sheet-publish-at')?.focus())
}
/** What a save does with the new entry: `publish` goes online now (or waits for a yes), `draft` stays off the website, `later` is planned. */
type Step = 'publish' | 'draft' | 'later'
async function save(step: Step = 'publish') {
  // The save button is only aria-disabled (below), so a keyboard press still lands here.
  if (busy.value || !ready.value || removedHere.value) return
  laterProblem.value = ''
  let publish: { at?: number } | undefined
  if (publishStep.value && step !== 'draft') {
    if (step === 'later') {
      const problem = scheduleProblem(at.value, props.schema.timeZone, picked.value, Date.now())
      if (problem) {
        if (problem !== 'entry.publish.timeMissing') laterProblem.value = t(problem)
        return
      }
      publish = { at: picked.value }
    } else publish = {}
  }
  if (form.blockers.size) {
    // "Noch richtig?" asks about the choices next to a changed German text, which only the main language shows.
    await switchLanguage(props.main)
    nextTick(() => dialog.value?.querySelector<HTMLElement>('.check button')?.focus())
  }
  await finish(await form.save(undefined, publish))
}
/** Cmd/Ctrl+S anywhere in the sheet's form saves like the button, never the browser's "Save page as". */
function onFormKey(event: KeyboardEvent) {
  if (!isModKey(event, 's')) return
  event.preventDefault()
  // Asked "Änderungen verwerfen?": saving is the clear answer, so the question goes and the save runs.
  confirmClose.value = false
  // On the publish step the key keeps the entry off the website: nobody publishes by pressing Ctrl+S.
  save(publishStep.value ? 'draft' : 'publish')
}
async function keepMine() {
  await finish(await form.keepMine())
}
async function keepBoth() {
  await finish(await form.mergeLists())
}
// Someone removed the entry (N1): bring it back and save the input, or drop it.
const removedHere = computed(() => !isCreate.value && !!props.removed && !!props.entry)
async function restoreRemoved(lifeRev: number) {
  const typed = dirty.value
  const ok = await form.restoreAndSave(lifeRev, props.removeTask ? taskRef(props.brickKey, props.removeTask) : undefined)
  // Without input the sheet stays open on the restored entry; with input it closes like after Speichern.
  if (typed) await finish(ok)
}
/** Closed while a save is on its way: the save goes on, and a failure still says so (finish). */
function leaveWhileSaving() {
  leftWhileSaving = true
  show(t('entry.saveContinues'))
  emit('close')
}
function requestClose() {
  // A save on its way cannot be taken back by closing; say so instead of offering "Verwerfen" (break-it 9).
  if (busy.value) return leaveWhileSaving()
  // A removed entry: the input stays on this device (the banner says so and has its own "Verwerfen").
  if (dirty.value && !confirmClose.value && !removedHere.value) {
    confirmClose.value = true
    return
  }
  emit('close')
}
/** "Verwerfen" (after "Änderungen verwerfen?", or on a removed entry): the input goes, and so does its local copy. */
function discardAndClose() {
  form.discard()
  emit('close')
}
/** The browser closed the dialog itself (a second back gesture it no longer lets the page refuse): nothing can ask first. */
function onBrowserClose() {
  if (busy.value) return leaveWhileSaving()
  emit('close')
}
/** A close request that is not the Escape key (Android's back gesture): the same guard. */
function onCancel(event: Event) {
  event.preventDefault()
  requestClose()
}
// Escape is the sheet's own key and never becomes the browser's close request: that request asked about discarding
// while only a list was being closed, and Chrome lets a page refuse it just once per user activation, after which the
// <dialog> closed under a sheet the app still held open. On the document, so a key pressed with focus on <body> counts.
function onKeydown(event: KeyboardEvent) {
  // Taken already: the component-block keymap, the find bar, the slash menu.
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
  // A list, popover or picker in the sheet closes first (Escape closes the innermost layer). reka closes it in a window
  // listener that runs after this one and skips a cancelled key, so the key is cancelled after reka's turn; cancelled
  // it must be, or the browser also asks the dialog to close.
  if (dialog.value?.querySelector('[data-dismissable-layer]:not([data-state="closed"])')) {
    window.addEventListener('keydown', (later) => { if (later === event) later.preventDefault() }, { once: true })
    return
  }
  event.preventDefault()
  requestClose()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <dialog ref="dialog" :class="SHEET_DIALOG" aria-labelledby="sheet-title" @cancel="onCancel" @close="onBrowserClose">
    <ConfigProvider :teleport-to="dialog ?? undefined" :use-id="reka.useId">
      <form class="grid h-[inherit] max-h-[inherit] grid-rows-[auto_1fr_auto]" novalidate @submit.prevent="save(publishStep ? 'draft' : 'publish')" @keydown="onFormKey">
        <header class="flex items-start justify-between gap-3 border-b bg-card pt-4 pb-3 pr-3 pl-5">
          <div class="grid min-w-0 gap-2">
            <div>
              <h2 id="sheet-title" class="text-lg font-semibold">{{ shown(task.label) }}</h2>
              <p v-if="entry && brick.kind === 'collection'" class="mt-0.5 text-sm text-muted-foreground">{{ titleOf(brick, entry.data, main) }}</p>
            </div>
            <LanguageSwitch v-if="ready && multilingual" class="justify-self-start" :locales="locales" :model-value="lang" :gap="gapIn" @update:model-value="switchLanguage" />
          </div>
          <Button type="button" variant="ghost" size="icon" class="flex-none rounded-full" :aria-label="t('entry.close')" @click="requestClose">
            <XIcon aria-hidden="true" />
          </Button>
        </header>

        <div class="grid content-start gap-5 overflow-auto px-5 pt-[18px] pb-6">
          <template v-if="!ready">
            <template v-if="prefillError">
              <p :class="PROBLEM" role="alert">{{ prefillProblem }}</p>
              <Button type="button" variant="outline" class="justify-self-start" @click="retry">{{ t('basics.retry') }}</Button>
            </template>
            <p v-else class="text-muted-foreground">{{ t('entry.loading') }}</p>
          </template>
          <template v-else>
            <EntryGoneBanner
              v-if="removedHere && entry"
              :site="site" :brick-key="brickKey" :entry="entry" :dirty="dirty" :busy="busy" :may-restore="!!mayRestore"
              @restore="restoreRemoved" @discard="discardAndClose"
            />
            <LocalDraftOffer v-if="localOffer" :saved-at="localOffer.savedAt" :busy="busy" @restore="form.restoreLocal()" @discard="form.dropLocal()" />
            <ConflictPanel
              v-if="conflict"
              :conflict="conflict" :draft="draft" :baseline="baseline" :fields="brick.fields" :locale="main" :main="main"
              :can-keep-both="!!form.listMerge.value"
              @keep-mine="keepMine" @take-theirs="form.takeTheirs()" @keep-both="keepBoth"
            />
            <div v-if="mine?.status === 'open'" class="flex flex-wrap items-center justify-between gap-x-3 rounded-md bg-warning/10 py-1 pr-1 pl-3" role="status" data-test="own-proposal">
              <p class="py-1.5 font-semibold text-warning">{{ pendingText }}</p>
              <ProposalWithdraw :proposal="mine.proposal" />
            </div>
            <div v-else-if="mine?.status === 'rejected'" class="grid gap-2 rounded-md bg-warning/10 px-3 py-2.5" data-test="own-proposal">
              <p class="font-semibold text-warning [overflow-wrap:anywhere]">{{ t('history.rejectedBy', { who: mine.decidedBy ? whoText(mine.decidedBy, t) : t('who.member'), reason: mine.reason ?? '' }) }}</p>
              <Button v-if="!fromProposal && !dirty" type="button" variant="outline" size="sm" class="justify-self-start" @click="reopenOwn">{{ t('entry.reopenProposal') }}</Button>
            </div>
            <p v-if="problem" :class="PROBLEM" role="alert">{{ problem }}</p>
            <p v-if="twin" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning">{{ t('entry.twin', { title: twin }) }}</p>
            <p v-if="oldWeek" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning">{{ t('entry.oldWeek', { date: formatDay(oldWeek, format) }) }}</p>
            <!-- Like "Deinen Vorschlag wieder öffnen" above, it replaces the form's values: offered only before anything is typed. -->
            <Button v-if="isCreate && copyFrom && !copied && !dirty" type="button" variant="outline" class="justify-self-start" :disabled="copying" @click="copyThisWeek">{{ t('entry.copyThisWeek') }}</Button>
            <p v-if="foreign" class="text-sm text-muted-foreground">{{ t('entry.foreignHint') }}</p>
            <template v-for="(field, key) in shownFields" :key="`${lang}:${key}`">
              <div v-if="key === fixedWeek" class="grid gap-1" data-slot="field" data-test="fixed-week">
                <p class="text-sm font-medium">{{ shown(field.label) }}</p>
                <p class="font-semibold">{{ dayText(draft[key]) }}</p>
                <p class="text-sm text-muted-foreground">{{ t('entry.weekFixed') }}</p>
              </div>
              <GinkoField
                v-else
                v-show="isShown(field, draft)"
                :field="field"
                :model-value="draft[key]"
                :baseline="isCreate ? initial[key] : baseline[key]"
                :weeks="weekShortcuts(brick, String(key))"
                :path="String(key)"
                :locale="lang"
                :locales="locales"
                :issues="shownIssues"
                @update:model-value="form.setField(String(key), $event)"
              />
            </template>
          </template>
        </div>

        <footer class="flex flex-wrap items-center gap-2 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <p v-if="waiting && !dirty && !confirmClose && mine?.status !== 'open'" class="basis-full font-medium text-warning" role="status">{{ t('history.waiting') }}</p>
          <p v-if="offline" class="basis-full text-sm font-medium text-warning" role="status">{{ t('entry.save.offlineKept') }}</p>
          <template v-if="confirmClose">
            <p class="basis-full font-semibold" role="alert">{{ t('entry.discard.question') }}</p>
            <Button type="button" variant="destructive" @click="discardAndClose">{{ t('entry.discard.confirm') }}</Button>
            <Button type="button" variant="outline" @click="confirmClose = false">{{ t('entry.discard.keepEditing') }}</Button>
          </template>
          <template v-else>
            <p v-if="shrunk.length" id="sheet-shrunk" class="basis-full text-sm text-muted-foreground">{{ shrunk.join(' ') }}</p>
            <div v-if="publishStep && later" class="grid basis-full gap-2" data-test="publish-later" @keydown.enter.prevent="save('later')">
              <label for="sheet-publish-at" class="text-sm font-medium">{{ t('entry.publish.dateTime') }}</label>
              <ScheduleField v-model:local="at" v-model:picked="picked" :zone="schema.timeZone" input-id="sheet-publish-at" />
              <p v-if="laterProblem" class="text-sm font-medium text-destructive" role="alert">{{ laterProblem }}</p>
            </div>
            <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
            <!-- On the publish step only a press on this button publishes (Enter in a field saves a draft, like Ctrl+S); with the time open it plans instead, so there is one primary per state. -->
            <Button :type="publishStep ? 'button' : 'submit'" class="flex-1" aria-keyshortcuts="Meta+S Control+S" :aria-describedby="shrunk.length ? 'sheet-shrunk' : undefined" :aria-disabled="busy || !ready || removedHere ? 'true' : undefined" @click="publishStep && save(later ? 'later' : 'publish')">{{ busy ? (offline ? t('entry.save.waiting') : t('entry.save.saving')) : publishStep ? (approval ? t('entry.publish.review') : later ? t('entry.publish.schedule') : t('entry.publish.go')) : t('entry.save.save') }}</Button>
            <template v-if="publishStep">
              <Button type="button" variant="outline" :aria-disabled="busy || !ready || removedHere ? 'true' : undefined" @click="save('draft')">{{ t('entry.publish.asDraft') }}</Button>
              <Button type="button" variant="outline" :aria-expanded="later" @click="toggleLater">{{ t('entry.publish.laterOpen') }}</Button>
            </template>
            <Button type="button" variant="ghost" @click="requestClose">{{ t('entry.cancel') }}</Button>
          </template>
        </footer>
      </form>
    </ConfigProvider>
  </dialog>
</template>
