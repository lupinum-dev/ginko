// Find and replace inside one field. A ProseMirror plugin keeps the term, the matches and the current match;
// matches are shown as decorations (`ginko-match`, and `ginko-match-current` on the current one).
// Replacing is a normal transaction on the matched text only, so untouched blocks stay byte for byte (see editor.ts).
// Every command selects the place it goes to and scrolls it into view itself (see `scrollToPos`).
import { Extension, type Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export interface SearchMatch { from: number; to: number }

export interface SearchState {
  term: string
  caseSensitive: boolean
  matches: SearchMatch[]
  /** Index into `matches` of the current match; -1 without matches. */
  current: number
}

export interface SearchOptions { caseSensitive?: boolean }

/** The plugin's state: the search, and a count of the commands that went somewhere, which the plugin view scrolls to. */
interface PluginState extends SearchState { reveals: number }

const EMPTY: PluginState = { term: '', caseSensitive: false, matches: [], current: -1, reveals: 0 }
export const searchKey = new PluginKey<PluginState>('ginkoSearch')

type Meta = { term: string; caseSensitive: boolean; current: number } | { current: number }
const REVEAL = 'ginkoSearchReveal'

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

/** The match at the cursor: first match at or after `from`, else the first. */
const nearest = (matches: SearchMatch[], from: number) => {
  const i = matches.findIndex((m) => m.to > from)
  return matches.length ? (i === -1 ? 0 : i) : -1
}

export const getSearch = (state: EditorState): SearchState => searchKey.getState(state) ?? EMPTY

/** Selects `from`–`to` and scrolls there once the view has it. */
const selectRange = (tr: Transaction, from: number, to: number) => tr.setSelection(TextSelection.create(tr.doc, from, to)).setMeta(REVEAL, true)
const select = (tr: Transaction, match: SearchMatch | undefined) => (match ? selectRange(tr, match.from, match.to) : tr)

type Sides = number | { top: number; right: number; bottom: number; left: number }
const side = (value: Sides | undefined, name: 'top' | 'right' | 'bottom' | 'left', fallback: number) =>
  value === undefined ? fallback : typeof value === 'number' ? value : value[name]

/**
 * Scrolls `pos` into view in each scrolling box around the editor and in the window, keeping the editor's
 * `scrollThreshold` and `scrollMargin` clear (sticky bars), as ProseMirror does for the selection. ProseMirror's own
 * `tr.scrollIntoView()` does nothing while the focus is outside the editor, and here it is in the search field.
 */
function scrollToPos(view: EditorView, pos: number) {
  let rect = view.coordsAtPos(pos)
  const threshold = view.someProp('scrollThreshold')
  const margin = view.someProp('scrollMargin')
  const win = view.dom.ownerDocument.defaultView
  if (!win) return
  for (let el: HTMLElement | null = view.dom.parentElement; el; el = el.parentElement) {
    const atTop = el === win.document.body
    const box = atTop ? { top: 0, left: 0, bottom: win.innerHeight, right: win.innerWidth } : el.getBoundingClientRect()
    const move = (start: 'top' | 'left', end: 'bottom' | 'right') => {
      if (rect[start] < box[start] + side(threshold, start, 0)) return rect[start] - box[start] - side(margin, start, 5)
      if (rect[end] > box[end] - side(threshold, end, 0)) return rect[end] - box[end] + side(margin, end, 5)
      return 0
    }
    const dy = move('top', 'bottom')
    const dx = move('left', 'right')
    if (atTop) {
      if (dx || dy) win.scrollBy(dx, dy)
      break
    }
    const { scrollTop, scrollLeft } = el
    el.scrollTop += dy
    el.scrollLeft += dx
    const movedY = el.scrollTop - scrollTop
    const movedX = el.scrollLeft - scrollLeft
    rect = { top: rect.top - movedY, bottom: rect.bottom - movedY, left: rect.left - movedX, right: rect.right - movedX }
    // A fixed box (a dialog) does not move with the page: nothing outside it needs to scroll.
    if (getComputedStyle(el).position === 'fixed') break
  }
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
      /** Sets the term (empty clears it). Case-insensitive unless `caseSensitive`. The current match is the first one at or after the cursor; it is selected and scrolled to. */
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
        if (dispatch) {
          const caseSensitive = options?.caseSensitive ?? false
          const matches = findMatches(tr.doc, term, caseSensitive)
          const current = nearest(matches, tr.selection.from)
          select(tr.setMeta(searchKey, { term, caseSensitive, current } satisfies Meta).setMeta('addToHistory', false), matches[current])
        }
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
          selectRange(tr, first.from, first.from + text.length)
        }
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin<PluginState>({
      key: searchKey,
      state: {
        init: () => EMPTY,
        apply(tr, old, _before, after) {
          const reveals = old.reveals + (tr.getMeta(REVEAL) ? 1 : 0)
          const meta = tr.getMeta(searchKey) as Meta | undefined
          if (meta && 'term' in meta) return { ...build(after.doc, meta.term, meta.caseSensitive, meta.current), reveals }
          if (meta) return { ...old, current: clamp(meta.current, old.matches.length), reveals }
          if (tr.docChanged && old.term) return { ...build(after.doc, old.term, old.caseSensitive, old.current), reveals }
          return reveals === old.reveals ? old : { ...old, reveals }
        },
      },
      view: () => ({
        update(view, before) {
          if (searchKey.getState(view.state)?.reveals !== searchKey.getState(before)?.reveals) scrollToPos(view, view.state.selection.head)
        },
      }),
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
