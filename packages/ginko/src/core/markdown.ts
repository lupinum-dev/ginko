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
import type { Json } from './types.ts'

/**
 * In page state the tree is replaced by `ref`, the site path that serves it, so a page's payload
 * carries only the texts it shows (CONTENT.md, Phase 14). `toc` stays for lists and navigation.
 */
export type MarkdownValue = MarkdownTree | { ref: string; toc?: MarkdownToc }

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
 * Raw HTML is never parsed: `<b>` stays text. Links and images must pass `isSafeHref`.
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
/**
 * Attributes a text may not set (besides `on*`): `style` paints over the page, `id` can clash with the page's own
 * ids (`__NUXT_DATA__` blanks it). Heading ids stay (the parser makes them), and so do props a registry declares.
 */
const BLOCKED_ATTRIBUTES: ReadonlySet<string> = new Set(['style', 'id'])

/**
 * Props that Vue sets as DOM properties writing markup or text (`el.outerHTML = value` replaces the element with raw
 * HTML on the next patch). Compared lower-cased and without comark's `:`. comark itself drops only innerHTML,
 * dangerouslySetInnerHTML and textContent. A raw key that starts with `.` or `^` (Vue's force-prop / force-attr
 * prefixes) is refused too: Vue patches `.`-keys even during hydration.
 */
const DOM_SINK_PROPS: ReadonlySet<string> = new Set(['outerhtml', 'innerhtml', 'outertext', 'innertext', 'textcontent'])
export const isDomSinkProp = (name: string): boolean => /^[.^]/.test(name) || DOM_SINK_PROPS.has(name.replace(/^:/, '').toLowerCase())

/** The alert types comark's alert plugin writes as `as` on a `blockquote` (`> [!TIP]`). */
const ALERT_TYPES: ReadonlySet<string> = new Set(['note', 'tip', 'important', 'warning', 'caution'])

/**
 * comark's renderer mounts the component named by an `as` prop in place of the element, so `**x**{as="embed"}`
 * would get past the registry. Only the alert plugin's own `as` stays.
 */
export function allowedAs(tag: string | null, raw: unknown): boolean {
  return tag === 'blockquote' && typeof raw === 'string' && ALERT_TYPES.has(raw)
}

/** What the parser itself writes: heading ids, footnote ids (`fn-1`, `fnref-1`) and the `text-align` of table cells. */
function parserMade(tag: string, key: string, raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  if (key === 'id') return (/^h[1-6]$/.test(tag) && !raw.startsWith('__')) || ((tag === 'a' || tag === 'li') && /^fn(ref)?-[\w-]+$/.test(raw))
  return (tag === 'th' || tag === 'td') && /^text-align:(left|right|center)$/.test(raw)
}

/** Attributes that hold an address; their value must pass `isSafeHref`. */
export const URL_PROPS: ReadonlySet<string> = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'xlink:href'])
export const UNSAFE_LINK = msg('markdown.unsafeLink').message
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
  /** The site's component registry. With the `page` profile, only these components are allowed, with checked props, parents and children. Without it `page` accepts any tag except the blocked ones. */
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
  problemMessages: Described[]
}

/** Parses Markdown with comark, checks it against the profile, adds heading anchors and the toc (h2, h3). */
export async function parseMarkdown(text: string, options: ParseOptions = {}): Promise<ParsedMarkdown> {
  const problems: Described[] = []
  let body = text
  let summary: Node[] | undefined
  const plugins = [
    ...(options.frontmatter ? [frontmatter(), defineComarkPlugin(() => ({ name: 'ginko-body', pre(state) { body = state.markdown.replace(/^\r?\n/, '') } }))()] : []),
    alert(), taskList(), components(), attributes(),
    // Every profile parses these; profileCheck refuses the tags a profile does not allow, so `$a$` in a
    // `basic` field is reported, not silently kept. Footnotes must run before the check (`[^1]` is a `span` until then).
    emoji(), footnotes(), math(), mermaid(),
    moreMarker((nodes) => { summary = nodes }),
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
  return { frontmatter: tree.frontmatter as Record<string, unknown>, value, body, problems: problems.map((p) => p.message), problemMessages: problems }
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

function profileCheck(profile: MarkdownProfile, problems: Described[], registry?: ComponentRegistry) {
  return defineComarkPlugin(() => ({
    name: 'ginko-profile',
    post(state) {
      const allowed = profile === 'page' ? undefined : TAGS[profile]
      const found = new Set<string>()
      let count = 0
      const fail = (problem: Described) => { if (!found.has(problem.message)) { found.add(problem.message); problems.push(problem) } }
      const slots = profile === 'page' && registry ? componentSlotNodes(state.tree.nodes, registry) : new Set<Node>()
      // A prop the registry declares for this component is the site's own contract and stays.
      const declaredProp = (tag: string, key: string) => !!registry && Object.hasOwn(registry, tag) && Object.hasOwn(registry[tag]!.props, key)
      const visit = (node: Node) => {
        count++
        if (typeof node === 'string' || node[0] === null) return
        const [tag, props, ...children] = node
        if (isBlockedTag(tag, profile === 'page' ? registry : undefined) && !slots.has(node)) fail(msg('markdown.tagBlocked', { tag }))
        else if (allowed && !allowed.has(tag)) fail(msg('markdown.tagNotInProfile', { tag, allowed: { key: `markdown.profile.${profile}` } }))
        for (const [name, raw] of Object.entries(props)) {
          // `:name` is comark's bound form of the same prop.
          const key = name.replace(/^:/, '').toLowerCase()
          if (key.startsWith('on') || isDomSinkProp(name)) fail(msg('markdown.propBlocked', { prop: key }))
          else if (key === 'as' && (name.startsWith(':') || !allowedAs(tag, raw))) fail(msg('markdown.propBlocked', { prop: key }))
          else if (BLOCKED_ATTRIBUTES.has(key) && !declaredProp(tag, key) && !parserMade(tag, key, raw)) fail(msg('markdown.propBlocked', { prop: key }))
          else if (URL_PROPS.has(key) && (typeof raw !== 'string' || !isSafeHref(raw))) fail(msg('markdown.unsafeLink'))
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
