// Writes from the UI (UI.md 3.2). Every user action gets one opId; Convex resends the same request
// after a lost connection, and the server answers a repeated opId with the stored result. Success
// shows one honest message with Rückgängig; failures come back as OpError for the form to show.
import { api } from '#convex/api'
import { useI18n } from '#imports'
import type { InjectionKey } from 'vue'
import type { Json } from '@lupinum/ginko'
import { whenText } from '../utils/when'
import { messageOf, type Described } from '../utils/messageOf'
import type { Who } from '../utils/who'

export interface OpError {
  code: string
  message: string
  details?: {
    errors?: { path: string; message: string; code: string; key?: string; params?: Described['params'] }[]
    conflicts?: string[]; rev?: number; data?: Record<string, Json>; deleted?: boolean
    /** A conflict: who made the newest change of each conflicting field. */
    by?: Record<string, Who>
    [key: string]: unknown
  }
}

/** A write the approval policy turned into a proposal: nothing was written, so it has no entry, rev or change (SPEC 17). */
export const isProposal = (result: unknown): result is { proposal: string; status: 'open' } =>
  !!result && typeof result === 'object' && typeof (result as { proposal?: unknown }).proposal === 'string'

/** The server's `{ code, key, params, message, details }` with `message` in the Studio's language (messageOf), or a generic connection/unknown failure. */
export function opErrorOf(error: unknown): OpError {
  const { t } = useI18n()
  const e = error as { code?: string; message?: string; data?: unknown; kind?: string }
  const data = e?.data && typeof e.data === 'object' ? (e.data as Described & { code?: string; details?: OpError['details'] }) : undefined
  if (data?.code) return { code: data.code, message: messageOf({ ...data, message: data.message ?? e.message }), details: data.details }
  if (e?.kind === 'transport') return { code: 'NETWORK', message: t('problem.offline') }
  // Anything without the server's message (a timeout, "Unknown Convex error") gets a generic one;
  // the technical text goes to the console for us, not to the person.
  console.error(error)
  return { code: e?.code ?? 'UNKNOWN', message: t('problem.generic') }
}

/**
 * Undo, remove and restore run from the message at the bottom, after the sheet that saved is gone.
 * A mutation belongs to the component that created it and is cancelled with it, so these three are
 * created once in app.vue (provideLastingOps) and live as long as the app.
 */
const LASTING = Symbol('ginko:lasting-ops') as InjectionKey<ReturnType<typeof lastingOps>>
function lastingOps() {
  return {
    remove: useConvexMutation(api.entries.remove),
    restore: useConvexMutation(api.entries.restore),
    undo: useConvexMutation(api.entries.undo),
    publish: useConvexMutation(api.entries.publish),
    unpublish: useConvexMutation(api.entries.unpublish),
    move: useConvexMutation(api.entries.move),
  }
}
export function provideLastingOps() {
  provide(LASTING, lastingOps())
}

