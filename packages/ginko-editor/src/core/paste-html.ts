// Turns pasted HTML (Word, Google Docs, web pages) into the small set of tags the editor's schema takes, for the
// profile of the field. Everything else is dropped or unwrapped: styles, colours, fonts, classes, comments,
// empty spans, tracking images. It works on a DOM (the browser's, or happy-dom in tests) and returns a string,
// which ProseMirror's clipboard parser then reads like any other HTML.
import type { MarkdownProfile } from '@lupinum/ginko'
import { isSafeHref, profileCovers } from '@lupinum/ginko'

export interface CleanOptions { profile: MarkdownProfile }

/** Tags that are removed with everything inside. */
const DROP = new Set(['script', 'style', 'meta', 'link', 'title', 'head', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas', 'form', 'button', 'input', 'select', 'textarea', 'nav', 'aside', 'footer', 'audio', 'video', 'template', 'xml'])
/** Block-level tags that become a paragraph (or are unwrapped when they only hold blocks). */
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'figure', 'figcaption', 'address', 'details', 'summary', 'dl', 'dt', 'dd', 'center', 'body', 'html', 'fieldset'])

/** The heading levels a profile has: `h1` of the source becomes the first one. */
const levelOf = (n: number): 2 | 3 | 4 => (n <= 2 ? 2 : n === 3 ? 3 : 4)

interface Ctx { doc: Document; profile: MarkdownProfile; marks: boolean; headings: boolean; blocks: boolean; rich: boolean }

const styleOf = (el: Element) => (el.getAttribute('style') ?? '').toLowerCase().replace(/\s+/g, '')
const isBoldStyle = (style: string) => /(?:^|;)font-weight:(bold|bolder|[6-9]00)/.test(style)
const isItalicStyle = (style: string) => /(?:^|;)font-style:italic/.test(style)
const isStrikeStyle = (style: string) => /text-decoration(-line)?:[^;]*line-through/.test(style)
const isMonoStyle = (style: string) => /font-family:[^;]*(courier|consolas|monospace|menlo)/.test(style)

/** `&nbsp;` and other odd spaces become a normal space; runs of whitespace become one. */
const tidy = (text: string) => text.replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ')

const lowerTag = (node: Node) => (node.nodeType === 1 ? (node as Element).tagName.toLowerCase().replace(/^o:|^w:/, 'o:') : '')

/** Inline content of `node` as a list of output nodes (text, `strong`, `em`, `a`, `code`, `del`, `br`, `img`). */
function inlineChildren(node: Node, ctx: Ctx, out: Node[] = [], inHeading = false): Node[] {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const text = tidy(child.textContent ?? '')
      if (text) out.push(ctx.doc.createTextNode(text))
      continue
    }
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = lowerTag(el)
    if (DROP.has(tag) || tag.startsWith('o:p') && !el.textContent?.trim()) continue
    const style = styleOf(el)
    // Word's list marker ("·", "1.") sits in a span the list code reads; it is not text.
    if (/mso-list:ignore/.test(style)) continue
    if (tag === 'br') { out.push(ctx.doc.createElement('br')); continue }
    if (tag === 'img') {
      const img = cleanImage(el, ctx)
      if (img) out.push(img)
      continue
    }
    const inner = inlineChildren(el, ctx, [], inHeading)
    if (!inner.length) continue
    let wrapped: Node[] = inner
    const wrap = (name: string, attrs: Record<string, string> = {}) => {
      const outer = ctx.doc.createElement(name)
      for (const [key, value] of Object.entries(attrs)) outer.setAttribute(key, value)
      for (const item of wrapped) outer.appendChild(item)
      wrapped = [outer]
    }
    // Google Docs wraps the whole text in <b style="font-weight:normal" id="docs-internal-guid-…">: not bold.
    const guid = (el.getAttribute('id') ?? '').startsWith('docs-internal-guid')
    const bold = !inHeading && !guid && ctx.marks && (tag === 'strong' || (tag === 'b' && !/(?:^|;)font-weight:(normal|400)/.test(style)) || isBoldStyle(style))
    const italic = !inHeading && ctx.marks && (tag === 'em' || tag === 'i' || isItalicStyle(style))
    const strike = ctx.rich && (tag === 'del' || tag === 's' || tag === 'strike' || isStrikeStyle(style))
    const code = ctx.rich && (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt' || isMonoStyle(style))
    if (code) wrap('code')
    if (strike) wrap('del')
    if (italic) wrap('em')
    if (bold) wrap('strong')
    if (tag === 'a') {
      const href = hrefOf(el.getAttribute('href'))
      if (href) wrap('a', { href })
    }
    out.push(...wrapped)
  }
  return out
}

