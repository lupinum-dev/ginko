// One form engine for Schnell ändern and Alles bearbeiten (UI.md 3.2, 4): a draft of root fields,
// the stored baseline, save or create with one opId per input, field errors, conflicts that keep
// the person's input, "Noch richtig?" blockers from list rows, and a copy of unsaved input in this browser.
import type { Brick, Fields, Json, Locale } from '@lupinum/ginko'
import { useI18n } from '#imports'
import type { Entry } from './useSiteData'
import type { OpError } from './useOps'
import { changedRoots, changedTextLanguages, ownChangesOver, typedTitle, type Data } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { clearLocalDraft, localDraftKey, readLocalDraft, useLocalDraftWriter, writeLocalDraft, type LocalDraft } from './useLocalDraft'
import { BLOCKERS, FLUSHERS, type Issue } from '@lupinum/ginko-editor'
import { mergeKeyedRows, mergeRows, stableJson } from '@lupinum/ginko/internal'
import type { Who } from '../utils/who'
import { useOnline } from '@vueuse/core'

/** An issue of a field: an error, or with `note` what a draft still lacks before it can go online (D116). */
export type FieldIssue = Issue & { note?: true }

/**
 * The notes of a draft just created, by entry id, with the entry's revision they belong to: its page opens a new form for
 * the stored entry, which takes them over once (`load`), so "save as draft" shows what is missing also on the first save
 * of a new entry. Taken only while the entry still has that revision; a later save (also someone else's) makes them stale.
 */
