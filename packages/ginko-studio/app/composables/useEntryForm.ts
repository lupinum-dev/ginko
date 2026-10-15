// One form engine for Schnell ändern and Alles bearbeiten (UI.md 3.2, 4): a draft of root fields,
// the stored baseline, save or create with one opId per input, field errors, conflicts that keep
// the person's input, "Noch richtig?" blockers from list rows, and a copy of unsaved input in this browser.
import type { Brick, Fields, Json, Locale } from '@lupinum/ginko'
import { useI18n } from '#imports'
import type { Entry } from './useSiteData'
import type { OpError } from './useOps'
import { changedRoots, ownChangesOver, type Data } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { clearLocalDraft, localDraftKey, readLocalDraft, useLocalDraftWriter, writeLocalDraft, type LocalDraft } from './useLocalDraft'
import { BLOCKERS, FLUSHERS, type Issue } from '@lupinum/ginko-editor'
import { mergeRows, stableJson } from '@lupinum/ginko/internal'
import type { Who } from '../utils/who'

/** Stored values are JSON; a JSON copy also unwraps Vue's proxies (structuredClone cannot). */
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) ?? value

export interface EntryFormOptions {
  site: Ref<string>
  brickKey: () => string
  brick: () => Brick
  /** The fields this form edits. */
  fields: () => Fields
  /** The edited entry; none when creating. */
  entry: () => Entry | undefined
  main: () => Locale
  /** Locale the translatable values are saved in, and the language of local copies. */
  locale: () => Locale
  /**
   * The form edits every language of its texts (the quick-task sheet's language switch): a save sends whole values
   * without `locale`, so one Speichern stores all languages, and a translation nobody touched keeps its print. The
   * per-root conflict check guards those whole values; "Meine behalten" sends only the person's own languages.
   */
  allLanguages?: boolean
  task?: () => string | undefined
  removeTask?: () => string | undefined
  /** The edited entry is a draft (SPEC 15): saving says so instead of promising the website. */
  draft?: () => boolean
  /** The site's time zone, for "online ab …" in messages. */
  timeZone?: () => string
  /** Someone removed the edited entry meanwhile (useKeptEntry): saving waits for a restore or "save as new". */
  removed?: () => boolean
  /** Switches the form to the language of a local copy before it is restored; false when it cannot now. Without it, copies in other languages are not offered. */
  otherLocale?: (locale: Locale) => Promise<boolean>
}

