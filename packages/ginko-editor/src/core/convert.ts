// Comark tree (`[tag, props, ...children]` or a string) <-> ProseMirror JSON, without losing anything.
// Pure functions: no TipTap import, so they run in Node, in tests and in the browser.
//
// How nothing is lost:
// - Every node and mark has a `props` attribute with the comark props the editor has no own field for
//   (a heading's `id`, a list's `class`, a table cell's `style`, ...). They are written back as they were.
// - comark leaves single paragraphs "bare" (`["li", {}, "text"]`, `["callout", {}, "text"]`). The paragraph
//   node has `bare: true` for these and writes its children back without the `p`.
// - Marks nest in a fixed order in the tree (`***x***` is em > strong, `**_x_**` is strong > em), but a
//   ProseMirror text node only has a set of marks. Each mark remembers its depth in `order`.
// - What the editor cannot show (the footnote `section`) is a `raw` node that holds the comark node.
import type { ComponentRegistry } from '@lupinum/ginko'
import type { Json } from '@lupinum/ginko'

/** A ProseMirror node as JSON (`editor.getJSON()`). */
export interface GinkoDocNode {
  type: string
  attrs?: Record<string, any>
  content?: GinkoDocNode[]
  marks?: Array<{ type: string; attrs?: Record<string, any> }>
  text?: string
}
export type GinkoDoc = GinkoDocNode & { type: 'doc' }

type Props = Record<string, Json>
type Tuple = [string | null, Props, ...Json[]]

export interface ToDocOptions {
  /** With a registry, a component of kind `inline` sits inside a paragraph, one of kind `block` stands alone. */
  components?: ComponentRegistry
  /** The Markdown text of a node the editor cannot show (a `raw` node), for display. */
  sourceOf?: (node: Json) => string | undefined
}

// Tags that are inline in a text. `math` is inline or block by its class, `input` is the task checkbox.
const INLINE_TAGS = new Set(['strong', 'em', 'del', 'code', 'a', 'br', 'img', 'input'])
const MARK_OF: Record<string, string> = { strong: 'bold', em: 'italic', del: 'strike', code: 'code', a: 'link' }
const TAG_OF_MARK: Record<string, string> = { bold: 'strong', italic: 'em', strike: 'del', code: 'code', link: 'a' }
const MARK_RANK: Record<string, number> = { link: 0, bold: 1, italic: 2, strike: 3, code: 4 }
// A block node of the tree that is neither a component nor handled by its own case.
const PLAIN_BLOCKS = new Set(['li', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'section', 'code'])

const isTuple = (n: Json): n is Tuple => Array.isArray(n)
const tagOf = (n: Json): string | null | undefined => (isTuple(n) ? (n[0] as string | null) : undefined)
const propsOf = (n: Tuple): Props => (n[1] ?? {}) as Props
const childrenOf = (n: Tuple): Json[] => n.slice(2) as Json[]
const classes = (props: Props) => String(props.class ?? '').split(/\s+/)

/** `props` without the given keys, and the given keys on their own. */
function split(props: Props, keys: string[]): [Props, Record<string, Json | undefined>] {
  const rest: Props = {}
  const own: Record<string, Json | undefined> = {}
  for (const [k, v] of Object.entries(props)) (keys.includes(k) ? own : rest)[k] = v
  return [rest, own]
}

/** Props from attributes: a null or missing attribute is not written. */
function join(props: Props | undefined, own: Record<string, unknown>): Props {
  const out: Props = { ...(props ?? {}) }
  for (const [k, v] of Object.entries(own)) if (v !== null && v !== undefined) out[k] = v as Json
  return out
}

// ---------------------------------------------------------------- tree -> ProseMirror

