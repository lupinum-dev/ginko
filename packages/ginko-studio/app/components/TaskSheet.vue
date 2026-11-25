<!-- The task form (UI.md 3.1, 3.2): only the task's fields, prefilled by the server, saved with one
     opId per attempt. Conflicts keep the person's input and show the new state next to it. On a site
     with more languages, a switch shows the texts to translate; one Speichern stores every language. The person's own
     proposal on the entry (SPEC 17) is where an edit starts while it waits; a rejected one can be reopened. A create task
     ends in a publish step (TEMPLATES 7.3): Veröffentlichen, Als Entwurf speichern, Später veröffentlichen. An edit of a
     live entry offers Veröffentlichen (only its fields go online) and Speichern (they wait unpublished, SPEC 15). A task
     with `when: { from: 'ask' }` adds "Gilt ab" under its fields: a day makes the save a dated change (D125, D131).
     With `until: 'ask'` it adds "Gilt bis" too, and every save is an exception for those days (slice 3); a task with
     `when: { from: '@today', until: '@today' }` shows no field, only its fixed values and one button for today. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Brick, Json, Label as LabelText, Locale } from '@lupinum/ginko'
import { addDays, defaultsFor, isShown, leavesOf, NAME_MAX, stableJson, taskAsks, taskEnds as endsByThemselves, todayIn, weeklyTask, yearTooLong, leapDayAlone, type Schema } from '@lupinum/ginko/internal'
import { textIn, TRANSLATION, useToday } from '@lupinum/ginko-editor'
import GinkoField from './fields/GinkoField.vue'
import LanguageSwitch from './LanguageSwitch.vue'
import EntryGoneBanner from './EntryGoneBanner.vue'
import LocalDraftOffer from './LocalDraftOffer.vue'
import ConflictPanel from './ConflictPanel.vue'
import ScheduleField from './ScheduleField.vue'
import StartsOnField from './StartsOnField.vue'
import ProposalWithdraw from './ProposalWithdraw.vue'
import { provideSiteRefs } from '../composables/useSiteRefs'
import { useFactUses } from '../composables/useFacts'
import FactUses from './FactUses.vue'
import { Button } from '@studio/components/ui/button'
import { XIcon } from '@lucide/vue'
import { ConfigProvider, injectConfigProviderContext } from 'reka-ui'
import { PROBLEM, SHEET_DIALOG } from '../utils/sheetDialog'
import type { Entry } from '../composables/useSiteData'
import { changesText, valuesText, formatDay, hasTranslation, hidesUntranslated, languageName, leafTranslation, leafValue, taskFields, taskRef, titleOf, weekShortcuts, type Data, type Task } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { planOwner } from '../utils/today'
import { opErrorOf } from '../composables/useOps'
import type { DatedExtra } from '../composables/useEntryForm'
import { messageOf } from '../utils/messageOf'
import { isModKey } from '../utils/keys'
import { shrunkHint, shrunkTexts } from '../utils/shrunk'
import { refDebounced } from '@vueuse/core'
import { msToZoned, scheduleProblem, whenFull } from '../utils/when'
import { whoText } from '../utils/who'
import { coveredHint as coveredText, coveredId, datedLine, exceptionText } from '../utils/datedLines'
import FieldFrame from './fields/FieldFrame.vue'
import { Input } from '@studio/components/ui/input'
import { Switch } from '@studio/components/ui/switch'

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
// A fact field ("Preis ändern") says which texts quote it, so the change is made knowing where it shows.
const factUses = useFactUses(() => props.site, () => props.schema, () => props.brickKey)
const factQuotes = (key: string) => factUses.quotes()?.[key]
const fields = computed(() => taskFields(props.brick, props.task))
const isCreate = computed(() => props.task.kind === 'create')
const ref_ = computed(() => taskRef(props.brickKey, props.task))
/** The weekly task ("Mittagsmenü dieser Woche") always covers this week: its week is shown, not asked (the server holds it to that). */
const fixedWeek = computed(() => {
  const weekly = weeklyTask(props.brick)
  return weekly?.task.id === props.task.id ? weekly.field : undefined
})
const dayText = (value: Json | undefined) => (typeof value === 'string' ? formatDay(value, format) : '–')

