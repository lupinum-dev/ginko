// The facts in the Studio as components read them: what each fact shows (chips, their panel, the copies the editor
// points out) and which texts quote the fields of the entry that is open. The queries are in composables/useFacts.
import type { api } from '#convex/api'
import type { FunctionReturnType } from 'convex/server'
import type { InjectionKey } from 'vue'

export type StudioFact = FunctionReturnType<typeof api.facts.values>[number]
export type FactQuote = FunctionReturnType<typeof api.facts.uses>[string][number]

/** The site's facts in the language of one text (undefined while they load), and the site, for links to their entry. */
export interface EditorFacts { values: () => readonly StudioFact[] | undefined; slug: () => string }

/**
 * Provided by the site layout: called in a component's setup with the language of a text, it returns the site's facts
 * in that language (one query per language, shared by every editor that asks for it).
 */
export const EDITOR_FACTS: InjectionKey<(locale: () => string) => EditorFacts> = Symbol('ginko:editor-facts')

/** Provided by a form of one entry: the texts that quote each of its fields, by field key (none while they load), and the site. */
export interface FactUses { slug: () => string; quotes: () => Readonly<Record<string, readonly FactQuote[]>> | undefined }
export const FACT_USES: InjectionKey<FactUses> = Symbol('ginko:fact-uses')