export function toEditorDoc(nodes: readonly Json[], options: ToDocOptions = {}): GinkoDoc {
  const kindOf = (tag: string) => options.components && Object.hasOwn(options.components, tag) ? options.components[tag]!.kind : undefined
  const isInline = (n: Json, inInline: boolean): boolean => {
    if (typeof n === 'string') return true
    if (!isTuple(n)) return false
    const tag = n[0]
    if (tag === null) return true
    if (INLINE_TAGS.has(tag)) return true
    if (tag === 'math') return classes(propsOf(n)).includes('inline')
    const kind = kindOf(tag)
    if (kind) return kind === 'inline'
    return inInline && !PLAIN_BLOCKS.has(tag) && tag !== 'template'
  }

  const marksWith = (marks: GinkoDocNode['marks'], tag: string, props: Props) => {
    const type = MARK_OF[tag]!
    const [rest, own] = tag === 'a' ? split(props, ['href', 'title']) : [props, {}]
    const attrs: Record<string, unknown> = { props: rest, order: marks?.length ?? 0 }
    if (tag === 'a') { attrs.href = own.href ?? ''; attrs.title = own.title ?? null }
    return [...(marks ?? []), { type, attrs }]
  }

  const inlines = (children: Json[], marks: GinkoDocNode['marks'] = undefined): GinkoDocNode[] => {
    const out: GinkoDocNode[] = []
    const put = (node: GinkoDocNode) => { if (marks?.length) node.marks = marks; out.push(node) }
    for (const child of children) {
      if (typeof child === 'string') { if (child !== '') put({ type: 'text', text: child }); continue }
      if (!isTuple(child) || child[0] === null) continue
      const tag = child[0] as string
      const props = propsOf(child)
      const kids = childrenOf(child)
      if (tag === 'br') put({ type: 'hardBreak', attrs: { props } })
      else if (tag === 'img') {
        const [rest, own] = split(props, ['src', 'alt', 'title'])
        put({ type: 'image', attrs: { src: own.src ?? '', alt: own.alt ?? null, title: own.title ?? null, props: rest } })
      } else if (tag === 'input') {
        const [rest] = split(props, [':checked'])
        put({ type: 'taskCheckbox', attrs: { checked: ':checked' in props, props: rest } })
      } else if (tag === 'math') put({ type: 'mathInline', attrs: { text: String(kids[0] ?? ''), props } })
      else if (MARK_OF[tag]) out.push(...inlines(kids, marksWith(marks, tag, props)))
      else {
        const node: GinkoDocNode = { type: 'inlineComponent', attrs: { tag, props } }
        const content = inlines(kids)
        if (content.length) node.content = content
        put(node)
      }
    }
    return out
  }

  const paragraph = (children: Json[], bare: boolean, props: Props = {}): GinkoDocNode => {
    const content = inlines(children)
    return { type: 'paragraph', attrs: { bare, props }, ...(content.length ? { content } : {}) }
  }

  /** Children of a container: runs of inline nodes become bare paragraphs, the rest blocks. */
  const blocks = (children: Json[]): GinkoDocNode[] => {
    const out: GinkoDocNode[] = []
    let run: Json[] = []
    const flush = () => { if (run.length) out.push(paragraph(run, true)); run = [] }
    for (const child of children) {
      if (isInline(child, false)) { run.push(child); continue }
      flush()
      out.push(block(child))
    }
    flush()
    return out
  }

  const raw = (node: Json): GinkoDocNode => ({ type: 'raw', attrs: { node, markdown: options.sourceOf?.(node) ?? '' } })

  const block = (node: Json): GinkoDocNode => {
    if (!isTuple(node) || typeof node[0] !== 'string') return raw(node)
    const tag = node[0]
    const props = propsOf(node)
    const kids = childrenOf(node)
    const withContent = (type: string, attrs: Record<string, unknown>, content: GinkoDocNode[]): GinkoDocNode =>
      ({ type, attrs, ...(content.length ? { content } : {}) })

    if (tag === 'p') return paragraph(kids, false, props)
    if (/^h[1-6]$/.test(tag)) return withContent('heading', { level: Number(tag[1]), props }, inlines(kids))
    if (tag === 'hr') return { type: 'horizontalRule', attrs: { props } }
    if (tag === 'ul' || tag === 'ol') {
      if (!kids.every((k) => tagOf(k) === 'li')) return raw(node)
      return withContent(tag === 'ul' ? 'bulletList' : 'orderedList', { props }, kids.map((li) => {
        const t = li as Tuple
        return withContent('listItem', { props: propsOf(t) }, blocks(childrenOf(t)))
      }))
    }
    if (tag === 'blockquote') {
      if (typeof props.as === 'string') { const { as, ...rest } = props; return withContent('alert', { type: as, props: rest }, blocks(kids)) }
      return withContent('blockquote', { props }, blocks(kids))
    }
    if (tag === 'pre') {
      const code = kids[0]
      if (kids.length !== 1 || tagOf(code!) !== 'code' || !childrenOf(code as Tuple).every((c) => typeof c === 'string')) return raw(node)
      const [rest, own] = split(props, ['language', 'filename'])
      const text = childrenOf(code as Tuple).join('')
      return withContent('codeBlock', { language: own.language ?? null, filename: own.filename ?? null, props: rest, codeProps: propsOf(code as Tuple) }, text ? [{ type: 'text', text }] : [])
    }
    if (tag === 'mermaid') {
      const text = String(props.content ?? '')
      return withContent('mermaid', { props: split(props, ['content'])[0] }, text ? [{ type: 'text', text }] : [])
    }
    if (tag === 'math') {
      const text = String(kids[0] ?? props.content ?? '')
      return withContent('mathBlock', { props: split(props, ['content'])[0] }, text ? [{ type: 'text', text }] : [])
    }
    if (tag === 'table') {
      const sections = kids.filter((k): k is Tuple => isTuple(k))
      if (sections.length !== kids.length || sections.some((s) => s[0] !== 'thead' && s[0] !== 'tbody')) return raw(node)
      const thead = sections.find((s) => s[0] === 'thead')
      const tbody = sections.find((s) => s[0] === 'tbody')
      const rows = [...(thead ? childrenOf(thead) : []), ...(tbody ? childrenOf(tbody) : [])]
      if (sections.length > 2 || !rows.every((r) => tagOf(r) === 'tr')) return raw(node)
      return withContent('table', { props, theadProps: thead ? propsOf(thead) : {}, tbodyProps: tbody ? propsOf(tbody) : {} }, rows.map((row) => {
        const r = row as Tuple
        return withContent('tableRow', { props: propsOf(r) }, childrenOf(r).map((cell) => {
          const c = cell as Tuple
          return withContent(c[0] === 'th' ? 'tableHeader' : 'tableCell', { props: propsOf(c) }, blocks(childrenOf(c)))
        }))
      }))
    }
    if (tag === 'template') {
      const [rest, own] = split(props, ['name'])
      return withContent('slot', { name: String(own.name ?? 'default'), props: rest }, blocks(kids))
    }
    if (PLAIN_BLOCKS.has(tag)) return raw(node)
    return withContent('component', { tag, props }, blocks(kids))
  }

  // Top level: the same rule as in a container.
  return { type: 'doc', content: blocks(nodes as Json[]) }
}