// "Gilt ab" (below): declared before the form, whose local copy keeps the day with the input.
const startsOn = ref('')
/** The day field holds a date typed by keyboard and not finished (StartsOnField): no save until it is a day or empty. */
const startsOnBad = ref(false)
/** "Gilt bis" of a task that asks both days (slice 3), with its own "not finished" state. */
const untilOn = ref('')
const untilBad = ref(false)
/** "Jedes Jahr wiederholen" and "Name" of a task that asks for them (slice 4), kept in the local copy with the days. */
const yearly = ref(false)
const changeName = ref('')
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
  day: startsOn,
  until: untilOn,
  yearly,
  name: changeName,
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
  // A dated request keeps its day: sending it again replaces it with a request for that day, not for now (I2).
  if (o.from) startsOn.value = o.from
  if (o.until) untilOn.value = o.until
  if (o.yearly) yearly.value = true
  if (o.name) changeName.value = o.name
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
  const start: Data = isCreate.value ? { ...defaultsFor(fields.value, props.schema.week) } : {}
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
// The publish step (TEMPLATES 7.3): a create task asks what happens to the new entry; an edit of a live entry whether
// the change goes online now or waits unpublished. Only the Veröffentlichen button publishes.
const publishStep = computed(() => isCreate.value || (!!props.entry && props.entry.state !== 'draft'))
// A planned week or hours from a date take effect on their own date: "Später veröffentlichen" would be a second time. A
// plan is a collection that plans a single (`plans`) or that a single's status rule reads (`status: { rule, plans }`).
const laterOffered = computed(() => isCreate.value && props.brick.kind === 'collection' && planOwner(props.schema, props.brickKey) === undefined)
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

// "Gilt ab" (D131): a task that asks for the day, on an online entry. Empty is today: the save goes online as without
// it. A day sends the changed fields as a change that starts on that day; the entry stays as it is until then. Only in
// the main language's view: a change holds whole values, written in the main language (D119).
const taskAsksDay = computed(() => props.task.kind === 'edit' && props.task.when?.from === 'ask' && !isCreate.value && !removedHere.value)
const when = computed(() => (props.task.kind === 'edit' ? props.task.when : undefined))
/**
 * The task asks both days (`when.until: 'ask'`, slice 3): every save is an exception for those days, never a new normal
 * value. Its day fields stay also on an entry that went offline: the save is still an exception, which the server refuses.
 */
const taskEnds = computed(() => taskAsksDay.value && endsByThemselves(props.task))
/** What the task asks besides both days (slice 4): "Jedes Jahr wiederholen" and a name. */
const asksYearly = computed(() => taskEnds.value && taskAsks(props.task).yearly)
const asksName = computed(() => taskEnds.value && taskAsks(props.task).name)
/** The switch is on, where the task asks for it: the days come back every year. */
const isYearly = computed(() => asksYearly.value && yearly.value)
/** The same date last year: the earliest start of a yearly change (decision 3). */
const yearBack = (day: string) => `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`
/** A today-only task (`when: { from: '@today', until: '@today' }`): one labelled press sends its fixed values for today. */
const todayOnly = computed(() => !!when.value && when.value.from === '@today' && !isCreate.value && !removedHere.value)
const today = useToday(computed(() => props.schema.timeZone))
// The field shows on an online entry, and stays while it holds a day (also half typed) when the entry goes offline
// meanwhile: the day is still sent, and the server's refusal for a draft says why nothing was saved (I2).
const asksDay = computed(() => taskAsksDay.value && (taskEnds.value || publishStep.value || !!startsOn.value || startsOnBad.value))
const startsOnError = ref('')
watch([startsOn, yearly], () => { startsOnError.value = '' })
const untilError = ref('')
watch([startsOn, untilOn, yearly], () => { untilError.value = '' })
const nameError = ref('')
watch(changeName, () => { nameError.value = '' })
// "Es ist noch nichts geändert" (E6) under the day field until the day or a value changes.
const { unchangedDay } = form
// By content: a save puts an equal copy into the draft, which is no change.
watch(() => `${startsOn.value}\u0000${stableJson(draft.value)}`, () => { unchangedDay.value = false })
const dayOn = computed(() => (taskAsksDay.value && startsOn.value ? startsOn.value : undefined))
/**
 * A save with a day is on its way (E8): the form goes back to the entry when it lands, so input typed meanwhile would
 * be lost. The fields and the day are inert until then. Set by that save itself, so nothing typed meanwhile ends it (H1).
 */
