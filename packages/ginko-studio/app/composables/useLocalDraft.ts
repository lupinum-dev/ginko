// Unsaved input of an entry form, kept in this browser (N2): a reload, a crash or a closed tab must not
// lose it. The form offers it back ("Restore your unsaved changes?") and never applies it silently.
// Storage can be blocked or full (private window), so every access is guarded: then there is simply
// no local copy. Two tabs on the same entry write the same key; the last write wins.
import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { Data } from '../utils/content'

export interface LocalDraft {
  v: 1
  savedAt: number
  /** The revision the input was based on: roots changed on the server after it are a conflict. */
  baseRev: number
  /** The language the translatable values were edited in. */
  locale: string
  /** An edit: only the changed root fields. A new entry: the whole form. */
  fields: Data
  /** The entry's area and its title as typed, for the list on Heute (records written before had neither). */
  brick?: string
  title?: string
}

const PREFIX = 'ginko:draft:v1:'
const KEEP = 30
const MAX_AGE = 14 * 24 * 60 * 60 * 1000
const MAX_CHARS = 1_000_000
const PAUSE = 800

/** `target`: the entry id, `new:<brick>` for a new entry, `task:<taskRef>` for a create task. */
export const localDraftKey = (site: string, user: string, target: string) => `${PREFIX}${site}:${user}:${target}`

function isLocalDraft(value: unknown): value is LocalDraft {
  return typeof value === 'object' && value !== null
    && 'v' in value && value.v === 1
    && 'savedAt' in value && typeof value.savedAt === 'number'
    && 'baseRev' in value && typeof value.baseRev === 'number'
    && 'locale' in value && typeof value.locale === 'string'
    && 'fields' in value && typeof value.fields === 'object' && value.fields !== null && !Array.isArray(value.fields)
}

function parse(raw: string | null): LocalDraft | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return isLocalDraft(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Every stored record, oldest first; broken and expired ones are dropped on the way. */
function records(now: number): { key: string; savedAt: number }[] {
  const found: { key: string; savedAt: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(PREFIX)) found.push({ key, savedAt: parse(localStorage.getItem(key))?.savedAt ?? 0 })
  }
  const kept = found.filter((r) => {
    if (now - r.savedAt <= MAX_AGE) return true
    localStorage.removeItem(r.key)
    return false
  })
  return kept.sort((a, b) => a.savedAt - b.savedAt)
}

export function readLocalDraft(key: string, now = Date.now()): LocalDraft | undefined {
  try {
    const record = parse(localStorage.getItem(key))
    if (record && now - record.savedAt <= MAX_AGE) return record
    localStorage.removeItem(key)
  } catch {
    // No storage, no local copy.
  }
  return undefined
}

/** This person's unsaved input on this site, newest first, with the target of its key: the list on Heute. */
export function listLocalDrafts(site: string, user: string, now = Date.now()): (LocalDraft & { target: string })[] {
  const prefix = localDraftKey(site, user, '')
  try {
    return records(now).filter((r) => r.key.startsWith(prefix)).reverse().flatMap((r) => {
      const record = parse(localStorage.getItem(r.key))
      return record ? [{ ...record, target: r.key.slice(prefix.length) }] : []
    })
  } catch {
    return []
  }
}

export function writeLocalDraft(key: string, record: LocalDraft) {
  try {
    const json = JSON.stringify(record)
    if (json.length > MAX_CHARS) return
    const others = records(record.savedAt).filter((r) => r.key !== key)
    for (const old of others.slice(0, Math.max(0, others.length - (KEEP - 1)))) localStorage.removeItem(old.key)
    try {
      localStorage.setItem(key, json)
    } catch {
      // Full: make room by the oldest record and try once more.
      const oldest = records(record.savedAt).find((r) => r.key !== key)
      if (!oldest) return
      localStorage.removeItem(oldest.key)
      localStorage.setItem(key, json)
    }
  } catch {
    // No storage, no local copy.
  }
}

export function clearLocalDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to clear.
  }
}

/** On sign-out: the person's drafts must not stay on a shared computer. */
export function forgetLocalDrafts(user: string) {
  try {
    const mine = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX) && key.slice(PREFIX.length).split(':')[1] === user) mine.push(key)
    }
    for (const key of mine) localStorage.removeItem(key)
  } catch {
    // Nothing to clear.
  }
}

/**
 * Calls `write` a moment after the last change of `source`, and at once when the page hides (mobile
 * Safari fires no beforeunload) or the form closes. Only a pending write is flushed; `cancel` drops it.
 */
export function useLocalDraftWriter(source: () => unknown, write: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const flush = () => {
    if (timer === undefined) return
    cancel()
    write()
  }
  watch(source, () => {
    clearTimeout(timer)
    timer = setTimeout(flush, PAUSE)
  }, { deep: true })
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
  onMounted(() => {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
  })
  onBeforeUnmount(() => {
    flush()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { cancel }
}