// ---------------------------------------------------------------- ProseMirror -> tree

export function fromEditorDoc(doc: GinkoDocNode): Json[] {
  const propsAttr = (n: GinkoDocNode): Props => ({ ...((n.attrs?.props as Props | undefined) ?? {}) })

  const inlines = (content: GinkoDocNode[] = []): Json[] => {
    const root: Tuple = [null, {}]
    // The marks that are open, outermost first, each with the tree node it writes into.
    let open: Array<{ key: string; node: Tuple }> = []
    for (const child of content) {
      const marks = [...(child.marks ?? [])].sort((a, b) =>
        (a.attrs?.order ?? 100 + (MARK_RANK[a.type] ?? 9)) - (b.attrs?.order ?? 100 + (MARK_RANK[b.type] ?? 9)))
      const keys = marks.map((m) => `${m.type}${JSON.stringify([m.attrs?.href, m.attrs?.title, m.attrs?.props])}`)
      let common = 0
      while (common < open.length && common < keys.length && open[common]!.key === keys[common]) common++
      open = open.slice(0, common)
      for (let i = common; i < marks.length; i++) {
        const m = marks[i]!
        const props = m.type === 'link' ? join({ ...((m.attrs?.props as Props) ?? {}) }, { href: m.attrs?.href, title: m.attrs?.title }) : { ...((m.attrs?.props as Props) ?? {}) }
        const node: Tuple = [TAG_OF_MARK[m.type]!, props]
        ;(open.length ? open[open.length - 1]!.node : root).push(node as Json)
        open.push({ key: keys[i]!, node })
      }
      const target = open.length ? open[open.length - 1]!.node : root
      target.push(leaf(child))
    }
    return childrenOf(root)
  }

  const leaf = (n: GinkoDocNode): Json => {
    const a = n.attrs ?? {}
    switch (n.type) {
      case 'text': return n.text ?? ''
      case 'hardBreak': return ['br', propsAttr(n)]
      case 'image': return ['img', join(propsAttr(n), { src: a.src, alt: a.alt, title: a.title })]
      case 'taskCheckbox': return ['input', { ...propsAttr(n), ...(a.checked ? { ':checked': 'true' } : {}) }]
      case 'mathInline': return ['math', { ...propsAttr(n), ...('content' in propsAttr(n) ? { content: a.text } : {}) }, a.text ?? '']
      case 'inlineComponent': return [a.tag, propsAttr(n), ...inlines(n.content)]
      default: return ['span', {}, n.text ?? '']
    }
  }

  const text = (n: GinkoDocNode) => (n.content ?? []).map((c) => c.text ?? '').join('')

  /** Children of a container. A bare paragraph writes its children without `p`, unless that would run them into the bare paragraph before. */
  const blocks = (content: GinkoDocNode[] = [], bareOk: boolean): Json[] => {
    const out: Json[] = []
    let prevBare = false
    for (const n of content) {
      if (n.type === 'paragraph' && n.attrs?.bare && bareOk && !prevBare && n.content?.length) {
        out.push(...inlines(n.content))
        prevBare = true
        continue
      }
      prevBare = false
      out.push(block(n))
    }
    return out
  }

  const block = (n: GinkoDocNode): Json => {
    const a = n.attrs ?? {}
    const props = propsAttr(n)
    switch (n.type) {
      case 'paragraph': return ['p', props, ...inlines(n.content)]
      case 'heading': return [`h${a.level}`, props, ...inlines(n.content)]
      case 'horizontalRule': return ['hr', props]
      case 'bulletList': return ['ul', props, ...(n.content ?? []).map(block)]
      case 'orderedList': return ['ol', props, ...(n.content ?? []).map(block)]
      case 'listItem': return ['li', props, ...blocks(n.content, true)]
      case 'blockquote': return ['blockquote', props, ...blocks(n.content, true)]
      case 'alert': return ['blockquote', { ...props, as: a.type }, ...blocks(n.content, true)]
      case 'codeBlock': return ['pre', join(props, { language: a.language, filename: a.filename }), ['code', { ...((a.codeProps as Props) ?? {}) }, text(n)]]
      case 'mermaid': return ['mermaid', { ...props, content: text(n) }]
      case 'mathBlock': return ['math', { ...props, content: text(n) }, text(n)]
      case 'table': {
        const rows = n.content ?? []
        const head = rows.findIndex((r) => (r.content ?? []).some((c) => c.type !== 'tableHeader'))
        const headRows = rows.slice(0, head === -1 ? rows.length : head)
        const bodyRows = rows.slice(headRows.length)
        return ['table', props,
          ...(headRows.length ? [['thead', { ...(a.theadProps as Props) }, ...headRows.map(block)]] : []),
          ...(bodyRows.length ? [['tbody', { ...(a.tbodyProps as Props) }, ...bodyRows.map(block)]] : [])] as Json[]
      }
      case 'tableRow': return ['tr', props, ...(n.content ?? []).map(block)]
      case 'tableHeader': return ['th', props, ...blocks(n.content, true)]
      case 'tableCell': return ['td', props, ...blocks(n.content, true)]
      case 'component': return [a.tag, props, ...blocks(n.content, true)]
      case 'slot': return ['template', { ...props, name: a.name }, ...blocks(n.content, true)]
      case 'raw': return a.node as Json
      default: return ['p', {}, ...inlines([n])]
    }
  }

  return blocks(doc.content, false)
}