const datedSaving = ref(false)
const shortDay = (day: string) => format.date(day, { weekday: 'short', day: 'numeric', month: 'short' })
/** "26. Nov.": the days of an exception in the button and the hint. */
const dayMonth = (day: string) => format.date(day, { day: 'numeric', month: 'short' })
/** The first day of an exception save: "Gilt ab", empty is today; fixed for a holding exception being edited. */
const exceptionFrom = computed(() => holdingEdit.value?.from ?? (startsOn.value || today.value))
/**
 * Why the days of an exception cannot be sent yet (the press names it at its field): "Gilt ab" half typed or before
 * today; "Gilt bis" half typed, empty, before "Gilt ab", or before today (a holding exception, whose start passed).
 * With "Jedes Jahr wiederholen" (slice 4) "Gilt ab" may lie up to a year back and "Gilt bis" in the past (the change
 * then waits for next year), and the days must be shorter than a year. The server checks the same.
 */
const daysProblem = computed(() => {
  if (!taskEnds.value) return undefined
  const holding = holdingEdit.value
  const from = exceptionFrom.value
  if (!holding && startsOnBad.value) return 'startsBad' as const
  if (!holding && isYearly.value && from < yearBack(today.value)) return 'startsTooFarBack' as const
  if (!holding && !isYearly.value && from < today.value) return 'startsPast' as const
  if (untilBad.value) return 'untilBad' as const
  if (!untilOn.value) return 'untilEmpty' as const
  if (untilOn.value < from) return 'untilBeforeFrom' as const
  if (isYearly.value && yearTooLong({ from, until: untilOn.value, yearly: true, set: {} })) return 'yearlyTooLong' as const
  if (isYearly.value && leapDayAlone({ from, until: untilOn.value, yearly: true, set: {} })) return 'yearlyLeapDay' as const
  return (!isYearly.value || holding) && untilOn.value < today.value ? 'untilPast' as const : undefined
})
/** The days an exception save sends; undefined while they are not both valid. */
const exceptionDays = computed(() => {
  if (todayOnly.value) return { from: today.value, until: today.value }
  if (!taskEnds.value || daysProblem.value) return undefined
  return { from: exceptionFrom.value, until: untilOn.value }
})
/**
 * What the primary button says for an exception: "Für 26. Nov. bis 31. Dez. …", "Bis 31. Dez. …", "Für heute …", and
 * "Bis heute …" for one that started before today; "Jedes Jahr 1. Juni bis 31. Aug. …" for a yearly one (no year).
 */
function exceptionLabel({ from, until }: { from: string; until: string }) {
  const verb = props.approval ? 'review' : 'publish'
  if (isYearly.value) return t(`dated.${verb}Yearly`, { day: dayMonth(from), until: dayMonth(until) })
  if (until === today.value) return t(from < today.value ? `dated.${verb}UntilToday` : `dated.${verb}Today`)
  if (from <= today.value) return t(`dated.${verb}Until`, { until: dayMonth(until) })
  return t(`dated.${verb}FromUntil`, { day: dayMonth(from), until: dayMonth(until) })
}
/**
 * The primary button says what it sends: a day sends a change of that day, also when the entry went offline meanwhile
 * (the server refuses it then and says why, J2). A task with an end sends only values for certain days, also while its
 * days are not valid yet: it never names a change for good (L6).
 */