const handedNotes = new Map<string, { rev: number; notes: Issue[] }>()

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
  /** The task of the save; `roots`: the root fields a save of the existing entry changes. */
  task?: (roots?: readonly string[]) => string | undefined
  removeTask?: () => string | undefined
  /** The edited entry is a draft (SPEC 15): saving says so instead of promising the website. */
  draft?: () => boolean
  /** The site's time zone, for "online ab …" in messages. */
  timeZone?: () => string
  /** Someone removed the edited entry meanwhile (useKeptEntry): saving waits for a restore or "save as new". */
  removed?: () => boolean
  /** Switches the form to the language of a local copy before it is restored; false when it cannot now. Without it, copies in other languages are not offered. */
  otherLocale?: (locale: Locale) => Promise<boolean>
  /** "Gilt ab" of the form (a task sheet): the local copy keeps the day with the input and brings it back with it. */
  day?: Ref<string>
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
  /**
   * What a draft without a time still lacks (D116): the warnings of its last save, which the server checks for shape
   * only (D115). The fields show them as notes, not errors; publishing or planning shows the same as errors.
   */
  const notes = ref<Issue[]>([])
  /** Errors and notes, for the fields. */
  const fieldIssues = computed<FieldIssue[]>(() => [...issues.value, ...notes.value.map((n) => ({ ...n, note: true as const }))])
  const problem = ref('')
  /** Fields someone saved after the person's base: their values, the entry's rev, and who did it when the server says. */
  const conflict = ref<{ fields: string[]; data: Data; rev: number; by?: Record<string, Who> } | null>(null)
  const busy = ref(false)
  /** The last save went to approval (SPEC 17): the input stays, nothing changed on the website, so no new rev. Cleared by the next edit. */
  const waiting = ref(false)
  /**
   * The last save with a day changed nothing for that day (E6): no field differed from the stored one, or the server
   * answered that the day already holds these values. The form keeps its input and says so.
   */
  const unchangedDay = ref(false)
  // A save does not fail while the connection is down: Convex sends it once it is back. Until then the button says so.
  // Both signals count: Convex notices a lost network only when its socket closes, which can take up to a minute (its
  // inactivity check); the browser's own signal comes at once. A slow save on a working connection is not offline.
  const { isConnected } = useConvexConnectionState()
  const online = useOnline()
  const offline = computed(() => busy.value && (!isConnected.value || !online.value))
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
    // The same entry again (a language switch) keeps its notes; a just created one takes those of its create.
    const handed = entry ? handedNotes.get(entry._id) : undefined
    if (entry) handedNotes.delete(entry._id)
    notes.value = entry && handed?.rev === entry.rev ? handed.notes : entry !== undefined && entry._id === loadedId.value ? notes.value : []
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
    const other = (i: Issue) => i.path !== key && !i.path.startsWith(`${key}.`)
    if (!issues.value.every(other)) issues.value = issues.value.filter(other)
    if (!notes.value.every(other)) notes.value = notes.value.filter(other)
    waiting.value = false
    const next = { ...draft.value }
    if (value === undefined) delete next[key]
    else next[key] = value
    draft.value = next
  }

  function showError(e: OpError) {
    issues.value = []
    notes.value = []
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

  /**
   * A publish or a plan refused for its fields (D116): the fields show the server's errors, the empty required ones the
   * notes named among them. True when the refusal was of that kind.
   */
  function showFieldErrors(e: OpError): boolean {
    if (e.code !== 'INVALID' || !e.details?.errors) return false
    issues.value = e.details.errors
    notes.value = []
    return true
  }

  /** What the last save asked for: `saveAgain` repeats it after a conflict answer, so Veröffentlichen stays one. */
  let asked: { at?: number } | true | undefined
  /**
   * Saves; resolves true when done (nothing to save counts as done). `publish` when creating: `{}` online now, `{ at }` scheduled; absent a draft. On a live entry `true` puts the
   * saved fields online at once; absent, they wait as unpublished changes. `from` (a day after today, an online entry):
   * the changed fields become a dated change of that day (D125); the entry stays as it is, so the form goes back to it.
   * `send`: fields sent even when they equal the stored value, so a change of that day the form was filled from is
   * replaced, a field put back to its stored value included (the task sheet's "Bearbeiten", E3).
   */
  function save(rev = baseRev.value, publish?: { at?: number } | true, from?: string, send?: readonly string[]): Promise<boolean> {
    // A removed entry cannot take a save: the person restores it or saves the input as a new entry.
    if (o.removed?.()) return Promise.resolve(false)
    asked = publish
    return write(rev, publish, undefined, from, send)
  }

  /**
   * The last save's publish step again, on the base a conflict answer merged onto (Alles bearbeiten). The task sheet saves
   * through its own step instead, which reads its day field at that moment (H1).
   */
  function saveAgain(): Promise<boolean> {
    return save(baseRev.value, asked)
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

  async function write(rev: number, publishAs?: { at?: number } | true, asNew?: { task?: string }, from?: string, send: readonly string[] = []): Promise<boolean> {
    if (busy.value) return false
    await flush()
    if (blockers.size) {
      problem.value = [...new Set(blockers.values())].join(' ')
      return false
    }
    busy.value = true
    unchangedDay.value = false
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
        const publish = publishAs === true ? {} : publishAs
        const op = opFor({ brick: o.brickKey(), data, task, publish })
        const result = await ops.createEntry({ brick: o.brickKey(), data: data as Record<string, Json>, task, removeTask: o.removeTask?.(), op, label: t('ops.saved'), publish, timeZone: o.timeZone?.(), main: o.main() })
        if (result.entry === undefined) waiting.value = true
        else created.value = result.entry
        // A new draft without a time: what it lacks shows as notes, here and on its own page (`handedNotes`).
        notes.value = publish === undefined ? result.warnings ?? [] : []
        if (result.entry !== undefined && result.rev !== undefined && notes.value.length) handedNotes.set(result.entry, { rev: result.rev, notes: notes.value })
        // Saved: what was sent no longer counts as open input (a second Speichern would create another).
        initial.value = submitted
      } else {
        // Published at once, the form's fields that wait unpublished go too: the form showed them, so they are the input.
        const held = publishAs === true ? (o.entry()!.pending?.fields ?? []) : []
        const roots = [...new Set([...changedRoots(baseline.value, submitted), ...held, ...send])].filter((k) => keys().includes(k))
        if (!roots.length && !confirm.value.length) {
          // Nothing for that day: not done, so the sheet does not close as if a change were planned.
          if (from === undefined) return true
          unchangedDay.value = true
          return false
        }
        const values = Object.fromEntries(roots.map((k) => [k, submitted[k] ?? null]))
        // The server checks the task against the changed fields and the confirmed ones (entries.ts saveNow).
        const task = o.task?.([...new Set([...roots, ...confirm.value.map((leaf) => leaf.split('.')[0]!)])])
        const sent = { entry: o.entry()!._id, baseRev: rev, fields: values, task, ...(o.allLanguages ? {} : { locale: o.locale() }), ...(confirm.value.length ? { confirm: confirm.value } : {}), ...(publishAs === true ? { publish: true as const } : {}), ...(from === undefined ? {} : { from }) }
        const result = await ops.saveEntry({ ...sent, op: opFor(sent), draft: o.draft?.() ?? false, main: o.main() })
        // A draft saved as a draft: what it lacks shows as notes. A live entry's warnings are about fields it did not
        // change, which its form does not show.
        notes.value = o.draft?.() && publishAs !== true ? result.warnings ?? [] : []
        if (result.rev === undefined) {
          // Nothing was written: the stored state, base and rev stay; only the input counts as handed in.
          waiting.value = true
        } else if (from !== undefined && 'unchanged' in result) {
          unchangedDay.value = true
          return false
        } else if (from !== undefined) {
          // The input went into a change for that day: the entry is as it was, and so is the form.
          baseRev.value = result.rev
          draft.value = copy(baseline.value)
          initial.value = copy(baseline.value)
          confirm.value = []
          unconfirmed = undefined
          if (key) clearLocalDraft(key)
          issues.value = []
          problem.value = ''
          return true
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
   * keeps the languages someone else changed meanwhile (a whole-value save would send the old ones back). It merges and
   * closes the conflict; the caller saves (H1). False without a conflict.
   */
  function keepMine(): boolean {
    const c = conflict.value
    if (!c) return false
    const theirs = storedOf(c.data)
    const mine = Object.fromEntries(changed.value.map((k) => [k, ownChangesOver(o.fields()[k]!, baseline.value[k], draft.value[k], theirs[k])]))
    baseline.value = copy(theirs)
    draft.value = copy({ ...theirs, ...mine } as Data)
    baseRev.value = c.rev
    conflict.value = null
    return true
  }
  /**
   * Both people's rows, when every conflicting field is a list or a rows field and no row was changed by both or
   * moved (mergeRows by `_id`, mergeKeyedRows by row key); null otherwise. "Beides behalten" shows only then.
   */
  const listMerge = computed<Data | null>(() => {
    const c = conflict.value
    if (!c?.fields.length) return null
    const merged: Data = {}
    for (const k of c.fields) {
      const type = o.fields()[k]?.type
      if (type === 'rows') {
        const m = mergeKeyedRows(baseline.value[k], draft.value[k], c.data[k])
        if (m.clashes.length) return null
        merged[k] = m.rows
        continue
      }
      if (type !== 'list') return null
      const m = mergeRows(baseline.value[k], draft.value[k], c.data[k])
      if (m.clashes.length || m.reordered) return null
      merged[k] = m.rows
    }
    return merged
  })
  /** "Beides behalten": the merged lists and the person's other changes over the current server state; the caller saves. */
  function mergeLists(): boolean {
    const c = conflict.value
    const merged = listMerge.value
    if (!c || !merged) return false
    const mine = Object.fromEntries(changed.value.map((k) => [k, draft.value[k]]))
    const theirs = storedOf(c.data)
    baseline.value = copy(theirs)
    draft.value = copy({ ...theirs, ...mine, ...merged } as Data)
    baseRev.value = c.rev
    conflict.value = null
    return true
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
    // Texts typed in another language than the copy's own (a quick-task sheet holds every language): a form that saves
    // one language would drop them, so only a form that saves every language offers the copy.
    if (!o.allLanguages && record.base && [...changedTextLanguages(o.brick().fields, record.base, record.fields)].some((l) => l !== record.locale)) return null
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
    // Area and title name the input on Heute; a single is named by its area.
    const brick = o.brick()
    const title = brick.kind === 'collection' ? typedTitle(brick, draft.value, o.main()) : undefined
    const from = o.day?.value
    writeLocalDraft(key, { v: 1, savedAt: Date.now(), baseRev: baseRev.value, locale: o.locale(), fields, brick: o.brickKey(), ...(title ? { title } : {}), ...(base ? { base } : {}), ...(from ? { from } : {}) })
  }
  // Typed back to what was there: the next write removes the copy (a save removes it at once, in write()).
  const localWriter = useLocalDraftWriter(() => [draft.value, o.day?.value], keepLocal)

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
    if (o.day) o.day.value = record.from ?? ''
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

  return { draft, baseline, initial, baseRev, ready, issues, notes, fieldIssues, showFieldErrors, problem, conflict, busy, offline, waiting, unchangedDay, confirm, blockers, isCreate, changed, dirty, created, localOffer, load, setField, flush, save, saveAgain, saveAsNew, restoreAndSave, discard, restoreLocal, dropLocal, keepMine, takeTheirs, listMerge, mergeLists }
}
