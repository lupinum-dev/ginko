// Find and replace inside one field. A ProseMirror plugin keeps the term, the matches and the current match;
// matches are shown as decorations (`ginko-match`, and `ginko-match-current` on the current one).
// Replacing is a normal transaction on the matched text only, so untouched blocks stay byte for byte (see editor.ts).
import { Extension, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchMatch { from: number; to: number }

export interface SearchState {
  term: string
  caseSensitive: boolean
  matches: SearchMatch[]
  /** Index into `matches` of the current match; -1 without matches. */
  current: number
}

export interface SearchOptions { caseSensitive?: boolean }

const EMPTY: SearchState = { term: '', caseSensitive: false, matches: [], current: -1 }
export const searchKey = new PluginKey<SearchState>('ginkoSearch')

type Meta = { term: string; caseSensitive: boolean; current?: number } | { current: number }

/** All matches in the text of each textblock. A match does not span two blocks; an inline atom (picture, box) counts as one character that never matches. */
export function findMatches(doc: PmNode, term: string, caseSensitive: boolean): SearchMatch[] {
  if (!term) return []
  const needle = caseSensitive ? term : term.toLowerCase()
  const found: SearchMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, undefined, '￼')
    const haystack = caseSensitive ? text : text.toLowerCase()
    // Lower-casing can change the length (rare letters); then offsets would be wrong, so such a block is searched case-sensitively.
    const hay = haystack.length === text.length ? haystack : text
    const pin = haystack.length === text.length ? needle : term
    for (let at = hay.indexOf(pin); at !== -1; at = hay.indexOf(pin, at + pin.length)) {
      found.push({ from: pos + 1 + at, to: pos + 1 + at + pin.length })
    }
    return false
  })
  return found
}

const clamp = (index: number, total: number) => (total === 0 ? -1 : Math.min(Math.max(index, 0), total - 1))

function build(doc: PmNode, term: string, caseSensitive: boolean, current: number): SearchState {
  const matches = findMatches(doc, term, caseSensitive)
  return { term, caseSensitive, matches, current: clamp(current, matches.length) }
}

/** The state of the search at the cursor: first match at or after `from`, else the first. */
const nearest = (matches: SearchMatch[], from: number) => {
  const i = matches.findIndex((m) => m.to > from)
  return matches.length ? (i === -1 ? 0 : i) : -1
}

export const getSearch = (state: EditorState): SearchState => searchKey.getState(state) ?? EMPTY

function select(tr: Transaction, match: SearchMatch | undefined) {
  if (!match) return tr
  return tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView()
}

function go(state: EditorState, tr: Transaction, step: 1 | -1, dispatch: boolean): boolean {
  const search = getSearch(state)
  if (!search.matches.length) return false
  if (dispatch) {
    const next = (search.current + step + search.matches.length) % search.matches.length
    select(tr.setMeta(searchKey, { current: next } satisfies Meta), search.matches[next])
  }
  return true
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ginkoSearch: {
      /** Sets the term (empty clears it). Case-insensitive unless `caseSensitive`. The current match is the first one at or after the cursor. */
      setSearch: (term: string, options?: SearchOptions) => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      /** Replaces the current match; the next match becomes current. */
      replaceCurrent: (text: string) => ReturnType
      /** Replaces every match in one transaction: one undo step. The first replaced place is selected and scrolled to. */
      replaceAll: (text: string) => ReturnType
    }
  }
}

export const SearchExtension = Extension.create({
  name: 'ginkoSearch',
  addCommands() {
    return {
      setSearch: (term, options) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(searchKey, { term, caseSensitive: options?.caseSensitive ?? false } satisfies Meta).setMeta('addToHistory', false)
        return true
      },
      findNext: () => ({ state, tr, dispatch }) => go(state, tr, 1, !!dispatch),
      findPrev: () => ({ state, tr, dispatch }) => go(state, tr, -1, !!dispatch),
      replaceCurrent: (text) => ({ state, tr, dispatch }) => {
        const search = getSearch(state)
        const match = search.matches[search.current]
        if (!match) return false
        if (dispatch) {
          tr.insertText(text, match.from, match.to)
          // The next match behind the replaced text; at the end, the first again.
          const end = match.from + text.length
          const after = build(tr.doc, search.term, search.caseSensitive, 0)
          const i = after.matches.findIndex((m) => m.from >= end)
          tr.setMeta(searchKey, { term: search.term, caseSensitive: search.caseSensitive, current: i === -1 ? 0 : i } satisfies Meta)
          select(tr, after.matches[i === -1 ? 0 : i])
        }
        return true
      },
      replaceAll: (text) => ({ state, tr, dispatch }) => {
        const search = getSearch(state)
        if (!search.matches.length) return false
        if (dispatch) {
          for (const m of [...search.matches].reverse()) tr.insertText(text, m.from, m.to)
          // Later matches are replaced first, so the first one still starts where it did.
          const first = search.matches[0]!
          tr.setSelection(TextSelection.create(tr.doc, first.from, first.from + text.length)).scrollIntoView()
        }
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => EMPTY,
        apply(tr, old, _before, after) {
          const meta = tr.getMeta(searchKey) as Meta | undefined
          if (meta && 'term' in meta) {
            const built = build(after.doc, meta.term, meta.caseSensitive, 0)
            return { ...built, current: meta.current !== undefined ? clamp(meta.current, built.matches.length) : nearest(built.matches, after.selection.from) }
          }
          if (meta) return { ...old, current: clamp(meta.current, old.matches.length) }
          if (tr.docChanged && old.term) return build(after.doc, old.term, old.caseSensitive, old.current)
          return old
        },
      },
      props: {
        decorations(state) {
          const { matches, current } = getSearch(state)
          if (!matches.length) return null
          return DecorationSet.create(state.doc, matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'ginko-match ginko-match-current' : 'ginko-match' })))
        },
      },
    })]
  },
})

/** Term, match count and current match (1-based, 0 without matches), for a counter like "3 von 7". */
export function searchInfo(editor: Editor): { term: string; total: number; current: number } {
  const { term, matches, current } = getSearch(editor.state)
  return { term, total: matches.length, current: current + 1 }
}