const primaryLabel = computed(() => {
  if (busy.value) return offline.value ? t('entry.save.waiting') : t('entry.save.saving')
  if (exceptionDays.value) return exceptionLabel(exceptionDays.value)
  if (taskEnds.value) return t(props.approval ? 'dated.reviewDays' : 'dated.publishDays')
  if (dayOn.value) return t(props.approval ? 'dated.reviewFrom' : 'dated.publishFrom', { day: shortDay(dayOn.value) })
  if (!publishStep.value) return t('entry.save.save')
  if (props.approval) return t('entry.publish.review')
  return later.value ? t('entry.publish.schedule') : t('entry.publish.go')
})
// Changes of the form's fields that wait for a later day (datedChanges.list): one notice each, so nobody plans over one
// without knowing. "Bearbeiten" (E3) puts its day and values into the form; cancelling or moving one is done in Alles
// bearbeiten.
// A draft too: an entry taken offline keeps its changes, which then go into the draft on their day (D126, E4).
const datedArgs = () => (props.entry && !isCreate.value ? { site: props.site, entry: props.entry._id } : 'skip' as const)
const { data: dated } = useConvexQuery(api.datedChanges.list, datedArgs, { server: false })
const valueWords = computed(() => ({ t, format, currency: props.schema.currency }))
const waitingNotices = computed(() => (dated.value ?? []).filter((c) => !c.stopped).flatMap((c) => {
  const ours = c.fields.filter((k) => Object.hasOwn(fields.value, k))
  if (!ours.length) return []
  const values = c.values as Data
  const changes = changesText(fields.value, ours, values, props.main, valueWords.value)
  const holds = c.holds === true
  let text: string
  if (c.until === undefined) text = t('dated.waiting', { day: format.date(c.from, { weekday: 'long', day: 'numeric', month: 'long' }), changes })
  else {
    // What visitors see now, and the normal value it covers ("sonst 12,90 €") when that has a short form.
    const normal = holds && c.normal ? valuesText(fields.value, ours, c.normal as Data, props.main, valueWords.value) : undefined
    text = exceptionText({ ...c, until: c.until, holds }, changes, normal, valueWords.value)
  }
  return [{ id: c.id, from: c.from, until: c.until, holds, yearly: c.yearly === true, name: c.name, fields: ours, values, text }]
}))
type Notice = (typeof waitingNotices.value)[number]
/** The line under a notice: two offers on the same days, a change that waits for an offer's end (datedLines). */
const lineOf = (n: Notice) => datedLine(waitingNotices.value, n, valueWords.value)
/** Under a field an exception covers today: what the website shows instead, and until when (spec rule 5). */
const coveredHint = (key: string) => coveredText(waitingNotices.value, key, fields.value, props.main, valueWords.value)
/**
 * "Bearbeiten" on a notice of the kind the task makes (an exception for a task that asks both days, else a change
 * without an end): its days and values go into the form. A holding exception keeps its start (decision 4).
 */
// A season only through a task that asks `yearly`, as the server rules (round N1).
const mayEdit = (n: Notice) => asksDay.value && !foreign.value && (n.until !== undefined) === taskEnds.value && (!n.yearly || asksYearly.value)
/** The waiting change "Bearbeiten" filled the form from: saved on its day, it is replaced (every field of it is sent). */
const editing = ref<{ id: string; fields: string[] }>()
function editChange(n: Notice) {
  if (!n.holds) startsOn.value = n.from
  if (n.until !== undefined) {
    untilOn.value = n.until
    yearly.value = n.yearly
    changeName.value = n.name ?? ''
  }
  for (const key of n.fields) form.setField(key, n.values[key] ?? undefined)
  editing.value = { id: n.id, fields: n.fields }
  nextTick(() => document.getElementById(n.holds ? 'sheet-until' : 'sheet-starts-on')?.focus())
}
/**
 * The change being edited, by its row, while it still waits or holds: cancelled, gone online, ended or stopped
 * meanwhile, it counts no more (I2), also when someone plans another change on the same day (J3). Its days are the row's.
 */