/** Google's redirect (`google.com/url?q=…`) is replaced by its target; unsafe or empty addresses lose the link. */
function hrefOf(raw: string | null): string | undefined {
  let href = (raw ?? '').trim()
  if (!href || href.startsWith('#')) return undefined
  try {
    const url = new URL(href, 'https://x.invalid')
    if (/^(www\.)?google\.[a-z.]+$/.test(url.hostname) && url.pathname === '/url' && url.searchParams.get('q')) href = url.searchParams.get('q')!
  } catch { /* a relative or odd address stays as written */ }
  return isSafeHref(href) ? href : undefined
}

function cleanImage(el: Element, ctx: Ctx): Node | undefined {
  if (!ctx.rich) return undefined
  const src = (el.getAttribute('src') ?? '').trim()
  if (!/^https:\/\//i.test(src)) return undefined
  const size = (name: string) => Number.parseInt(el.getAttribute(name) ?? '', 10)
  // Tracking pixels: 1x1 or hidden, or called so.
  if (size('width') <= 2 || size('height') <= 2 || /display:none/.test(styleOf(el)) || /(pixel|beacon|track|spacer)/i.test(src)) return undefined
  const img = ctx.doc.createElement('img')
  img.setAttribute('src', src)
  img.setAttribute('alt', (el.getAttribute('alt') ?? '').trim())
  return img
}

const isBlank = (nodes: readonly Node[]) => nodes.every((n) => n.nodeType === 3 ? !n.textContent!.trim() : lowerTag(n) === 'br')

function paragraph(ctx: Ctx, content: Node[]): HTMLElement | undefined {
  trim(content)
  if (isBlank(content)) return undefined
  const p = ctx.doc.createElement('p')
  for (const node of content) p.appendChild(node)
  return p
}

/** Spaces at the start and end of a line of text go, and so do line breaks at the edges. */
function trim(nodes: Node[]) {
  while (nodes.length && (lowerTag(nodes[0]!) === 'br' || (nodes[0]!.nodeType === 3 && !nodes[0]!.textContent!.trim()))) nodes.shift()
  while (nodes.length && (lowerTag(nodes.at(-1)!) === 'br' || (nodes.at(-1)!.nodeType === 3 && !nodes.at(-1)!.textContent!.trim()))) nodes.pop()
  const first = nodes[0]
  if (first?.nodeType === 3) first.textContent = first.textContent!.replace(/^\s+/, '')
  const last = nodes.at(-1)
  if (last?.nodeType === 3) last.textContent = last.textContent!.replace(/\s+$/, '')
}

interface ListItem { level: number; ordered: boolean; content: Node[] }

/** Word writes a list as flat paragraphs with `mso-list:l0 level2 lfo1` and a marker span; this reads one. */
function wordListItem(el: Element, ctx: Ctx): ListItem | undefined {
  if (lowerTag(el) !== 'p' && !/^h[1-6]$/.test(lowerTag(el))) return undefined
  const match = /mso-list:[^;]*?level(\d+)/i.exec(el.getAttribute('style') ?? '')
  if (!match || /mso-list:\s*none/i.test(el.getAttribute('style') ?? '')) return undefined
  const marker = Array.from(el.querySelectorAll('span')).find((s) => /mso-list:\s*ignore/i.test(s.getAttribute('style') ?? ''))
  const label = tidy(marker?.textContent ?? '').trim()
  return { level: Number(match[1]), ordered: /^(\d+|[a-z]|[ivxlc]+)[.)]$/i.test(label), content: inlineChildren(el, ctx) }
}

function buildList(items: ListItem[], ctx: Ctx): HTMLElement | undefined {
  const root = ctx.doc.createElement('div')
  // A stack of open lists, one per level; an item goes into the list of its level.
  const stack: Array<{ level: number; list: HTMLElement; last?: HTMLElement }> = []
  for (const item of items) {
    trim(item.content)
    if (isBlank(item.content)) continue
    while (stack.length && stack.at(-1)!.level > item.level) stack.pop()
    let top = stack.at(-1)
    if (!top || top.level < item.level) {
      const list = ctx.doc.createElement(item.ordered ? 'ol' : 'ul')
      if (top?.last) top.last.appendChild(list)
      else root.appendChild(list)
      top = { level: item.level, list }
      stack.push(top)
    }
    const li = ctx.doc.createElement('li')
    for (const node of item.content) li.appendChild(node)
    top.list.appendChild(li)
    top.last = li
  }
  return root.firstElementChild as HTMLElement | undefined
}