export function useEntryForm(o: EntryFormOptions) {
  const ops = useOps(o.site)
  const { t, format } = useI18n()
  const draft = ref<Data>({})
  /** The stored values of the fields, for "Noch richtig?" (empty when creating). */
  const baseline = ref<Data>({})
  /** The form as it opened, to know whether closing loses input. */
  const initial = ref<Data>({})
  const baseRev = ref(0)
  const ready = ref(false)
  const issues = ref<Issue[]>([])
  const problem = ref('')
  /** Fields someone saved after the person's base: their values, the entry's rev, and who did it when the server says. */
  const conflict = ref<{ fields: string[]; data: Data; rev: number; by?: Record<string, Who> } | null>(null)
  const busy = ref(false)
  /** The last save went to approval (SPEC 17): the input stays, nothing changed on the website, so no new rev. Cleared by the next edit. */
  const waiting = ref(false)
  // A save does not fail while the connection is down: Convex sends it once it is back. Until then the button says so.
  const { isConnected } = useConvexConnectionState()
  const offline = computed(() => busy.value && !isConnected.value)
  /** Leaves to confirm as translated without a change (Alles bearbeiten, foreign locale). */
  const confirm = ref<string[]>([])
  const blockers = reactive(new Map<string, string>())
  provide(BLOCKERS, blockers)
  const flushers = new Set<() => Promise<void>>()
  provide(FLUSHERS, flushers)

  /** Fixed when the form loads: an edit never turns into a create when its entry disappears. */
  const loadedId = ref<string>()
  const isCreate = computed(() => !loadedId.value)
  const keys = () => Object.keys(o.fields())
  const storedOf = (data: Data) => Object.fromEntries(keys().map((k) => [k, data[k]])) as Data

  /** Starts the form: `start` are the values shown (prefill or stored). */
  function load(start: Data) {
    const entry = o.entry()
    loadedId.value = entry?._id
    draft.value = copy(start)
    baseline.value = entry ? copy(storedOf(entry.data)) : {}
    initial.value = copy(start)
    baseRev.value = entry?.rev ?? 0
    issues.value = []
    problem.value = ''
    conflict.value = null
    confirm.value = []
    waiting.value = false
    ready.value = true
    if (mounted) localOffer.value = offerOf(localKey.value)
  }

  const changed = computed(() => changedRoots(baseline.value, draft.value).filter((k) => keys().includes(k)))
  const dirty = computed(() => changedRoots(initial.value, draft.value).some((k) => keys().includes(k)) || confirm.value.length > 0)

  // Leaving with unsaved input asks first: the browser's back button, a link such as "Alle Bereiche",
  // closing or reloading the tab (break-it 9). A save on its way needs no question: it goes on.
  const unsaved = () => dirty.value && !busy.value
  const mayLeave = () => {
    if (!unsaved()) return true
    if (!window.confirm(t('ops.leaveConfirm'))) return false
    // "Trotzdem weggehen" drops the input on purpose (the browser's own leave dialog keeps the local copy).
    // A removed entry keeps it: the input comes back if the entry is restored and opened again.
    if (!o.removed?.()) forgetLocal()
    return true
  }
  onBeforeRouteLeave(mayLeave)
  onBeforeRouteUpdate(mayLeave)
  const onUnload = (event: BeforeUnloadEvent) => { if (unsaved()) event.preventDefault() }
  onMounted(() => window.addEventListener('beforeunload', onUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))

  function setField(key: string, value: Json | undefined) {
    // A fixed field drops its old error at once; the server checks again on save.
    if (issues.value.some((i) => i.path === key || i.path.startsWith(`${key}.`))) issues.value = issues.value.filter((i) => i.path !== key && !i.path.startsWith(`${key}.`))
    waiting.value = false
    const next = { ...draft.value }
    if (value === undefined) delete next[key]
    else next[key] = value
    draft.value = next
  }

  function showError(e: OpError) {
    issues.value = []
    problem.value = ''
    conflict.value = null
    if (e.code === 'INVALID' && e.details?.errors) {
      issues.value = e.details.errors
      problem.value = e.message
    } else if (e.code === 'CHANGED_SINCE' && e.details?.deleted) {
      problem.value = t('ops.entryGone')
    } else if (e.code === 'CHANGED_SINCE' && e.details?.data) {
      conflict.value = { fields: (e.details.conflicts as string[] | undefined) ?? [], data: e.details.data as Data, rev: Number(e.details.rev), ...(e.details.by ? { by: e.details.by } : {}) }
    } else {
      problem.value = e.message
    }
  }

  /** Saves; resolves true when done (nothing to save counts as done). */
  /** `publish` only when creating in a collection with drafts: `{}` online now, `{ at }` scheduled; absent a draft. */
  function save(rev = baseRev.value, publish?: { at?: number }): Promise<boolean> {
    // A removed entry cannot take a save: the person restores it or saves the input as a new entry.
    if (o.removed?.()) return Promise.resolve(false)
    return write(rev, publish)
  }

  /** The input of a removed entry as a new entry (EntryGoneBanner); the server makes new addresses. */
  function saveAsNew(task?: string): Promise<boolean> {
    return write(baseRev.value, undefined, { task })
  }

  /**
   * The opId of the last write that did not succeed, and what it sent. Sending the same input again reuses it, so a
   * write that reached the server although its answer was lost (a sign-out meanwhile) is answered, not done twice.
   * Other input gets a new one: the server refuses an opId with other arguments (OP_REUSED).
   */
  let unconfirmed: { op: string; sent: string } | undefined
  function opFor(sent: Record<string, unknown>) {
    const key = stableJson({ site: o.site.value, ...sent })
    if (unconfirmed?.sent !== key) unconfirmed = { op: ops.opId(), sent: key }
    return unconfirmed.op
  }

  /** Typing from the last moments may still wait in an editor's pause: this hands it to the draft. */
  async function flush() {
    await Promise.all([...flushers].map((run) => run()))
  }

  async function write(rev: number, publish?: { at?: number }, asNew?: { task?: string }): Promise<boolean> {
    if (busy.value) return false
    await flush()
    if (blockers.size) {
      problem.value = [...new Set(blockers.values())].join(' ')
      return false
    }
    busy.value = true
    // Read now: a sheet closed while the save waits for the connection is gone when it lands.
    const key = localKey.value
    try {
      // What is sent: edits made while the call runs stay unsaved (and dirty), never marked as saved.
      const submitted = copy(draft.value)
      if (isCreate.value || asNew) {
        const fields = o.brick().fields
        // A copy keeps only live fields and no address: the removed entry still holds its addresses.
        const data = asNew ? Object.fromEntries(Object.entries(submitted).filter(([k]) => fields[k] && !fields[k].retired && fields[k].type !== 'slug')) : submitted
        const task = asNew ? asNew.task : o.task?.()
        const op = opFor({ brick: o.brickKey(), data, task, publish })
        const result = await ops.createEntry({ brick: o.brickKey(), data: data as Record<string, Json>, task, removeTask: o.removeTask?.(), op, label: t('ops.saved'), publish, timeZone: o.timeZone?.() })
        if (result.entry === undefined) waiting.value = true
        else created.value = result.entry
        // Saved: what was sent no longer counts as open input (a second Speichern would create another).
        initial.value = submitted
      } else {
        const roots = changedRoots(baseline.value, submitted).filter((k) => keys().includes(k))
        if (!roots.length && !confirm.value.length) return true
        const values = Object.fromEntries(roots.map((k) => [k, submitted[k] ?? null]))
        const sent = { entry: o.entry()!._id, baseRev: rev, fields: values, task: o.task?.(), ...(o.allLanguages ? {} : { locale: o.locale() }), ...(confirm.value.length ? { confirm: confirm.value } : {}) }
        const result = await ops.saveEntry({ ...sent, op: opFor(sent), draft: o.draft?.() ?? false })
        if (result.rev === undefined) {
          // Nothing was written: the stored state, base and rev stay; only the input counts as handed in.
          waiting.value = true
        } else {
          baseRev.value = result.rev
          baseline.value = copy(storedOf({ ...baseline.value, ...submitted }))
        }
        initial.value = submitted
        confirm.value = []
      }
      unconfirmed = undefined
      // Handed in, and nothing typed since: the local copy has done its job.
      if (key && !changedRoots(submitted, draft.value).length) clearLocalDraft(key)
      issues.value = []
      problem.value = ''
      return true
    } catch (e) {
      showError(e as OpError)
      return false
    } finally {
      busy.value = false
    }
  }
  const created = ref<string | null>(null)

  /**
   * The entry is live: untouched fields always show the stored values, also after the person's own
   * save (someone may have saved another field meanwhile). The base revision moves on only when no
   * field the person changed was changed remotely after the base; that case stays a conflict.
   */
  function reconcile() {
    const entry = o.entry()
    if (!entry || !ready.value || busy.value) return
    const touched = changed.value
    const nextDraft = { ...draft.value }
    const nextBase = { ...baseline.value }
    const nextInitial = { ...initial.value }
    for (const k of keys()) {
      if (touched.includes(k)) continue
      const v = entry.data[k]
      for (const target of [nextDraft, nextBase, nextInitial]) {
        if (v === undefined) delete target[k]
        else target[k] = copy(v)
      }
    }
    draft.value = nextDraft
    baseline.value = nextBase
    initial.value = nextInitial
    if (entry.rev > baseRev.value && !touched.some((k) => (entry.fieldRevs[k] ?? 0) > baseRev.value)) baseRev.value = entry.rev
  }
  watch(() => o.entry()?.rev, reconcile)
  watch(busy, (now) => { if (!now) reconcile() })

  /**
   * The person's own changes over the current server state; untouched fields take the server's values. A changed text
   * keeps the languages someone else changed meanwhile (a whole-value save would send the old ones back).
   */
  async function keepMine() {
    const c = conflict.value
    if (!c) return false
    const theirs = storedOf(c.data)
    const mine = Object.fromEntries(changed.value.map((k) => [k, ownChangesOver(o.fields()[k]!, baseline.value[k], draft.value[k], theirs[k])]))
    baseline.value = copy(theirs)
    draft.value = copy({ ...theirs, ...mine } as Data)
    baseRev.value = c.rev
    conflict.value = null
    return save(c.rev)
  }
  /**
   * Both people's rows, when every conflicting field is a list and no row was changed by both or
   * moved (mergeRows); null otherwise. "Beides behalten" shows only then.
   */
  const listMerge = computed<Data | null>(() => {
    const c = conflict.value
    if (!c?.fields.length) return null
    const merged: Data = {}
    for (const k of c.fields) {
      if (o.fields()[k]?.type !== 'list') return null
      const m = mergeRows(baseline.value[k], draft.value[k], c.data[k])
      if (m.clashes.length || m.reordered) return null
      merged[k] = m.rows
    }
    return merged
  })
  /** "Beides behalten": the merged lists and the person's other changes over the current server state, saved at once. */
  async function mergeLists() {
    const c = conflict.value
    const merged = listMerge.value
    if (!c || !merged) return false
    const mine = Object.fromEntries(changed.value.map((k) => [k, draft.value[k]]))
    const theirs = storedOf(c.data)
    baseline.value = copy(theirs)
    draft.value = copy({ ...theirs, ...mine, ...merged } as Data)
    baseRev.value = c.rev
    conflict.value = null
    return save(c.rev)
  }

  /** The stored values for the conflicting fields; the person's other changes stay in the form, unsaved. */
  function takeTheirs() {
    const c = conflict.value
    if (!c) return
    const theirs = storedOf(c.data)
    const mine = Object.fromEntries(changed.value.filter((k) => !c.fields.includes(k)).map((k) => [k, draft.value[k]]))
    draft.value = copy({ ...theirs, ...mine } as Data)
    baseline.value = copy(theirs)
    initial.value = copy(theirs)
    baseRev.value = c.rev
    conflict.value = null
  }

  /**
   * Brings the removed entry back (with the remove right) and saves the input onto it. False when the
   * restore went to approval or failed: the entry stays removed, the input stays in the form.
   */
  async function restoreAndSave(lifeRev: number, task?: string): Promise<boolean> {
    const entry = o.entry()
    if (!entry || busy.value || !(await ops.restoreEntry(entry._id, lifeRev, task))) return false
    // Convex applies the restored entry to the live list before the mutation resolves; let the form see it.
    await nextTick()
    return dirty.value ? save() : true
  }

  /** Drops the person's input (an explicit "Verwerfen"): the form shows what it opened with, and no local copy stays. */
  function discard() {
    draft.value = copy(initial.value)
    confirm.value = []
    forgetLocal()
  }

  // A copy of the unsaved input in this browser (N2), per person and form: the entry id, a new entry of a
  // brick, or a create task. Only after load(): an empty form must not overwrite the copy before it is offered.
  const auth = useConvexAuth()
  const localKey = computed(() => {
    const user = auth.user.value?.id
    if (!user || !ready.value) return undefined
    const task = o.task?.()
    return localDraftKey(o.site.value, user, loadedId.value ?? (task ? `task:${task}` : `new:${o.brickKey()}`))
  })
  const same = (a: Json | undefined, b: Json | undefined) => stableJson(a ?? null) === stableJson(b ?? null)
  /** A copy that differs from the form, offered back with "Wiederherstellen"; never applied without a yes. */
  const localOffer = ref<LocalDraft | null>(null)
  // Browser storage exists only in the browser: a form loaded during server rendering looks once it is mounted,
  // and again when the signed-in person becomes known after load().
  let mounted = false
  onMounted(() => {
    mounted = true
    if (ready.value) localOffer.value = offerOf(localKey.value)
  })
  watch(localKey, (key, before) => { if (mounted && key && !before && !dirty.value) localOffer.value = offerOf(key) })

  function offerOf(key: string | undefined): LocalDraft | null {
    const record = key ? readLocalDraft(key) : undefined
    if (!key || !record || (record.locale !== o.locale() && !o.otherLocale)) return null
    const own = keys().filter((k) => Object.hasOwn(record.fields, k))
    if (own.some((k) => !same(draft.value[k], record.fields[k]))) return record
    // Nothing new in it (saved meanwhile): drop it, unless it holds fields this form does not show.
    if (own.length === Object.keys(record.fields).length) clearLocalDraft(key)
    return null
  }

  function keepLocal() {
    const key = localKey.value
    // While a copy is offered, it stays as it is until the person decides.
    if (!key || localOffer.value) return
    const fields: Data = isCreate.value ? copy(draft.value) : Object.fromEntries(changed.value.map((k) => [k, copy(draft.value[k] ?? null)]))
    if (!dirty.value || !Object.keys(fields).length) return clearLocalDraft(key)
    const base = isCreate.value ? undefined : Object.fromEntries(Object.keys(fields).map((k) => [k, copy(baseline.value[k] ?? null)]))
    writeLocalDraft(key, { v: 1, savedAt: Date.now(), baseRev: baseRev.value, locale: o.locale(), fields, ...(base ? { base } : {}) })
  }
  // Typed back to what was there: the next write removes the copy (a save removes it at once, in write()).
  const localWriter = useLocalDraftWriter(() => draft.value, keepLocal)

  function forgetLocal() {
    localWriter.cancel()
    if (localKey.value) clearLocalDraft(localKey.value)
    localOffer.value = null
  }

  /**
   * Puts the offered copy into the form. Fields someone saved after the copy was made open the conflict
   * panel at once ("Meine Eingaben speichern" / "Neuen Stand übernehmen"); the others save normally.
   */
  async function restoreLocal() {
    let record = localOffer.value
    if (record && record.locale !== o.locale()) {
      // The language switch loads the form again, which offers the copy anew.
      if (!(await o.otherLocale?.(record.locale))) return
      record = localOffer.value
    }
    if (!record) return
    localOffer.value = null
    const { fields, base, baseRev: copyBase } = record
    const own = keys().filter((k) => Object.hasOwn(fields, k))
    const entry = o.entry()
    const next = { ...draft.value }
    for (const k of own) {
      // Only the person's changes over what is stored now: a text keeps the languages someone else saved meanwhile.
      const value = entry && base && Object.hasOwn(base, k) ? ownChangesOver(o.fields()[k]!, base[k] ?? undefined, fields[k] ?? undefined, entry.data[k]) : fields[k]
      if (value === null || value === undefined) delete next[k]
      else next[k] = copy(value)
    }
    draft.value = next
    waiting.value = false
    if (!entry) return
    const clash = own.filter((k) => (entry.fieldRevs[k] ?? 0) > copyBase && !same(entry.data[k], next[k]))
    // The copy's base: a save of a root changed after it is refused as a conflict, never overwrites it.
    baseRev.value = Math.min(copyBase, entry.rev)
    if (clash.length) {
      conflict.value = { fields: clash, data: entry.data, rev: entry.rev }
      const label = (k: string) => { const f = o.brick().fields[k]; return f ? shownLabel(f.label, o.main()) : k }
      useToast().show(t('entry.localDraft.restoredConflict', { fields: clash.map(label).join(', ') }))
    }
    reconcile()
  }

  /** "Nicht wiederherstellen" on the offer: the copy goes for good, the form stays as it is. */
  function dropLocal() {
    const key = localKey.value
    if (key) clearLocalDraft(key)
    localOffer.value = null
  }

  return { draft, baseline, initial, baseRev, ready, issues, problem, conflict, busy, offline, waiting, confirm, blockers, isCreate, changed, dirty, created, localOffer, load, setField, flush, save, saveAsNew, restoreAndSave, discard, restoreLocal, dropLocal, keepMine, takeTheirs, listMerge, mergeLists }
}
