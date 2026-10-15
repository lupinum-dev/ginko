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
 * Set by a form in a foreign language (Alles bearbeiten, a quick-task sheet): the translation state of one translatable
 * leaf, by its path (`name`, or `days.<rowId>.dish` inside a list), the main-language text, and "Passt so".
 */
export interface TranslationState {
  state: (leaf: string) => 'missing' | 'stale' | 'fine' | undefined
  source: (leaf: string) => string
  confirm: (leaf: string) => void
  /** "Deutsch": the main language's name, for the source line and the hints. */
  mainName: () => string
  /**
   * Set when the website leaves the whole entry out of this language while the leaf has no text there (a page, such
   * as an event): the entry's title and the language's name ("Englisch"), so the hint says what goes missing instead
   * of promising the main-language text.
   */
  hiddenWithout?: (leaf: string) => { title: string; language: string } | undefined
}
export const TRANSLATION = Symbol('ginko:translation') as InjectionKey<TranslationState>
