// Markdown tree -> Markdown text that leaves untouched top-level blocks byte for byte as they were
// (needed by the editor: a block the user did not touch must not be rewritten by the renderer).
// comark nodes carry no source positions, so the text of each top-level block is found by parsing
// pieces of the text and comparing them with the parse of the whole text.
import type { Node } from 'comark'
import { renderMarkdown } from 'comark/render'
import { parseMarkdown, type ParseOptions } from './markdown.ts'
import type { Json } from './types.ts'

/**
 * Render options used for every changed or new block. comark 0.7 has no style options for bullets,
 * emphasis or fences: it always writes `-` bullets, `**` for strong, `*` for emphasis and ``` fences,
 * which is what hand-written text mostly looks like. Only the two attribute options are set, and to
 * comark's own defaults, so they are stated here and not left to a future comark default.
 */
const RENDER_OPTIONS = { maxInlineAttributes: 3, blockAttributesStyle: 'codeblock' } as const

/**
 * The source of one or more neighbouring top-level nodes. One block has one node, except where the
 * text cannot be cut between them (`# Title` directly followed by a line of text) or where a piece
 * parses to no node at all (the `<!-- more -->` line: parseMarkdown removes it from the tree, so its
 * block has `nodes: []`).
 */
export interface MarkdownBlock {
  nodes: Json[]
  /** The exact text of the block, without the blank lines around it. */
  source: string
  /** The whitespace between the previous block (or the start of the text) and this one. */
  gap: string
}

export interface MarkdownBlocks {
  /** The same top-level nodes as `parseMarkdown(text).value.nodes`. */
  nodes: Json[]
  /** `blocks.flatMap(b => b.nodes)` equals `nodes`. A text that cannot be cut safely is one block. */
  blocks: MarkdownBlock[]
  /** The whitespace after the last block (usually the final newline). */
  tail: string
}

/** Heading ids depend on the headings before them, so a piece parsed alone gets other ids; compare without them. */
function canon(node: Json, ignoreIds: boolean): string {
  const strip = (n: Json): Json => {
    if (!Array.isArray(n)) return n
    const [tag, props, ...children] = n as [string | null, Record<string, Json>, ...Json[]]
    let p = props
    if (ignoreIds && typeof tag === 'string' && /^h[1-6]$/.test(tag) && p && 'id' in p) { p = { ...p }; delete p.id }
    return [tag, p, ...children.map(strip)]
  }
  return JSON.stringify(strip(node))
}

/**
 * Cuts a text into top-level blocks. Frontmatter is not part of the blocks: with `frontmatter: true`
 * the blocks cover `parseMarkdown(text).body` only, and the caller writes the frontmatter back itself.
 *
 * The text is split at blank lines, and neighbouring pieces are joined until the parse of the joined
 * piece equals the next nodes of the parse of the whole text (code fences, loose lists and components
 * contain blank lines). If that fails anywhere (footnotes, link reference definitions: their meaning
 * depends on other pieces), the whole body is one block.
 */
export async function markdownBlocks(text: string, options: ParseOptions = {}): Promise<MarkdownBlocks> {
  const full = await parseMarkdown(text, options)
  const nodes = full.value.nodes
  const body = full.body
  const whole = (): MarkdownBlocks => ({ nodes, blocks: [{ nodes, source: body.trim() ? body.trimEnd() : '', gap: '' }], tail: body.slice(body.trimEnd().length) })
  if (!body.trim()) return { nodes, blocks: [], tail: body }

  // trimStart/trimEnd drop the same white space as \s, and in linear time (/\s*$/ slows down on a long run of spaces).
  const lead = body.slice(0, body.length - body.trimStart().length)
  const tail = body.slice(body.trimEnd().length)
  const core = body.slice(lead.length, body.length - tail.length)
  const parts = core.split(/(\r?\n(?:[ \t]*\r?\n)+)/) // even: pieces, odd: the blank lines between them
  const pieceAt = (from: number, to: number) => parts.slice(from, to * 2 + 1).join('')
  const chunkOptions: ParseOptions = { ...options, frontmatter: false }
  const expected = nodes.map((n) => canon(n, true))

  const blocks: MarkdownBlock[] = []
  let at = 0 // index of the next node
  let gap = lead
  const pieceCount = (parts.length + 1) / 2
  for (let start = 0; start < pieceCount;) {
    let found = false
    for (let end = start + 1; end <= pieceCount; end++) {
      const source = pieceAt(start * 2, end - 1)
      const got = (await parseMarkdown(source, chunkOptions)).value.nodes
      if (got.length === 0 ? false : got.length > nodes.length - at || got.some((n, i) => canon(n, true) !== expected[at + i])) continue
      blocks.push({ nodes: nodes.slice(at, at + got.length), source, gap })
      at += got.length
      gap = parts[end * 2 - 1] ?? ''
      start = end
      found = true
      break
    }
    if (!found) return whole()
  }
  if (at !== nodes.length) return whole()
  return { nodes, blocks, tail }
}

