// Writes from the UI (UI.md 3.2). Every user action gets one opId; Convex resends the same request
// after a lost connection, and the server answers a repeated opId with the stored result. Success
// shows one honest message with Rückgängig; failures come back as OpError for the form to show.
import { api } from '#convex/api'
import { useI18n } from '#imports'
import { isConvexCallError, normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import type { InjectionKey } from 'vue'
import type { Json } from '@lupinum/ginko'
import { whenText } from '../utils/when'
import { UploadError } from './useUpload'
import { messageOf, type Described } from '../utils/messageOf'
import type { Who } from '../utils/who'

export interface OpError {
  code: string
  /** Empty for CANCELLED: nothing to show. */
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

/** The names of the files an undo or revert took out of the Files trash (the server lists them in `restoredFiles`). */
const restoredFilesOf = (result: unknown): unknown[] =>
  typeof result === 'object' && result !== null && 'restoredFiles' in result && Array.isArray(result.restoredFiles) ? result.restoredFiles : []

/**
 * What a failed call means for the person. A server error (`fail()` in ginko-server) keeps its code and details,
 * and its text in the Studio's language (messageOf). A call that a cancel or a closed sheet stopped has an empty
 * message: the person's own action stopped it, so nothing is shown. A sign-out meanwhile says so, and an
 * UploadError keeps its text. Anything else (a timeout, "Unknown Convex error") gets a generic text, or `fallback`
 * where the generic one ("Deine Eingaben sind noch da") does not fit, such as a list that failed to load; the
 * technical one goes to the console for us.
 */
export function opErrorOf(error: unknown, fallback?: string): OpError {
  const { t } = useI18n()
  if (error instanceof UploadError) return { code: 'UPLOAD', message: error.message }
  const e = normalizeConvexError(error)
  if (e.kind === 'server' && e.code) {
    // The server's error object is Ginko's own contract; Convex hands it over as it was thrown.
    const data: Described & Pick<OpError, 'details'> = e.data && typeof e.data === 'object' ? e.data : {}
    return { code: e.code, message: messageOf({ ...data, message: e.message }), details: data.details }
  }
  if (isConvexCallError(error, 'CANCELLED')) return { code: 'CANCELLED', message: '' }
  if (isConvexCallError(error, 'IDENTITY_CHANGED')) return { code: 'IDENTITY_CHANGED', message: t('errors.signedOut') }
  console.error(error)
  return { code: e.code ?? 'UNKNOWN', message: fallback ?? t('problem.generic') }
}

/** The server refused a call because nobody is signed in: the session ended on the server (signed out everywhere,
 *  revoked) while this browser still holds its token, so the auth state alone still says signed in. */
export function isSignInRequired(error: unknown): boolean {
  // No error is no sign-out; normalizing nothing would log an "unclassified error" on every page in development.
  if (error === undefined || error === null) return false
  const e = normalizeConvexError(error)
  return e.kind === 'server' && typeof e.data === 'object' && e.data !== null && 'key' in e.data && e.data.key === 'errors.signInRequired'
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

  /** `text` and a sentence per picture that came back from the Files trash with the old version. */
  const withRestored = (text: string, result: unknown) =>
    [text, ...restoredFilesOf(result).map((name) => t('ops.pictureBackFromTrash', { name: String(name) }))].join(' ')

  async function undoChange(change: string, task?: string) {
    try {
      const result = await undo.mutate({ site: site.value, opId: opId(), task, change })
      if (isProposal(result)) return sentForApproval()
      show(withRestored(t('ops.undone'), result))
    } catch (error) {
      // One message, the server's: it says why (saved again since, removed, fields restructured).
      show(opErrorOf(error).message, { tone: 'err' })
    }
  }

  /** `draft`: the entry was never on the website, so the message does not mention it (SPEC 15). True when the entry is gone; false when the removal went to approval. */
  async function removeEntry(entry: string, lifeRev: number, task?: string, label = t('ops.removed'), draft = false) {
    const result = await remove.mutate({ site: site.value, opId: opId(), task, entry, lifeRev })
    if (isProposal(result)) { sentForApproval(); return false }
    show(draft ? label : `${label} ${t('ops.liveHint')}`, { action: { label: t('ops.undo'), run: async () => { await restoreEntry(entry, result.lifeRev, task, t('ops.restored'), draft) } } })
    return true
  }

  /** True when the entry is back; false when the restore went to approval or failed (the message says which). */
  async function restoreEntry(entry: string, lifeRev: number, task?: string, label = t('ops.restored'), draft = false) {
    try {
      const result = await restore.mutate({ site: site.value, opId: opId(), task, entry, lifeRev })
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
    const result = await publish.mutate({ site: site.value, opId: opId(), task: opts.task, entry, lifeRev, at: opts.at })
    if (isProposal(result)) { sentForApproval(); return result }
    const text = opts.at === undefined ? `${t('ops.published')} ${t('ops.liveHint')}` : t('ops.scheduled', { time: whenText(opts.at, opts.timeZone, format) })
    const back = { task: opts.task, timeZone: opts.timeZone, wasLive: opts.at === undefined, at: opts.at }
    show(text, { action: { label: t('ops.undo'), run: async () => { await unpublishEntry(entry, result.lifeRev, back).catch((e) => show(opErrorOf(e).message, { tone: 'err' })) } } })
    return result
  }

  /** A live entry goes back to being a draft; a scheduled draft (`wasLive: false`, its time in `at`) loses its time. */
  async function unpublishEntry(entry: string, lifeRev: number, opts: { task?: string; timeZone: string; wasLive: boolean; at?: number }) {
    const result = await unpublish.mutate({ site: site.value, opId: opId(), task: opts.task, entry, lifeRev })
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
      const result = await revert.mutate({ site: site.value, opId: opId(), task, entry, change })
      if (isProposal(result)) sentForApproval()
      else if (!('change' in result)) show(t('history.alreadyThere'))
      else {
        const made = result.change
        show(withRestored(`${t('history.reverted')} ${t('ops.liveHint')}`, result), { action: { label: t('ops.undo'), run: () => undoChange(made, task) } })
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
        const result = await save.mutate({ site: site.value, opId: args.op, task: args.task, entry: args.entry, baseRev: args.baseRev, fields: args.fields, locale: args.locale, confirm: args.confirm })
        // A change that needs a yes writes nothing yet (SPEC 17): say so instead of "Saved".
        if (isProposal(result)) {
          sentForApproval()
          return { proposal: result.proposal }
        }
        const change = 'change' in result ? result.change : undefined
        // A draft is not on the website, so the message does not promise it (SPEC 15).
        show(args.draft ? t('ops.draftSaved') : `${t('ops.saved')} ${t('ops.liveHint')}`, change ? { action: { label: t('ops.undo'), run: () => undoChange(change, args.task) } } : {})
        return { proposal: undefined, rev: result.rev }
      } catch (error) {
        throw opErrorOf(error)
      }
    },
    /** `removeTask` is the brick's remove task (staff need it to undo the creation). */
    async createEntry(args: { brick: string; data: Record<string, Json>; task?: string; removeTask?: string; op: string; label?: string; publish?: { at?: number }; timeZone?: string }) {
      try {
        const result = await create.mutate({ site: site.value, opId: args.op, task: args.task, brick: args.brick, data: args.data, publish: args.publish })
        if (isProposal(result)) {
          sentForApproval()
          return { proposal: result.proposal }
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
