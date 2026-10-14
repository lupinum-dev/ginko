// One form engine for Schnell ändern and Alles bearbeiten (UI.md 3.2, 4): a draft of root fields,
// the stored baseline, save or create with one opId per attempt, field errors, conflicts that keep
// the person's input, and "Noch richtig?" blockers from list rows.
import type { Brick, Fields, Json, Locale } from '@lupinum/ginko'
import { useI18n } from '#imports'
import type { Entry } from './useSiteData'
import type { OpError } from './useOps'
import { changedRoots, type Data } from '../utils/content'
import { BLOCKERS, FLUSHERS, type Issue } from '@lupinum/ginko-editor'

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
  /** Locale the translatable values are saved in (the main language in Schnell ändern). */
  locale: () => Locale
  task?: () => string | undefined
  removeTask?: () => string | undefined
  /** The edited entry is a draft (SPEC 15): saving says so instead of promising the website. */
  draft?: () => boolean
  /** The site's time zone, for "online ab …" in messages. */
  timeZone?: () => string
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
  const conflict = ref<{ fields: string[]; data: Data; rev: number } | null>(null)
  const busy = ref(false)
  /** The last save went to approval (SPEC 17): the input stays, nothing changed on the website, so no new rev. Cleared by the next edit. */
  const waiting = ref(false)
  const slow = ref(false)
  /** Leaves to confirm as translated without a change (Alles bearbeiten, foreign locale). */
  const confirm = ref<string[]>([])
  const blockers = reactive(new Map<string, string>())
  provide(BLOCKERS, blockers)
  const flushers = new Set<() => Promise<void>>()
  provide(FLUSHERS, flushers)

  const isCreate = computed(() => !o.entry())
  const keys = () => Object.keys(o.fields())
  const storedOf = (data: Data) => Object.fromEntries(keys().map((k) => [k, data[k]])) as Data

  /** Starts the form: `start` are the values shown (prefill or stored). */
  function load(start: Data) {
    const entry = o.entry()
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
  }

  const changed = computed(() => changedRoots(baseline.value, draft.value).filter((k) => keys().includes(k)))
  const dirty = computed(() => changedRoots(initial.value, draft.value).some((k) => keys().includes(k)) || confirm.value.length > 0)

  // Leaving with unsaved input asks first: the browser's back button, a link such as "Alle Bereiche",
  // closing or reloading the tab (break-it 9). A save on its way needs no question: it goes on.
  const unsaved = () => dirty.value && !busy.value
  const mayLeave = () => !unsaved() || window.confirm(t('ops.leaveConfirm'))
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
      conflict.value = { fields: (e.details.conflicts as string[] | undefined) ?? [], data: e.details.data as Data, rev: Number(e.details.rev) }
    } else {
      problem.value = e.message
    }
  }

  /** Saves; resolves true when done (nothing to save counts as done). */
  /** `publish` only when creating in a collection with drafts: `{}` online now, `{ at }` scheduled; absent a draft. */
  async function save(rev = baseRev.value, publish?: { at?: number }): Promise<boolean> {
    if (busy.value) return false
    // Typing from the last moments may still wait in an editor's pause: take it before reading the draft.
    await Promise.all([...flushers].map((flush) => flush()))
    if (blockers.size) {
      problem.value = [...new Set(blockers.values())].join(' ')
      return false
    }
    busy.value = true
    slow.value = false
    const timer = setTimeout(() => { slow.value = true }, 4000)
    const op = ops.opId()
    try {
      // What is sent: edits made while the call runs stay unsaved (and dirty), never marked as saved.
      const submitted = copy(draft.value)
      if (isCreate.value) {
        const result = await ops.createEntry({ brick: o.brickKey(), data: submitted as Record<string, Json>, task: o.task?.(), removeTask: o.removeTask?.(), op, label: t('ops.saved'), publish, timeZone: o.timeZone?.() })
        if (result.entry === undefined) waiting.value = true
        else created.value = result.entry
        // Saved: what was sent no longer counts as open input (a second Speichern would create another).
        initial.value = submitted
      } else {
        const roots = changedRoots(baseline.value, submitted).filter((k) => keys().includes(k))
        if (!roots.length && !confirm.value.length) return true
        const values = Object.fromEntries(roots.map((k) => [k, submitted[k] ?? null]))
        const result = await ops.saveEntry({
          entry: o.entry()!._id, baseRev: rev, fields: values, task: o.task?.(), locale: o.locale(),
          ...(confirm.value.length ? { confirm: confirm.value } : {}), op, draft: o.draft?.() ?? false,
        })
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
      issues.value = []
      problem.value = ''
      return true
    } catch (e) {
      showError(e as OpError)
      return false
    } finally {
      clearTimeout(timer)
      busy.value = false
      slow.value = false
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

  /** The person's own changes over the current server state; untouched fields take the server's values. */
  async function keepMine() {
    const c = conflict.value
    if (!c) return false
    const mine = Object.fromEntries(changed.value.map((k) => [k, draft.value[k]]))
    const theirs = storedOf(c.data)
    baseline.value = copy(theirs)
    draft.value = copy({ ...theirs, ...mine } as Data)
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

  return { draft, baseline, initial, baseRev, ready, issues, problem, conflict, busy, slow, waiting, confirm, blockers, isCreate, changed, dirty, created, load, setField, save, keepMine, takeTheirs }
}
