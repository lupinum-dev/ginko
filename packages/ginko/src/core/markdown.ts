// The one text format (V1.md rule 1): a Markdown string in comark syntax, stored as is in Git files,
// in the platform, in the editor and in agent tools. The bundle carries the parsed tree, so sites
// render it without a parser. Pure: runs in Node, in the browser and in Convex.
import type { ComarkPlugin, Node } from 'comark'
import { defineComarkPlugin, parseMarkdown as parseComark } from 'comark'
import alert from 'comark/plugins/alert'
import attributes from 'comark/plugins/attributes'
import components from 'comark/plugins/components'
import emoji from 'comark/plugins/emoji'
import footnotes from 'comark/plugins/footnotes'
import frontmatter from 'comark/plugins/frontmatter'
import math from 'comark/plugins/math'
import mermaid from 'comark/plugins/mermaid'
import taskList from 'comark/plugins/task-list'
import toc from 'comark/plugins/toc'
import { bare, coreMessage, msg, type Described } from './messages.ts'
import { checkComponentTree, componentSlotNodes, isBlockedTag, type ComponentRegistry } from './components.ts'
import { isSafeHref } from './href.ts'
import { withoutCode } from './file-refs.ts'
import type { Json } from './types.ts'

/**
 * In page state the tree is replaced by `ref`, the site path that serves it (withMarkdownRefs), so a page's
 * payload carries only the texts it shows (CONTENT.md, Phase 14). The toc comes with the loaded tree; page
 * state no longer carries it, `toc` stays optional here so the type does not change. `words` is the tree's word
 * count (`wordsOf`), so a list page can show a reading time without loading every text.
 */
export type MarkdownValue = MarkdownTree | { ref: string; toc?: MarkdownToc; words?: number }

/**
 * The parsed tree: comark nodes (`[tag, props, ...children]` or a string). `summary` holds the nodes
 * before a `<!-- more -->` line (the excerpt) and exists only when the text has that line; `nodes`
 * keeps the whole text without the marker.
 */
export interface MarkdownTree { nodes: Json[]; toc?: MarkdownToc; summary?: Json[] }

/** The h2/h3 headings of a text, for a table of contents. `id` is the heading's anchor. */
export type MarkdownToc = { links: TocLink[] }
export type TocLink = { id: string; depth: number; text: string; children?: TocLink[] }

/**
 * What a `markdown` field allows, from small to large. Each profile allows everything of the ones before it.
 * - `inline`: one paragraph with bold, italic, strikethrough, code, links and line breaks.
 * - `basic`: paragraphs, headings h2–h4, lists (also task lists, `- [ ] item`), quotes, alerts, dividers, footnotes. Emoji shortcodes (`:tada:`) work in every profile.
 * - `rich`: tables, images, code blocks, math (`$x^2$`, `$$…$$`), mermaid diagrams (a `mermaid` code fence).
 * - `page`: h1, h5, h6 and components (`::callout`, `:badge[…]`).
 * Raw HTML is never parsed: `<b>` stays text. Links and images must pass `isSafeHref`. Attributes: see `attributeProblem`.
 */
export const MARKDOWN_PROFILES = ['inline', 'basic', 'rich', 'page'] as const
export type MarkdownProfile = (typeof MARKDOWN_PROFILES)[number]