function convertList(el: Element, ctx: Ctx, out: Node[]) {
  const ordered = lowerTag(el) === 'ol'
  if (!ctx.blocks) {
    // A profile without lists: one line per item.
    for (const li of Array.from(el.children)) if (lowerTag(li) === 'li') { const p = paragraph(ctx, inlineChildren(li, ctx)); if (p) out.push(p) }
    return
  }
  const list = ctx.doc.createElement(ordered ? 'ol' : 'ul')
  const start = Number.parseInt(el.getAttribute('start') ?? '', 10)
  if (ordered && start > 1) list.setAttribute('start', String(start))
  for (const li of Array.from(el.children)) {
    if (lowerTag(li) !== 'li') continue
    const item = ctx.doc.createElement('li')
    // The text of an item is inline, with nested lists after it: no <p> inside, so the list stays tight.
    const inline: Node[] = []
    const nested: Node[] = []
    const flush = () => { trim(inline); if (!isBlank(inline)) for (const n of inline) item.appendChild(n); inline.length = 0 }
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        const tag = lowerTag(child)
        if (tag === 'ul' || tag === 'ol') { flush(); convertList(child as Element, ctx, nested) }
        else if (tag === 'p' || tag === 'div') { if (inline.length) inline.push(ctx.doc.createElement('br')); walk(child) }
        else inline.push(...inlineChildren({ childNodes: [child] } as unknown as Node, ctx))
      }
    }
    walk(li)
    flush()
    for (const n of nested) item.appendChild(n)
    if (item.childNodes.length) list.appendChild(item)
  }
  if (list.childNodes.length) out.push(list)
}

function convertTable(el: Element, ctx: Ctx, out: Node[]) {
  const rows = Array.from(el.querySelectorAll('tr')).filter((tr) => tr.closest('table') === el)
  if (!ctx.rich) {
    // No tables here: a paragraph per row, the cells between " · ".
    for (const tr of rows) {
      const cells = Array.from(tr.children).filter((c) => /^(td|th)$/.test(lowerTag(c))).map((c) => tidy(c.textContent ?? '').trim()).filter(Boolean)
      if (!cells.length) continue
      const p = ctx.doc.createElement('p')
      p.textContent = cells.join(' · ')
      out.push(p)
    }
    return
  }
  const table = ctx.doc.createElement('table')
  const body = ctx.doc.createElement('tbody')
  table.appendChild(body)
  let width = 0
  rows.forEach((tr, rowIndex) => {
    const row = ctx.doc.createElement('tr')
    for (const cell of Array.from(tr.children)) {
      if (!/^(td|th)$/.test(lowerTag(cell))) continue
      const made = ctx.doc.createElement(rowIndex === 0 ? 'th' : 'td')
      const inline = inlineChildren(cell, ctx)
      trim(inline)
      // A cell holds one paragraph; the text of a cell with several paragraphs is joined by line breaks.
      const p = ctx.doc.createElement('p')
      for (const n of inline) p.appendChild(n)
      made.appendChild(p)
      row.appendChild(made)
    }
    if (row.childNodes.length) { width = Math.max(width, row.childNodes.length); body.appendChild(row) }
  })
  // A table whose rows have different widths is padded, so every row has the same number of cells.
  for (const row of Array.from(body.children)) {
    while (row.children.length < width) { const td = ctx.doc.createElement(row === body.firstElementChild ? 'th' : 'td'); td.appendChild(ctx.doc.createElement('p')); row.appendChild(td) }
  }
  if (body.childNodes.length) out.push(table)
}

const hasBlocks = (el: Element) => el.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre,hr') !== null