const edited = computed(() => {
  const row = editing.value && waitingNotices.value.find((n) => n.id === editing.value!.id)
  return row ? { id: row.id, from: row.from, until: row.until, holds: row.holds, yearly: row.yearly, fields: editing.value!.fields } : undefined
})
/** A holding exception being edited: "Gilt ab" is fixed and shown as text; the save edits that row (`change`). */
const holdingEdit = computed(() => (edited.value?.holds ? edited.value : undefined))
/**
 * After "Bearbeiten", another start plans a second change; the one being edited stays (H1). An exception keeps being
 * the one edited while its start stays (an empty "Gilt ab" is today), whatever its end (L7).
 */
const secondChange = computed(() => {
  const was = edited.value
  if (!was || was.holds || startsOnBad.value) return ''
  const from = taskEnds.value ? exceptionFrom.value : startsOn.value
  return from && from !== was.from ? t('dated.secondChange', { day: format.date(was.from, { weekday: 'long', day: 'numeric', month: 'long' }) }) : ''
})
/** A press that changed nothing in a sheet without "Gilt ab" (today only, a holding exception): said by the button (L8). */
const unchangedHere = computed(() => unchangedDay.value && (todayOnly.value || !!holdingEdit.value))
const primaryDescribedBy = computed(() => [shrunk.value.length ? 'sheet-shrunk' : '', unchangedHere.value ? 'sheet-unchanged' : ''].filter(Boolean).join(' ') || undefined)
/** A today-only task: the values it sets, as the notices write them ("Nur heute: Aus"). */
const taskSet = computed(() => ((props.task.kind === 'edit' ? props.task.set : undefined) ?? {}) as Data)
const todayValues = computed(() => {
  const set = taskSet.value
  return Object.keys(set).length ? changesText(props.brick.fields, Object.keys(set), set, props.main, valueWords.value) : ''
})

/** A day field shows only in the main language's view: switch there before the focus (H1). */
async function focusDay(id: string) {
  await switchLanguage(props.main)
  return nextTick(() => document.getElementById(id)?.focus())
}
/**
 * The save of a change with a day (`from`), and for an exception its end (`extra`): the fields and days are inert while
 * it is on its way (E8); a save that changed nothing for those days keeps the form open and says so under the day.
 * `same`: the fields of the change being edited, sent even when equal to the stored value, so it is replaced (E3).
 */
async function sendDated(from: string, same?: readonly string[], extra?: DatedExtra) {
  let ok: boolean
  beforeSend()
  datedSaving.value = true
  try {
    ok = await form.save(undefined, undefined, from, same, extra)
  } finally {
    datedSaving.value = false
  }
  if (!ok && unchangedDay.value) await focusDay(holdingEdit.value || todayOnly.value ? 'sheet-primary' : 'sheet-starts-on')
  await finish(ok)
}
/**
 * What a save does: `publish` goes online now (or waits for a yes), `draft` stays off the website (a new entry is a
 * draft, a change waits unpublished), `later` plans a new entry.
 */