const INLINE_TAGS = ['strong', 'em', 'del', 'code', 'a', 'br']
// Emoji become plain characters, so `inline` needs nothing extra. Footnotes add `sup` and `section`;
// `math` and `mermaid` are the nodes of comark's plugins (the renderer shows their source, see markdown-view.ts).
const BASIC_TAGS = [...INLINE_TAGS, 'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'input', 'blockquote', 'hr', 'sup', 'section']
const TAGS: Record<Exclude<MarkdownProfile, 'page'>, ReadonlySet<string>> = {
  inline: new Set([...INLINE_TAGS, 'p']),
  basic: new Set(BASIC_TAGS),
  rich: new Set([...BASIC_TAGS, 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'pre', 'math', 'mermaid']),
}
// Component syntax can name any tag (`::script`). Without a component registry `page` accepts any tag that is
// not blocked (isBlockedTag, components.ts); with one, only the registered components (ParseOptions.components).

type ValueCheck = (value: unknown) => boolean
const anyValue: ValueCheck = () => true
const oneOf = (values: readonly string[]): ValueCheck => (value) => typeof value === 'string' && values.includes(value)
const matching = (pattern: RegExp): ValueCheck => (value) => typeof value === 'string' && pattern.test(value)

/** Heading ids: comark's, ours (headingAnchors) or `{#id}`. Not `__…`, the prefix of Nuxt's own ids (`__nuxt`, `__NUXT_DATA__`). */
const heading = { id: (value: unknown) => typeof value === 'string' && !value.startsWith('__') }
/** The ids of the footnotes plugin: `fnref-1` on the reference, `fn-1` on the note. */
const footnoteId = matching(/^fn(ref)?-[\w-]+$/)
/** A link's `rel` without `opener`, which would let the opened page navigate the site's tab. */
const rel: ValueCheck = (value) => typeof value === 'string' && value.trim().split(/\s+/).every((token) => /^[a-z-]*$/.test(token) && token !== 'opener')
const textAlign = matching(/^text-align:(left|right|center)$/)
/**
 * A `class` of these tokens only: the classes Markdown's plugins write. A text never picks a class of its own, so it
 * cannot take a rule of the site's CSS (`.ginko-quiz-input`, a Tailwind `fixed inset-0`), which would turn a link
 * into an invisible box over the page.
 */
const classes = (...tokens: string[]): ValueCheck => (value) => typeof value === 'string' && value.trim() !== '' && value.trim().split(/\s+/).every((token) => tokens.includes(token))
/** What Shiki writes on a highlighted line or token: colours, font style and the line's display, nothing that moves a box. */
const SHIKI_DECLARATION = /^(?:(?:color|--shiki-(?:light|dark)(?:-bg)?)\s*:\s*#[0-9a-f]{3,8}|(?:--shiki-(?:light|dark)-)?(?:font-style|font-weight|text-decoration)\s*:\s*[\w-]+|display\s*:\s*inline(?:-block)?)$/i
const shikiStyle: ValueCheck = (value) => typeof value === 'string' && value.split(';').every((d) => d.trim() === '' || SHIKI_DECLARATION.test(d.trim()))

/**
 * Per tag, the attributes Markdown and its plugins write, with the values they write; every element also takes the
 * global ones (isGlobalAttribute). `class` holds the plugins' own classes: task lists, footnotes, math, the code
 * fence's `language-…` and Shiki's. `span`, `example` and the `class` of `pre` come from plugins that run after the
 * profile check on files (Shiki with the themes of @lupinum/ginko-content, its ```md preview fence), and the renderer
 * sees them; `srcset` and `sizes` are the WebP copies of a file's image (@lupinum/ginko-content).
 */
const TAG_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, ValueCheck>>>> = {
  a: { href: anyValue, target: oneOf(['_blank']), rel, id: footnoteId, class: classes('footnote-backref') },
  img: { src: anyValue, alt: anyValue, width: anyValue, height: anyValue, srcset: anyValue, sizes: anyValue },
  input: { type: oneOf(['checkbox']), checked: anyValue, disabled: anyValue, class: classes('task-list-item-checkbox') },
  ul: { class: classes('contains-task-list') },
  ol: { start: anyValue, class: classes('contains-task-list', 'footnotes-list') },
  li: { id: footnoteId, class: classes('task-list-item') },
  sup: { class: classes('footnote-ref') },
  section: { class: classes('footnotes') },
  th: { style: textAlign },
  td: { style: textAlign },
  pre: { language: anyValue, filename: anyValue, highlights: anyValue, meta: anyValue, class: classes('shiki', 'shiki-themes', 'github-light', 'catppuccin-mocha', 'dark:catppuccin-mocha') },
  code: { class: matching(/^language-\S+$/) },
  // comark's renderer mounts the component an `as` names in place of the element: only the alert plugin's types (`> [!TIP]`).
  blockquote: { as: oneOf(['note', 'tip', 'important', 'warning', 'caution']) },
  math: { content: anyValue, class: oneOf(['math inline', 'math block']) },
  mermaid: { content: anyValue },
  h1: heading, h2: heading, h3: heading, h4: heading, h5: heading, h6: heading,
  // A component's slot (`#title`): comark's `template` node with the slot's name.
  template: { name: anyValue },
  span: { style: shikiStyle, class: classes('line', 'highlight') },
  example: { preview: anyValue },
}

/**
 * `title`, `lang`, `dir` and `aria-*`: what every element may carry (`**new**{lang="en"}`). Not `class` (see `classes`)
 * and not `data-*`: both are hooks of the site's CSS, `data-v-…` even of Vue's scoped styles.
 */
function isGlobalAttribute(key: string): boolean {
  return key === 'title' || key === 'lang' || key === 'dir' || /^aria-[a-z0-9-]+$/.test(key)
}

/** Attributes that hold an address; their value must pass `isSafeHref` (`srcset`: each address in it). */
export const URL_PROPS: ReadonlySet<string> = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href'])

function safeAddress(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (key !== 'srcset') return isSafeHref(value)
  return value.split(',').every((candidate) => {
    const [url, descriptor, ...rest] = candidate.trim().split(/\s+/)
    return url !== undefined && isSafeHref(url) && (descriptor === undefined || /^\d+(\.\d+)?[wx]$/.test(descriptor)) && rest.length === 0
  })
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

/** What `attributeProblem` reads of the component registry: the declared props and their types. A full `ComponentRegistry` fits. */
export type AttributeRegistry = Record<string, { props: Record<string, { type: string }> }>

/**
 * Whether a text may give `tag` the attribute `name` (`:name` is comark's bound form) with `value`: the one allowlist
 * of the parser (profileCheck) and the renderer (`GinkoMarkdown`). `blocked` for an attribute that is not allowed,
 * `unsafe` for an address that fails `isSafeHref`. Every element takes the global attributes (isGlobalAttribute); on top,
 * a component the registry declares takes exactly its declared props, and any other tag what Markdown and its plugins
 * write there (TAG_ATTRIBUTES). So `on*` handlers, DOM sinks (`outerHTML`), `style`, `id`, a `class` or `data-*` of the
 * text's own, Vue's `.`/`^` prefixes and comark's `as` outside an alert are refused, and a component without a registry
 * gets the global attributes only.
 * A bound value must be JSON: comark parses it and looks any other value up in its render data. A bound address is
 * never allowed, and a bound value never passes a value rule (only `:checked="true"` and declared props take one).
 * A declared prop of type `image` is an address like `src`.
 */
export function attributeProblem(tag: string, name: string, value: unknown, registry?: AttributeRegistry): 'blocked' | 'unsafe' | undefined {
  const bound = name.startsWith(':')
  const key = bound ? name.slice(1) : name
  const declared = registry !== undefined && Object.hasOwn(registry, tag) ? registry[tag]!.props : undefined
  // A declared prop of type image holds an address whatever its name (a card's `image`).
  const address = URL_PROPS.has(key) || (declared !== undefined && Object.hasOwn(declared, key) && declared[key]!.type === 'image')
  if (bound && (address || (typeof value === 'string' && !isJson(value)))) return 'blocked'
  const rules = declared ? undefined : Object.hasOwn(TAG_ATTRIBUTES, tag) ? TAG_ATTRIBUTES[tag]! : undefined
  const check = declared ? (Object.hasOwn(declared, key) ? anyValue : undefined) : rules && Object.hasOwn(rules, key) ? rules[key] : undefined
  if (!check) return isGlobalAttribute(key) ? undefined : 'blocked'
  if (address) return safeAddress(key, value) ? undefined : 'unsafe'
  return (bound ? check === anyValue : check(value)) ? undefined : 'blocked'
}

// Pure: a bundle that never reads it (the browser's Markdown renderer) leaves out the message catalogs.
export const UNSAFE_LINK = /* @__PURE__ */ unsafeLinkText()
function unsafeLinkText(): string {
  return msg('markdown.unsafeLink').message
}
const MAX_NODES = 20000

/** A short description of what the profile allows, for agent tools and editor hints. */
export function describeProfile(profile: MarkdownProfile, locale = 'de'): string {
  return coreMessage(locale, `markdown.profile.${profile}`)
}

/** True when `wide` allows everything `narrow` allows. */
export function profileCovers(wide: MarkdownProfile, narrow: MarkdownProfile): boolean {
  return MARKDOWN_PROFILES.indexOf(wide) >= MARKDOWN_PROFILES.indexOf(narrow)
}

export interface ParseOptions {
  /** Default `page`. */
  profile?: MarkdownProfile
  /** Read YAML frontmatter (Git files). Field values have none, so `---` there is a divider. */
  frontmatter?: boolean
  /** Extra comark plugins, e.g. Shiki highlighting. They run after the profile check. */
  plugins?: ComarkPlugin[]
  /** The site's component registry. With the `page` profile, only these components are allowed, with checked props, parents and children. Without it `page` accepts any tag except the blocked ones, with the global attributes only. */
  components?: ComponentRegistry
}

export interface ParsedMarkdown {
  /** The YAML frontmatter; `{}` without `frontmatter: true` or when the file has none. */
  frontmatter: Record<string, unknown>
  value: MarkdownTree
  /** The Markdown text without the frontmatter: what a file stores in its markdown field. */
  body: string
  /** What the profile does not allow, as sentences. Empty when the text is fine. */
  problems: string[]
  /** The same problems with catalog key and parameters (`coreMessage(locale, key, params)`), in the same order. */
  problemMessages: MarkdownProblem[]
  /**
   * True when the text has parts the tree does not show: link reference definitions (`[g]: https://…`, resolved into
   * their links and images) and HTML comments (`<!-- … -->`). A text written from the tree would lose them.
   */
  hidden?: true
}

/** A problem of a text; `line` (1-based, in the parsed text, frontmatter included) when it belongs to one line. */
export type MarkdownProblem = Described & { line?: number }

/** Parses Markdown with comark, checks it against the profile, adds heading anchors and the toc (h2, h3). */
export async function parseMarkdown(text: string, options: ParseOptions = {}): Promise<ParsedMarkdown> {
  const problems: MarkdownProblem[] = []
  let body = text
  let summary: Node[] | undefined
  let hidden = false
  const plugins = [
    ...(options.frontmatter ? [frontmatter(), defineComarkPlugin(() => ({ name: 'ginko-body', pre(state) { body = state.markdown.replace(/^\r?\n/, '') } }))()] : []),
    alert(), taskList(), components(), attributes(), referenceDefinitions(() => { hidden = true }),
    // Every profile parses these; profileCheck refuses the tags a profile does not allow, so `$a$` in a
    // `basic` field is reported, not silently kept. Footnotes must run before the check (`[^1]` is a `span` until then).
    emoji(), footnotes(), math(), mermaid(),
    htmlComments(() => { hidden = true }),
    moreMarker((nodes) => { summary = nodes }),
    closedComponents(text, problems),
    profileCheck(options.profile ?? 'page', problems, options.components),
    ...(options.plugins ?? []),
    headingAnchors(),
    // depth 2 = h2 and h3 (comark's depth counts the tags from h2 on); searchDepth 3 also finds headings inside components.
    toc({ depth: 2, searchDepth: 3 }),
  ]
  // autoClose is for streaming: it appends `*` or `::` to text that looks unfinished, which would change stored text.
  const tree = await parseComark(text, { registerDefaultPlugins: false, autoClose: false, plugins })
  // JSON round-trip: the value goes into a JSON bundle, so drop anything that is not plain data.
  const value: MarkdownTree = JSON.parse(JSON.stringify({ nodes: tree.nodes, toc: (tree.meta as { toc?: MarkdownToc }).toc, summary }))
  return { frontmatter: tree.frontmatter as Record<string, unknown>, value, body, problems: problems.map((p) => p.message), problemMessages: problems, ...(hidden ? { hidden: true } : {}) }
}

/** One top-level block of a text: its text, and for an h2 or h3 also its level and anchor. Code blocks (`pre`) are not blocks. */
export interface TextBlock { text: string; heading?: { level: 2 | 3; id?: string } }

/** The one walker over a text: top-level blocks in document order, without code blocks. Search and excerpts both read it. */
export function textBlocks(tree: MarkdownTree | readonly Json[]): TextBlock[] {
  const nodes = (Array.isArray(tree) ? tree : (tree as MarkdownTree).nodes) as Node[]
  const blocks: TextBlock[] = []
  for (const node of nodes) {
    if (typeof node !== 'string' && node[0] === 'pre') continue
    const text = textOf(node, true)
    const tag = typeof node === 'string' ? undefined : node[0]
    if (tag === 'h2' || tag === 'h3') {
      const id = (node as [string, Record<string, unknown>])[1]?.id
      blocks.push({ text, heading: { level: tag === 'h2' ? 2 : 3, ...(typeof id === 'string' && id ? { id } : {}) } })
    } else blocks.push({ text })
  }
  return blocks
}

/** All text of a tree (or of a node list), for excerpts and search. Blocks are separated by a line break; code blocks are left out. */
export function plainText(tree: MarkdownTree | readonly Json[]): string {
  return textBlocks(tree).map((b) => b.text).join('\n').trim()
}

/**
 * The number of words of a text, e.g. for a reading time: of the tree's `plainText`, or the count a `{ ref }` carries
 * in page state. `undefined` for a ref without a count or no value.
 */
export function wordsOf(value: MarkdownValue | null | undefined): number | undefined {
  if (!value) return undefined
  if (!('nodes' in value)) return value.words
  const text = plainText(value)
  return text ? text.split(/\s+/u).length : 0
}

const MORE_MARKER = '<!-- more -->'

/**
 * The text before a `<!-- more -->` line is the summary (excerpt). Raw HTML is never parsed, so comark's
 * own `summary` plugin (which looks for an HTML block) never finds it; the marker is a paragraph of plain text here.
 * The marker is removed from the tree. Runs after footnotes, so references in the summary are already converted.
 */
function moreMarker(set: (nodes: Node[]) => void) {
  return defineComarkPlugin(() => ({
    name: 'ginko-more',
    post(state) {
      const at = state.tree.nodes.findIndex((n) => typeof n !== 'string' && n[0] === 'p' && n.length === 3 && n[2] === MORE_MARKER)
      if (at === -1) return
      set(state.tree.nodes.slice(0, at))
      state.tree.nodes.splice(at, 1)
    },
  }))()
}

/**
 * A link reference definition (`[g]: https://…`) gives the address of `[Text][g]` and `![Logo][g]`; comark resolves those
 * into the link or image itself, so the address passes the same checks as an inline one. The definition has no node of
 * its own (comark would make it a nameless `component`), so its token is dropped; `onDrop` notes that the tree does not
 * show the whole text.
 */
function referenceDefinitions(onDrop: () => void) {
  return defineComarkPlugin(() => ({
    name: 'ginko-references',
    markdownItPlugins: [(md) => {
      // comark types `md` with markdown-it's types, which are not installed here: the state is typed by what this reads.
      md.core.ruler.push('ginko-references', (state: { tokens: Array<{ type: string }> }) => {
        const kept = state.tokens.filter((token) => token.type !== 'reference')
        if (kept.length === state.tokens.length) return
        state.tokens = kept
        onDrop()
      })
    }],
  }))()
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g

/**
 * Raw HTML is never parsed, so an HTML comment (`<!-- TODO -->`) would be shown as text. It is a note for the people
 * who edit the text: the stored text keeps it, the parsed text loses it before tokenizing, so a comment around
 * formatting or around whole paragraphs goes too. Code keeps it (the same scan as for file references). Its line
 * breaks stay, so problem lines still count in the stored text. A `<!-- more -->` line stays for moreMarker.
 * `onDrop` notes that the tree does not show the whole text.
 */
function htmlComments(onDrop: () => void) {
  return defineComarkPlugin(() => ({
    name: 'ginko-comments',
    pre(state) {
      const text = state.markdown
      if (!text.includes('<!--')) return
      let out = ''
      let last = 0
      for (const match of withoutCode(text).matchAll(HTML_COMMENT)) {
        const lineStart = text.lastIndexOf('\n', match.index) + 1
        const lineEnd = text.indexOf('\n', match.index)
        if (text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim() === MORE_MARKER) continue
        // Spaces before it go with it, so `a <!-- x --> b` reads `a b`.
        let start = match.index
        while (start > last && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--
        out += text.slice(last, start) + match[0].replace(/[^\n]/g, '')
        last = match.index + match[0].length
      }
      if (last === 0) return
      state.markdown = out + text.slice(last)
      onDrop()
    },
  }))()
}

type BlockOpen = { type: 'mdc_block_open'; map: [number, number]; markup: string; info: string }
const isBlockOpen = (token: unknown): token is BlockOpen =>
  typeof token === 'object' && token !== null && 'type' in token && token.type === 'mdc_block_open' && 'map' in token && Array.isArray(token.map)

/**
 * comark ends an unclosed `::name` block at the end of its parent (the text, or the enclosing `:::gallery`), so the
 * text after it becomes the component's content and the site drops it. comark keeps no flag for this, but the open
 * token's `map[1]` is the line it stopped at: the closing marker, or the parent's end. `>` covers a block in a quote.
 * Depends on comark 0.7's token shape (`mdc_block_open`, `map`, `markup`); validate.test.ts fails if that changes.
 */
function closedComponents(text: string, problems: MarkdownProblem[]) {
  return defineComarkPlugin(() => ({
    name: 'ginko-closed',
    post(state) {
      const lines = state.markdown.split('\n')
      // Token lines count in state.markdown, which is the text after a frontmatter block.
      const frontmatterLines = text.split('\n').length - lines.length
      for (const token of state.tokens) {
        if (!isBlockOpen(token) || lines[token.map[1]]?.replace(/^[\s>]*/, '').trim() === token.markup) continue
        problems.push({ ...msg('markdown.componentNotClosed', { tag: token.info, close: token.markup }), line: frontmatterLines + token.map[0] + 1 })
      }
    },
  }))()
}

/** The text of a bracket problem is cut to this length. */
const BRACKET_TEXT_MAX = 40

function profileCheck(profile: MarkdownProfile, problems: Described[], registry?: ComponentRegistry) {
  return defineComarkPlugin(() => ({
    name: 'ginko-profile',
    post(state) {
      const allowed = profile === 'page' ? undefined : TAGS[profile]
      const found = new Set<string>()
      let count = 0
      const fail = (problem: Described) => { if (!found.has(problem.message)) { found.add(problem.message); problems.push(problem) } }
      const slots = profile === 'page' && registry ? componentSlotNodes(state.tree.nodes, registry) : new Set<Node>()
      const visit = (node: Node) => {
        count++
        if (typeof node === 'string' || node[0] === null) return
        const [tag, props, ...children] = node
        const component = registry && Object.hasOwn(registry, tag) ? registry[tag]! : undefined
        // comark makes a `span` of `[text]` that is no link: a typo in a link or picture (`![Bild(datei)`) or brackets
        // meant as text. Where the span was refused before (any profile but `page`; `page` with a registry), say that
        // instead of "unknown component span" (checkComponentTree leaves it to this check). `page` without a registry
        // accepts any tag that is not blocked, the span too, and keeps doing so.
        if (tag === 'span' && !component && (profile !== 'page' || registry)) {
          const text = textOf(node)
          fail(msg('markdown.bracketText', { text: text.length > BRACKET_TEXT_MAX ? `${text.slice(0, BRACKET_TEXT_MAX - 1)}…` : text }))
          children.forEach(visit)
          return
        }
        // A refused tag goes with its attributes: one problem is enough.
        if (isBlockedTag(tag, profile === 'page' ? registry : undefined) && !slots.has(node)) fail(msg('markdown.tagBlocked', { tag }))
        else if (allowed && !allowed.has(tag)) fail(msg('markdown.tagNotInProfile', { tag, allowed: { key: `markdown.profile.${profile}` } }))
        else for (const [name, raw] of Object.entries(props)) {
          const problem = attributeProblem(tag, name, raw, registry)
          // `:name` is comark's bound form of the same prop.
          const key = name.replace(/^:/, '')
          if (problem === 'unsafe') fail(msg('markdown.unsafeLink'))
          else if (problem && component && !Object.hasOwn(component.props, key)) fail(msg('component.propUnknown', { tag, prop: key }))
          else if (problem) fail(msg('markdown.propBlocked', { prop: key }))
        }
        children.forEach(visit)
      }
      state.tree.nodes.forEach(visit)
      if (profile === 'page' && registry) checkComponentTree(state.tree.nodes, registry, fail)
      if (profile === 'inline' && state.tree.nodes.filter((n) => typeof n !== 'string').length > 1) fail(msg('markdown.oneParagraph'))
      if (count > MAX_NODES) fail(msg('markdown.tooComplex', { max: MAX_NODES }))
    },
  }))()
}

/** comark's heading slug (comark/dist/internal/parse/token-processor.js `slugify`): drops every non-`\w` character. */
function comarkSlug(text: string): string {
  const slug = text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
  return /^\d/.test(slug) ? `_${slug}` : slug
}

/** The same slug, with German umlauts spelled out (ä → ae, ß → ss) and other accents removed (é → e). */
function letterSlug(text: string): string {
  const spelled = text.replace(/[äöüÄÖÜß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' })[c] ?? c)
  return comarkSlug(spelled.normalize('NFD').replace(/\p{M}/gu, ''))
}

/** Text of a node; `br` and `html_inline` do not count (comark reads heading text the same way for the slug). */
function textOf(node: Node, blocks = false): string {
  if (typeof node === 'string') return node
  const [tag, , ...children] = node
  if (tag === null || tag === 'br' || tag === 'html_inline' || tag === 'pre') return ''
  return children.map((child) => textOf(child, blocks)).join(blocks && /^(ul|ol|table|thead|tbody|blockquote)$/.test(tag) ? '\n' : '')
}

/**
 * comark makes heading ids that lose every non-ASCII letter ("Empfänger" → "empfnger"). This pass,
 * before `toc`, gives the same ids with the letters kept. It repeats comark's rules (a heading id is
 * prefixed with its h2+ parent's id; a repeated id gets "-1", "-2") once with comark's slug and once
 * with `letterSlug`, and replaces an id only where it is still comark's own. So an explicit `{#id}`,
 * or a heading whose text comark reads differently (an inline component), keeps its id.
 */
// A factory, not a module-level plugin: core is imported by every page, and a call at load time would
// keep comark in the browser bundle although pages never parse.
const headingAnchors = defineComarkPlugin(() => ({
  name: 'heading-anchors',
  post(state) {
    const runs = [comarkSlug, letterSlug].map((slug) => ({ slug, stack: [] as { level: number; id: string }[], counts: new Map<string, number>() }))
    const idsOf = (text: string, level: number) => runs.map(({ slug, stack, counts }) => {
      let id = slug(text)
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop()
      const parent = stack[stack.length - 1]
      if (parent && parent.level >= 2) id = `${parent.id}-${id}`
      stack.push({ level, id })
      const count = counts.get(id) ?? 0
      counts.set(id, count + 1)
      return count === 0 ? id : `${id}-${count}`
    })
    const visit = (node: Node) => {
      if (typeof node === 'string' || node[0] === null) return
      const [tag, props, ...children] = node
      const level = /^h([1-6])$/.exec(tag)?.[1]
      if (level) {
        const [comarkId, letterId] = idsOf(textOf(node), Number(level))
        if (props.id === comarkId) props.id = letterId
        return
      }
      children.forEach(visit)
    }
    state.tree.nodes.forEach(visit)
  },
}))