export function useOps(site: Ref<string> | ComputedRef<string>) {
  const { show } = useToast()
  // Read once in setup; `t` and `format` follow the language later, so the handlers below may use them after an await.
  const { t, format } = useI18n()
  const save = useConvexMutation(api.entries.save)
  const create = useConvexMutation(api.entries.create)
  const revert = useConvexMutation(api.entries.revert)
  const purge = useConvexMutation(api.entries.purge)
  const lasting = inject(LASTING)
  if (!lasting) throw new Error('provideLastingOps() is missing in app.vue')
  const { remove, restore, undo, publish, unpublish, move } = lasting
  /** Nothing was written: say so and offer no Undo. The server does not name the approver, so neither does the message. */
  const sentForApproval = () => show(t('review.sent'))

  const opId = () => crypto.randomUUID()

  async function undoChange(change: string, task?: string) {
    try {
      const result = await undo.mutate({ site: site.value, opId: opId(), task, change })
      if (isProposal(result)) return sentForApproval()
      show(t('ops.undone'))
    } catch (error) {
      // One message, the server's: it says why (saved again since, removed, fields restructured).
      show(opErrorOf(error).message, { tone: 'err' })
    }
  }

  /** `draft`: the entry was never on the website, so the message does not mention it (SPEC 15). True when the entry is gone; false when the removal went to approval. */
  async function removeEntry(entry: string, lifeRev: number, task?: string, label = t('ops.removed'), draft = false) {
    const result = await remove.mutate({ site: site.value, opId: opId(), task, entry, lifeRev }) as { lifeRev: number }
    if (isProposal(result)) { sentForApproval(); return false }
    show(draft ? label : `${label} ${t('ops.liveHint')}`, { action: { label: t('ops.undo'), run: async () => { await restoreEntry(entry, result.lifeRev, task, t('ops.restored'), draft) } } })
    return true
  }

  /** True when the entry is back; false when the restore went to approval or failed (the message says which). */
  async function restoreEntry(entry: string, lifeRev: number, task?: string, label = t('ops.restored'), draft = false) {
    try {
      const result = await restore.mutate({ site: site.value, opId: opId(), task, entry, lifeRev }) as { lifeRev: number }
      if (isProposal(result)) { sentForApproval(); return false }
      show(draft ? label : `${label} ${t('ops.liveHint')}`, { action: { label: t('ops.undo'), run: async () => { await removeEntry(entry, result.lifeRev, task, t('ops.removed'), draft) } } })
      return true
    } catch (error) {
      show(opErrorOf(error).message, { tone: 'err' })
      return false
    }
  }

  /** `at` absent: online now. Undo takes it back to a draft (SPEC 15). `timeZone` words the scheduled time. */
  async function publishEntry(entry: string, lifeRev: number, opts: { at?: number; task?: string; timeZone: string }) {
    const result = await publish.mutate({ site: site.value, opId: opId(), task: opts.task, entry, lifeRev, at: opts.at }) as { lifeRev: number }
    if (isProposal(result)) { sentForApproval(); return result }
    const text = opts.at === undefined ? `${t('ops.published')} ${t('ops.liveHint')}` : t('ops.scheduled', { time: whenText(opts.at, opts.timeZone, format) })
    const back = { task: opts.task, timeZone: opts.timeZone, wasLive: opts.at === undefined, at: opts.at }
    show(text, { action: { label: t('ops.undo'), run: async () => { await unpublishEntry(entry, result.lifeRev, back).catch((e) => show(opErrorOf(e).message, { tone: 'err' })) } } })
    return result
  }

  /** A live entry goes back to being a draft; a scheduled draft (`wasLive: false`, its time in `at`) loses its time. */
  async function unpublishEntry(entry: string, lifeRev: number, opts: { task?: string; timeZone: string; wasLive: boolean; at?: number }) {
    const result = await unpublish.mutate({ site: site.value, opId: opId(), task: opts.task, entry, lifeRev }) as { lifeRev: number; contentRev: number }
    if (isProposal(result)) { sentForApproval(); return result }
    const text = opts.wasLive ? t('ops.unpublished') : t('ops.scheduleCleared')
    // Undo restores what was: live again, or the old time while it is still ahead.
    const at = !opts.wasLive && opts.at !== undefined && opts.at > Date.now() ? opts.at : undefined
    show(text, { action: { label: t('ops.undo'), run: async () => { await publishEntry(entry, result.lifeRev, { task: opts.task, timeZone: opts.timeZone, at }).catch((e) => show(opErrorOf(e).message, { tone: 'err' })) } } })
    return result
  }

  /** Moves one entry one place up or down in its list; false when it failed (the list then stays as it is). */
  async function moveEntry(entry: string, direction: 'up' | 'down') {
    try {
      await move.mutate({ site: site.value, opId: opId(), entry, direction })
      return true
    } catch (error) {
      show(opErrorOf(error).message, { tone: 'err' })
      return false
    }
  }

  /** Deletes a removed entry for good (owners and admins). It cannot be undone, so the message offers no Rückgängig. True when it is gone. */
  async function purgeEntry(entry: string, lifeRev: number, title: string) {
    try {
      await purge.mutate({ site: site.value, opId: opId(), entry, lifeRev })
      show(t('ops.purged', { title }))
      return true
    } catch (error) {
      show(opErrorOf(error).message, { tone: 'err' })
      return false
    }
  }

  /** Goes back to the version after `change` as a normal save (UI.md 10.5); undo works like for any save. */
  async function revertEntry(entry: string, change: string, task?: string) {
    try {
      const result = await revert.mutate({ site: site.value, opId: opId(), task, entry, change }) as { change?: string; proposal?: string }
      if (result.proposal) sentForApproval()
      else if (!result.change) show(t('history.alreadyThere'))
      else {
        const made = result.change
        show(`${t('history.reverted')} ${t('ops.liveHint')}`, { action: { label: t('ops.undo'), run: () => undoChange(made, task) } })
      }
    } catch (error) {
      show(opErrorOf(error).message, { tone: 'err' })
    }
  }

  return {
    opId,
    revertEntry,
    moveEntry,
    /** Saves changed root fields. Throws OpError; on success shows the message with Rückgängig. */
    async saveEntry(args: { entry: string; baseRev: number; fields: Record<string, Json | null>; task?: string; locale?: string; confirm?: string[]; op: string; draft?: boolean }) {
      try {
        const result = await save.mutate({ site: site.value, opId: args.op, task: args.task, entry: args.entry, baseRev: args.baseRev, fields: args.fields, locale: args.locale, confirm: args.confirm }) as { change?: string; rev?: number; proposal?: string }
        // A change that needs a yes writes nothing yet (SPEC 17): say so instead of "Saved".
        if (isProposal(result)) {
          sentForApproval()
          return { proposal: result.proposal } as { proposal: string; rev?: undefined }
        }
        const change = result.change
        // A draft is not on the website, so the message does not promise it (SPEC 15).
        show(args.draft ? t('ops.draftSaved') : `${t('ops.saved')} ${t('ops.liveHint')}`, change ? { action: { label: t('ops.undo'), run: () => undoChange(change, args.task) } } : {})
        return { proposal: undefined, rev: result.rev as number }
      } catch (error) {
        throw opErrorOf(error)
      }
    },
    /** `removeTask` is the brick's remove task (staff need it to undo the creation). */
    async createEntry(args: { brick: string; data: Record<string, Json>; task?: string; removeTask?: string; op: string; label?: string; publish?: { at?: number }; timeZone?: string }) {
      try {
        const result = await create.mutate({ site: site.value, opId: args.op, task: args.task, brick: args.brick, data: args.data, publish: args.publish }) as { entry: string; state: 'draft' | 'live'; publishAt?: number }
        if (isProposal(result)) {
          sentForApproval()
          return { proposal: result.proposal } as { proposal: string; entry?: undefined }
        }
        // A collection with drafts makes a draft unless asked to publish (SPEC 15); the message says which.
        const text = result.state === 'live' ? `${args.label ?? t('ops.created')} ${t('ops.liveHint')}`
          : result.publishAt !== undefined ? t('ops.draftScheduled', { time: whenText(result.publishAt, args.timeZone ?? 'Europe/Vienna', format) })
          : t('ops.draftNotOnSite')
        // A new entry starts at lifeRev 1; undo removes it.
        show(text, { action: { label: t('ops.undo'), run: async () => { await removeEntry(result.entry, 1, args.removeTask, t('ops.removed')).catch((e) => show(opErrorOf(e).message, { tone: 'err' })) } } })
        return { proposal: undefined, entry: result.entry }
      } catch (error) {
        throw opErrorOf(error)
      }
    },
    /** `title` names the entry in the message, so the person sees which one went. True when it is removed; false on failure or when the removal went to approval. */
    async removeEntry(entry: string, lifeRev: number, task?: string, title?: string, draft = false) {
      try {
        return await removeEntry(entry, lifeRev, task, title ? t('ops.removedNamed', { title }) : t('ops.removed'), draft)
      } catch (error) {
        show(opErrorOf(error).message, { tone: 'err' })
        return false
      }
    },
    restoreEntry,
    purgeEntry,
    undoChange,
    publishEntry,
    unpublishEntry,
  }
}