/** Block content of `node` as output blocks. */
function blockChildren(node: Node, ctx: Ctx, out: Node[] = []): Node[] {
  let run: Node[] = []
  const flush = () => { const p = paragraph(ctx, run); if (p) out.push(p); run = [] }
  const children = Array.from(node.childNodes)
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (child.nodeType === 3 || child.nodeType !== 1) {
      if (child.nodeType === 3) run.push(...inlineChildren({ childNodes: [child] } as unknown as Node, ctx))
      continue
    }
    const el = child as Element
    const tag = lowerTag(el)
    if (DROP.has(tag)) continue

    // Word's fake lists: take all following list paragraphs.
    const first = wordListItem(el, ctx)
    if (first) {
      flush()
      const items = [first]
      while (i + 1 < children.length) {
        const next = children[i + 1]!
        if (next.nodeType === 3 && !next.textContent!.trim()) { i++; continue }
        const item = next.nodeType === 1 ? wordListItem(next as Element, ctx) : undefined
        if (!item) break
        items.push(item)
        i++
      }
      if (ctx.blocks) { const list = buildList(items, ctx); if (list) out.push(list) }
      else for (const item of items) { const p = paragraph(ctx, item.content); if (p) out.push(p) }
      continue
    }

    if (/^h[1-6]$/.test(tag) || /^mso(title|subtitle)$/i.test(el.className) || /^MsoHeading\d$/.test(el.className)) {
      flush()
      const fromClass = /MsoHeading(\d)/.exec(el.className)?.[1]
      const n = /^h([1-6])$/.test(tag) ? Number(tag[1]) : fromClass ? Number(fromClass) : 1
      const content = inlineChildren(el, ctx, [], true)
      trim(content)
      if (isBlank(content)) continue
      if (!ctx.headings) {
        // Not allowed here: the title stays as bold text.
        const strong = ctx.doc.createElement('strong')
        for (const c of content) strong.appendChild(c)
        const p = paragraph(ctx, ctx.marks ? [strong] : content)
        if (p) out.push(p)
        continue
      }
      const h = ctx.doc.createElement(`h${levelOf(n)}`)
      for (const c of content) h.appendChild(c)
      out.push(h)
      continue
    }
    if (tag === 'ul' || tag === 'ol') { flush(); convertList(el, ctx, out); continue }
    if (tag === 'table') { flush(); convertTable(el, ctx, out); continue }
    if (tag === 'blockquote') {
      flush()
      const inner = blockChildren(el, ctx)
      if (!inner.length) continue
      if (!ctx.blocks) { out.push(...inner); continue }
      const q = ctx.doc.createElement('blockquote')
      for (const n of inner) q.appendChild(n)
      out.push(q)
      continue
    }
    if (tag === 'pre') {
      flush()
      const text = (el.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n+$/, '')
      if (!text.trim()) continue
      if (ctx.rich) {
        const pre = ctx.doc.createElement('pre')
        const code = ctx.doc.createElement('code')
        code.textContent = text
        pre.appendChild(code)
        out.push(pre)
      } else {
        // One paragraph, the lines joined by line breaks.
        const lines = text.split('\n')
        const content: Node[] = []
        lines.forEach((line, index) => { if (index) content.push(ctx.doc.createElement('br')); content.push(ctx.doc.createTextNode(line)) })
        const p = ctx.doc.createElement('p')
        for (const c of content) p.appendChild(c)
        out.push(p)
      }
      continue
    }
    if (tag === 'hr') { flush(); if (ctx.blocks) out.push(ctx.doc.createElement('hr')); continue }
    if (tag === 'li') { flush(); const p = paragraph(ctx, inlineChildren(el, ctx)); if (p) out.push(p); continue }
    if (tag === 'img' && !ctx.rich) continue
    if (BLOCK.has(tag) || /^(tbody|thead|tfoot|tr|td|th|caption|colgroup)$/.test(tag)) {
      flush()
      // A box with block content inside is unwrapped; one with only inline content is a paragraph.
      if (hasBlocks(el)) blockChildren(el, ctx, out)
      else { const p = paragraph(ctx, inlineChildren(el, ctx)); if (p) out.push(p) }
      continue
    }
    // An inline element that holds blocks (Google Docs wraps the whole text in a <b>) is a box: unwrap it.
    if (hasBlocks(el)) { flush(); blockChildren(el, ctx, out); continue }
    // Inline elements (b, span, a, em, img, br …) belong to the running paragraph.
    run.push(...inlineChildren({ childNodes: [child] } as unknown as Node, ctx))
  }
  flush()
  return out
}

/** For the inline profile: all blocks become one run of text, separated by line breaks. */
function toRun(blocks: Node[], ctx: Ctx): HTMLElement {
  const p = ctx.doc.createElement('p')
  const push = (nodes: Node[]) => {
    if (p.childNodes.length && nodes.length) p.appendChild(ctx.doc.createElement('br'))
    for (const n of nodes) p.appendChild(n)
  }
  for (const block of blocks) {
    const tag = lowerTag(block)
    if (tag === 'ul' || tag === 'ol') for (const li of Array.from(block.childNodes)) push(Array.from(li.childNodes))
    else push(Array.from(block.childNodes))
  }
  return p
}

/** `html` cleaned for `profile`. Returns an empty string when nothing is left (the paste then does nothing). */
export function cleanPastedHtml(html: string, options: CleanOptions): string {
  const { profile } = options
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const doc = parsed
  const ctx: Ctx = {
    doc, profile,
    marks: true,
    headings: profileCovers(profile, 'basic'),
    blocks: profileCovers(profile, 'basic'),
    rich: profileCovers(profile, 'rich'),
  }
  const root = parsed.body ?? parsed.documentElement
  let blocks = blockChildren(root, ctx)
  if (profile === 'inline') blocks = [toRun(blocks, ctx)].filter((p) => p.childNodes.length)
  const holder = doc.createElement('div')
  for (const b of blocks) holder.appendChild(b)
  return holder.innerHTML
}