type Step = 'publish' | 'draft' | 'later'
/** Every save goes through here: the buttons, Enter and Ctrl+S. A conflict answer never saves (I1). */
async function save(step: Step = 'publish') {
  // The save button is only aria-disabled (below), so a keyboard press still lands here.
  if (busy.value || !ready.value || removedHere.value) return
  laterProblem.value = ''
  // A day typed and not finished is not "today": nothing is saved until it is a day or the field is empty (E1).
  if (asksDay.value && startsOnBad.value && !holdingEdit.value) return focusDay('sheet-starts-on')
  // Enter in a field and Ctrl+S never publish (below), and a change for other days is a publish: the button does it.
  if ((taskEnds.value || todayOnly.value) && step === 'draft') return document.getElementById('sheet-primary')?.focus()
  if (todayOnly.value) return sendDated(today.value, undefined, { until: today.value, empty: true })
  if (taskEnds.value) {
    // An exception (slice 3): "Gilt ab" empty is today, never before; "Gilt bis" is required, not before it nor today.
    const problem = daysProblem.value
    if (problem === 'startsPast') startsOnError.value = messageOf({ key: 'errors.dayBeforeToday' })
    if (problem === 'startsTooFarBack') startsOnError.value = t('dated.startsTooFarBack')
    if (problem === 'startsBad' || problem === 'startsPast' || problem === 'startsTooFarBack') return focusDay('sheet-starts-on')
    if (problem) {
      if (problem !== 'untilBad') {
        untilError.value = problem === 'untilEmpty' ? t('dated.dayRequired') : problem === 'untilBeforeFrom' ? t('dated.untilBeforeFrom')
          : problem === 'yearlyTooLong' ? t('dated.yearlyTooLong') : problem === 'yearlyLeapDay' ? t('dated.yearlyLeapDay') : messageOf({ key: 'errors.dayBeforeToday' })
      }
      return focusDay('sheet-until')
    }
    const name = asksName.value ? changeName.value.trim() : ''
    if (name.length > NAME_MAX) {
      nameError.value = t('dated.nameTooLong', { max: NAME_MAX })
      return focusDay('sheet-name')
    }
    const from = exceptionFrom.value
    // "Bearbeiten" edits that exception while its start stays (L7): its values are all sent, so it is replaced.
    const was = edited.value?.until !== undefined && edited.value.from === from ? edited.value : undefined
    // A task whose fixed values (`set`) are the change has nothing to type: its days alone are a save, as for today only.
    const empty = Object.keys(taskSet.value).length > 0
    return sendDated(from, was?.fields, { until: untilOn.value, ...(was ? { change: was.id } : {}), ...(isYearly.value ? { yearly: true as const } : {}), ...(name ? { name } : {}), ...(empty ? { empty } : {}) })
  }
  const from = dayOn.value
  if (from !== undefined) {
    if (step === 'draft') return document.getElementById('sheet-primary')?.focus()
    if (from <= todayIn(props.schema.timeZone)) {
      startsOnError.value = messageOf({ key: 'errors.dayNotAhead' })
      return focusDay('sheet-starts-on')
    }
    return sendDated(from, edited.value?.from === from ? edited.value.fields : undefined)
  }
  let publish: { at?: number } | true | undefined
  if (publishStep.value && !isCreate.value) publish = step === 'draft' ? undefined : true
  else if (publishStep.value && step !== 'draft') {
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
  beforeSend()
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
// A conflict answer only merges (I1): while the conflict was open, the entry may have gone online or offline and the
// day may have changed, so a remembered step or day could put the input online unasked. The person then presses the
// button that says what it does now. The line "not saved yet" stays until the next save, and takes the focus: on the
// primary button the next Enter could publish a draft someone published meanwhile (J1).
const merged = ref(false)
/** Whether the entry was online (`publishStep`) when the last save was sent: the line says when that changed since. */
let onlineAtSave: boolean | undefined
const movedSince = ref('')
function beforeSend() {
  merged.value = false
  onlineAtSave = publishStep.value
}
function afterMerge(ok: boolean) {
  if (!ok) return
  merged.value = true
  movedSince.value = onlineAtSave === undefined || onlineAtSave === publishStep.value ? '' : t(publishStep.value ? 'entry.conflict.nowOnline' : 'entry.conflict.nowOffline')
  nextTick(() => document.getElementById('sheet-merged')?.focus())
}
const keepMine = () => afterMerge(form.keepMine())
const keepBoth = () => afterMerge(form.mergeLists())
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
              :can-keep-both="!!form.listMerge.value" merge-only :busy="busy"
              @keep-mine="keepMine" @take-theirs="form.takeTheirs()" @keep-both="keepBoth"
            />
            <p v-else-if="merged" id="sheet-merged" tabindex="-1" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning outline-none" role="status" data-test="merged-input">{{ movedSince ? `${t('entry.conflict.inForm')} ${movedSince}` : t('entry.conflict.inForm') }}</p>
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
            <div v-for="n in waitingNotices" :key="n.id" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-warning/10 py-1 pr-1 pl-3">
              <p class="py-1.5 font-semibold text-warning [overflow-wrap:anywhere]" role="status" data-test="dated-waiting">{{ n.text }}</p>
              <Button v-if="mayEdit(n)" type="button" variant="outline" size="sm" @click="editChange(n)">{{ t('dated.edit') }}</Button>
              <p v-if="lineOf(n)" class="basis-full pb-1.5 text-sm text-warning" :data-test="lineOf(n)!.test">{{ lineOf(n)!.text }}</p>
            </div>
            <template v-if="todayOnly">
              <p v-if="todayValues" class="font-semibold" data-test="today-values">{{ t('dated.todayOnlyValues', { changes: todayValues }) }}</p>
              <p data-test="today-only">{{ t('dated.todayOnly') }}</p>
            </template>
            <p v-if="oldWeek" class="rounded-md bg-warning/10 px-3 py-2.5 font-semibold text-warning">{{ t('entry.oldWeek', { date: formatDay(oldWeek, format) }) }}</p>
            <!-- Like "Deinen Vorschlag wieder öffnen" above, it replaces the form's values: offered only before anything is typed. -->
            <Button v-if="isCreate && copyFrom && !copied && !dirty" type="button" variant="outline" class="justify-self-start" :disabled="copying" @click="copyThisWeek">{{ t('entry.copyThisWeek') }}</Button>
            <p v-if="foreign" class="text-sm text-muted-foreground">{{ t('entry.foreignHint') }}</p>
            <div class="contents" :inert="datedSaving" :aria-busy="datedSaving || undefined" data-test="sheet-fields">
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
                  :hint-id="coveredHint(String(key)) ? coveredId(String(key)) : undefined"
                  @update:model-value="form.setField(String(key), $event)"
                />
                <!-- The form edits the normal value; an exception that holds today covers it on the website. -->
                <p v-if="coveredHint(String(key))" v-show="isShown(field, draft)" :id="coveredId(String(key))" class="-mt-2 text-sm font-medium text-muted-foreground" data-test="covered-hint">{{ coveredHint(String(key)) }}</p>
                <FactUses v-if="factQuotes(String(key))?.length" v-show="isShown(field, draft)" :slug="site" :quotes="factQuotes(String(key))!" class="-mt-2" />
              </template>
              <div v-if="asksDay && !foreign && holdingEdit" class="grid gap-1" role="group" aria-labelledby="sheet-fixed-from" data-slot="field" data-test="fixed-from">
                <p id="sheet-fixed-from" class="text-sm font-medium">{{ t('dated.startsOn') }}</p>
                <p class="font-semibold">{{ shortDay(holdingEdit.from) }}</p>
                <p class="text-sm text-muted-foreground">{{ t('dated.fromFixed') }}</p>
              </div>
              <StartsOnField v-else-if="asksDay && !foreign" id="sheet-starts-on" v-model="startsOn" v-model:bad="startsOnBad" optional :hint="taskEnds ? t(isYearly ? 'dated.yearlyHint' : 'dated.startsOnHintToday') : undefined" :earliest="taskEnds ? (isYearly ? yearBack(today) : today) : undefined" :time-zone="schema.timeZone" :error="startsOnError" :status="unchangedDay ? t('dated.nothingChanged') : secondChange" />
              <StartsOnField v-if="asksDay && taskEnds && !foreign" id="sheet-until" v-model="untilOn" v-model:bad="untilBad" :label="t('dated.until')" :earliest="startsOn || (isYearly ? yearBack(today) : today)" :latest="isYearly ? addDays(exceptionFrom, 364) : undefined" :time-zone="schema.timeZone" :error="untilError" />
              <!-- Slice 4: under "Gilt bis", in this order. While the edited row holds, `yearly` stays as it is both ways
                   (decision 2, round N1); the sentence says why for a yearly row only (the one-off case has none yet). -->
              <FieldFrame v-if="asksDay && asksYearly && !foreign" id="sheet-yearly" inline :label="t('dated.yearly')" :hint="holdingEdit?.yearly ? t('dated.yearlyWhileHolding') : undefined">
                <template #default="{ describedBy }">
                  <Switch id="sheet-yearly" v-model="yearly" :disabled="holdingEdit !== undefined" :aria-describedby="describedBy" />
                </template>
              </FieldFrame>
              <FieldFrame v-if="asksDay && asksName && !foreign" id="sheet-name" :label="t('dated.name')" optional :hint="t('dated.nameHint')" :errors="nameError ? [nameError] : []">
                <template #default="{ describedBy, invalid }">
                  <Input id="sheet-name" v-model="changeName" class="max-w-80" autocomplete="off" :aria-invalid="invalid" :aria-describedby="describedBy" />
                </template>
              </FieldFrame>
            </div>
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
            <p v-if="unchangedHere" id="sheet-unchanged" class="basis-full text-sm font-medium text-warning" role="status">{{ t('dated.nothingChanged') }}</p>
            <div v-if="publishStep && later" class="grid basis-full gap-2" data-test="publish-later" @keydown.enter.prevent="save('later')">
              <label for="sheet-publish-at" class="text-sm font-medium">{{ t('entry.publish.dateTime') }}</label>
              <ScheduleField v-model:local="at" v-model:picked="picked" :zone="schema.timeZone" input-id="sheet-publish-at" />
              <p v-if="laterProblem" class="text-sm font-medium text-destructive" role="alert">{{ laterProblem }}</p>
            </div>
            <!-- aria-disabled, not disabled: a disabled button cannot keep the focus, so a keyboard save would drop it to the page top. -->
            <!-- On the publish step only a press on this button publishes (Enter in a field saves a draft, like Ctrl+S); with the time open it plans instead, so there is one primary per state. -->
            <Button id="sheet-primary" :type="publishStep ? 'button' : 'submit'" class="flex-1" aria-keyshortcuts="Meta+S Control+S" :aria-describedby="primaryDescribedBy" :aria-disabled="busy || !ready || removedHere ? 'true' : undefined" @click="publishStep && save(later ? 'later' : 'publish')">{{ primaryLabel }}</Button>
            <template v-if="publishStep">
              <!-- With a day, Speichern (unpublished) would drop it: the day's button is the one way. -->
              <Button v-if="!dayOn && !taskEnds && !todayOnly" type="button" variant="outline" :aria-disabled="busy || !ready || removedHere ? 'true' : undefined" @click="save('draft')">{{ isCreate ? t('entry.publish.asDraft') : t('entry.save.save') }}</Button>
              <Button v-if="laterOffered" type="button" variant="outline" :aria-expanded="later" @click="toggleLater">{{ t('entry.publish.laterOpen') }}</Button>
            </template>
            <Button type="button" variant="ghost" @click="requestClose">{{ t('entry.cancel') }}</Button>
          </template>
        </footer>
      </form>
    </ConfigProvider>
  </dialog>
</template>