const TASK_LIST = 'contains-task-list'

/**
 * Two shapes of a task list that comark 0.7 parses but cannot write back:
 * - a nested list makes the item `li > p > [input, text]`, and the writer expects the checkbox as the first
 *   child of the `li` (it writes `- [ ] - [x] b`). The text of the `p` moves into the `li`, as in an item without a nested list.
 * - an ordered task list gets `{.contains-task-list}` written around it (the writer hides that class on `ul` only).
 * The re-parse of the text gives the original tree again, so nothing else changes.
 */
function writable(node: Json): Json {
  if (!Array.isArray(node)) return node
  const [tag, props, ...children] = node as [string | null, Record<string, Json>, ...Json[]]
  let kids = children.map(writable)
  let own = props
  if (tag === 'ol' && typeof own?.class === 'string' && own.class.split(/\s+/).includes(TASK_LIST)) {
    const { class: classes, ...rest } = own
    const left = String(classes).split(/\s+/).filter((c) => c && c !== TASK_LIST).join(' ')
    own = left ? { ...rest, class: left } : rest
  }
  const first = kids[0]
  if (tag === 'li' && Array.isArray(first) && first[0] === 'p' && Object.keys(first[1] ?? {}).length === 0
    && Array.isArray(first[2]) && first[2][0] === 'input' && kids.slice(1).every((k) => Array.isArray(k) && (k[0] === 'ul' || k[0] === 'ol'))) {
    kids = [...first.slice(2), ...kids.slice(1)]
  }
  return [tag, own, ...kids] as Json
}

async function render(nodes: Json[], options: object): Promise<string> {
  return (await renderMarkdown({ nodes: nodes.map(writable) as Node[] }, { ...RENDER_OPTIONS, ...options })).replace(/\n+$/, '')
}

/** Longest common subsequence of two key lists, as pairs of indexes. Common start and end are trimmed first, so a small edit costs little. */
function lcs(a: string[], b: string[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  let lo = 0
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) { pairs.push([lo, lo]); lo++ }
  let ea = a.length, eb = b.length
  const tailPairs: Array<[number, number]> = []
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) { ea--; eb--; tailPairs.unshift([ea, eb]) }
  const w = eb - lo
  const table: Uint32Array[] = []
  for (let i = 0; i <= ea - lo; i++) table.push(new Uint32Array(w + 1))
  for (let i = ea - lo - 1; i >= 0; i--) for (let j = w - 1; j >= 0; j--) {
    table[i]![j] = a[lo + i] === b[lo + j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
  }
  for (let i = 0, j = 0; i < ea - lo && j < w;) {
    if (a[lo + i] === b[lo + j]) { pairs.push([lo + i, lo + j]); i++; j++ }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++
    else j++
  }
  return [...pairs, ...tailPairs]
}

export interface SerializeOptions {
  /** The blocks of the text the nodes came from (`markdownBlocks`). Blocks whose nodes are unchanged keep their source. */
  original?: MarkdownBlocks
  /** Passed on to comark's `renderMarkdown`. */
  [key: string]: unknown
}

/**
 * Markdown for a list of top-level nodes. With `original`, a block whose nodes all still exist,
 * unchanged and in order, is written as its original text (and original spacing); all other nodes are
 * rendered by comark and joined by one blank line. A `<!-- more -->` line (a block without nodes)
 * stays after the node that preceded it. Without `original` this is plain `renderMarkdown`.
 * Frontmatter is not handled: add it to the result yourself.
 */
