import type { InjectionKey } from 'vue'
// Validation issues from the server (SPEC 2.3: dotted paths, list rows by _id, locale last).
export interface Issue { path: string; message: string; code?: string }

/** Issues that belong exactly to this field (its own path, its locale leaf, an image's alt text), not to its list rows. */
export function ownIssues(issues: readonly Issue[], path: string, locales: readonly string[]): Issue[] {
  return issues.filter((i) => i.path === path || i.path === `${path}.alt` || locales.some((l) => i.path === `${path}.${l}`))
}

/** Issues under a path, for lists that show row problems. */
export function issuesUnder(issues: readonly Issue[], path: string): Issue[] {
  return issues.filter((i) => i.path === path || i.path.startsWith(`${path}.`))
}

/** Set by the sheet: a field that still needs a confirmation blocks saving (UI.md 5, "Noch richtig?"). */
export const BLOCKERS = Symbol('ginko:blockers') as InjectionKey<Map<string, string>>

/** Set by the form: fields that hold input back (the Markdown editor's pause) hand it over before a save. */
export const FLUSHERS = Symbol('ginko:flushers') as InjectionKey<Set<() => Promise<void>>>

/**
 * Set by Alles bearbeiten in a foreign language: the translation state of one translatable leaf, by its
 * path (`name`, or `days.<rowId>.dish` inside a list), the main-language text, and "Englisch stimmt noch".
 */
export interface TranslationState {
  state: (leaf: string) => 'missing' | 'stale' | 'fine' | undefined
  /** The whole stored main-language text of a leaf (Markdown as written). */
  source: (leaf: string) => string
  confirm: (leaf: string) => void
  /** "Deutsch": the main language's name, for the source line and the hints. */
  mainName: () => string
  /** The note under a leaf whose translation is missing: what the website shows without it. */
  missingNote: (leaf: string) => string
  /** Where the entry's history shows what changed in the main language ("Was hat sich geändert?"). */
  changesUrl: () => string | undefined
  /** The entry's page in the open language (none while it is not translated), and its link while it is online. */
  address: () => { path: string; href?: string } | undefined
}
export const TRANSLATION = Symbol('ginko:translation') as InjectionKey<TranslationState>