export async function serializeMarkdown(nodes: readonly Json[], options: SerializeOptions = {}): Promise<string> {
  const { original, ...renderOptions } = options
  const list = nodes as Json[]
  if (!original) return render(list, renderOptions)

  // Match the old nodes with the new ones (deep-equal, in order).
  const flat = original.blocks.flatMap((block, b) => block.nodes.map((node) => ({ node, b })))
  const pairs = lcs(flat.map((f) => canon(f.node, false)), list.map((n) => canon(n, false)))
  const newOf = new Map<number, number>(pairs) // old node index -> new node index
  // Nodes that moved (out of the longest common order) still match an equal node elsewhere: a moved block keeps its text.
  const oldKeys = flat.map((f) => canon(f.node, false))
  const newKeys = list.map((n) => canon(n, false))
  const taken = new Set(newOf.values())
  oldKeys.forEach((key, o) => {
    if (newOf.has(o)) return
    const at = newKeys.findIndex((k, n) => k === key && !taken.has(n))
    if (at !== -1) { newOf.set(o, at); taken.add(at) }
  })
  // A block is kept when all its nodes matched and sit next to each other in the new list.
  const kept = new Map<number, number>() // new index of the block's first node -> block index
  const covered = new Set<number>() // new indexes written by a kept block
  let flatAt = 0
  original.blocks.forEach((block, b) => {
    const first = newOf.get(flatAt)
    let ok = block.nodes.length > 0 && first !== undefined
    for (let k = 0; ok && k < block.nodes.length; k++) ok = newOf.get(flatAt + k) === first! + k
    if (ok) { kept.set(first!, b); for (let k = 0; k < block.nodes.length; k++) covered.add(first! + k) }
    flatAt += block.nodes.length
  })
  // Blocks without nodes (the `<!-- more -->` line) stay behind their predecessor when that is kept;
  // when it was changed or deleted they go before the next kept block (or at the end).
  const firstNewOf = (b: number) => [...kept].find(([, k]) => k === b)?.[0]
  const after = new Map<number, MarkdownBlock[]>() // new index after which they go (-1: at the start)
  const before = new Map<number, MarkdownBlock[]>() // new index before which they go (list.length: at the end)
  const add = (map: typeof after, key: number, block: MarkdownBlock) => map.set(key, [...(map.get(key) ?? []), block])
  original.blocks.forEach((block, b) => {
    if (block.nodes.length > 0) return
    const prev = original.blocks[b - 1]
    if (b === 0) { add(after, -1, block); return }
    const prevFirst = prev && prev.nodes.length > 0 ? firstNewOf(b - 1) : undefined
    if (prevFirst !== undefined) { add(after, prevFirst + prev!.nodes.length - 1, block); return }
    if (prev && prev.nodes.length === 0) {
      // follows another node-less block: stay with it
      const key = [...after].find(([, v]) => v.includes(prev))?.[0]
      if (key !== undefined) { add(after, key, block); return }
    }
    const next = original.blocks.findIndex((_, k) => k > b && firstNewOf(k) !== undefined)
    add(before, next === -1 ? list.length : firstNewOf(next)!, block)
  })

  const out: string[] = []
  // Only the very first piece may start with whitespace, and only the original's own.
  const put = (gap: string, text: string, isFirstOriginal = false) => { out.push(out.length === 0 ? (isFirstOriginal ? gap : '') : gap, text) }
  const putAll = (blocks: MarkdownBlock[] | undefined) => { for (const block of blocks ?? []) put(block.gap || '\n\n', block.source) }
  putAll(after.get(-1))
  for (let i = 0; i <= list.length;) {
    putAll(before.get(i))
    if (i === list.length) break
    const b = kept.get(i)
    if (b !== undefined) {
      const block = original.blocks[b]!
      // The gap of the first block is the whitespace before the text; behind another block (it moved) that is a blank line.
      put(b === 0 && out.length > 0 ? '\n\n' : block.gap, block.source, b === 0)
      i += block.nodes.length
      putAll(after.get(i - 1))
      continue
    }
    let j = i
    while (j < list.length && !kept.has(j) && !covered.has(j) && !before.has(j)) j++
    put('\n\n', await render(list.slice(i, j), renderOptions))
    i = j
    putAll(after.get(j - 1))
  }
  return out.join('') + original.tail
}

/**
 * True when `text` survives a trip through comark's renderer: parse, render the whole tree, parse
 * again gives the same nodes. The editor opens a text in source mode when this is false. The
 * `<!-- more -->` line is not part of the nodes, so it does not count here (serializeMarkdown with
 * `original` keeps it). A text with parts the tree does not show (`hidden`) is never stable: written
 * from the tree, it would lose them. Frontmatter is read and ignored.
 */
export async function isStableMarkdown(text: string, options: ParseOptions = {}): Promise<boolean> {
  const first = await parseMarkdown(text, options)
  if (first.hidden) return false
  const again = await parseMarkdown(await render(first.value.nodes, {}), { ...options, frontmatter: false })
  return JSON.stringify(first.value.nodes) === JSON.stringify(again.value.nodes)
}
