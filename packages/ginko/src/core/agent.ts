// Text for AI agents: one entry as Markdown, and the llms.txt index of a site's bundle. Pure: no Node APIs, no network.
import type { Node } from 'comark'
import { renderMarkdown } from 'comark/render'
import { entryTitle, type Bundle, type BundleItem } from './bundle.ts'
import type { MarkdownTree, TextResolver } from './markdown.ts'
import { labelOf } from './labels.ts'
import { withoutTrailingSlashes } from './path.ts'
import type { Label, Schema } from './types.ts'

export interface AgentOptions {
  /** Tells which fields are markdown and text, and the labels of the bricks. */
  schema: Pick<Schema, 'bricks'>
  /** The trees behind `{ ref }` markdown values (withMarkdownRefs); not needed when the bundle holds the trees. */
  trees?: ReadonlyMap<string, MarkdownTree>
  /** Turns components without text of their own (facts) into text: `factResolver` of the bundle. Unset: they stay as written. */
  resolve?: TextResolver
}

const treeOf = (value: unknown, trees?: ReadonlyMap<string, MarkdownTree>): MarkdownTree | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  if ('nodes' in value) return value as MarkdownTree
  const ref = (value as { ref?: unknown }).ref
  return typeof ref === 'string' ? trees?.get(ref) : undefined
}

/**
 * A plain text field as Markdown text: characters that Markdown or HTML would read as syntax are escaped, so a title
 * like `<img onerror=…>` or `a](b` stays text in the `.md` twin and llms.txt. `inline` (titles, link texts) also
 * turns each run of white space that holds a line break into one space, in one pass (a long run of spaces stays fast).
 */
export const markdownText = (text: string, inline = false) =>
  (inline ? text.replace(/\s+/g, (space) => (space.includes('\n') ? ' ' : space)) : text).replace(/[\\`*_[\]<>#|!~]/g, '\\$&')

/** One entry as Markdown: its title as `#`, then each text field as a paragraph and each markdown field as its Markdown. */
export async function entryMarkdown(item: BundleItem, brick: string, options: AgentOptions): Promise<string> {
  const title = entryTitle(item, options.schema.bricks[brick]?.fields)
  const parts = [`# ${markdownText(title, true)}`]
  for (const [name, field] of Object.entries(options.schema.bricks[brick]?.fields ?? {})) {
    const value = item.data[name]
    // The title is the heading already (for a person, the name its slug is made from).
    if (name === 'title' || value === title) continue
    // A text that is not translated is a code, not language (an icon name such as `lucide:book-open`, a command).
    const prose = (field.type === 'text' || field.type === 'longtext') && field.translate !== false
    if (prose && typeof value === 'string' && value.trim()) parts.push(markdownText(value.trim()))
    if (field.type !== 'markdown') continue
    const tree = treeOf(value, options.trees)
    if (tree) {
      const nodes = options.resolve ? withText(tree.nodes as Node[], options.resolve) : (tree.nodes as Node[])
      const markdown = (await renderMarkdown({ nodes })).trim()
      if (markdown) parts.push(markdown)
    }
  }
  return `${parts.join('\n\n')}\n`
}

/** The nodes with every component that `resolve` knows replaced by its text (a fact by its value). */
function withText(nodes: readonly Node[], resolve: TextResolver): Node[] {
  return nodes.map((node) => {
    if (typeof node === 'string' || node[0] === null) return node
    const [tag, props, ...children] = node
    const own = resolve(tag, props as Record<string, unknown> | undefined)
    return own !== undefined ? own : ([tag, props, ...withText(children as Node[], resolve)] as Node)
  })
}

/** The Markdown twin of a page URL: `/` is `/index.md`, `/blog/a` is `/blog/a.md`. */
const markdownPath = (url: string) => {
  const path = withoutTrailingSlashes(url)
  return path === '' ? '/index.md' : `${path}.md`
}

/**
 * The llms.txt index (https://llmstxt.org): the site name, its description, and per collection brick a list of
 * its entries with a URL in the bundle's locale, linked to their Markdown. Entries without a URL are left out.
 */
function brickLabel(label: Label | undefined, brick: string, bundle: Bundle): string {
  return label === undefined ? brick : labelOf(label, bundle.locale, bundle.mainLocale)
}

export function llmsTxt(bundle: Bundle, options: AgentOptions & { siteName: string; description?: string; origin: string }): string {
  const origin = withoutTrailingSlashes(options.origin)
  const lines = [`# ${options.siteName}`]
  if (options.description) lines.push('', `> ${options.description}`)
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    const links: string[] = []
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      const title = entryTitle(item, options.schema.bricks[brick]?.fields)
      links.push(`- [${markdownText(title, true)}](${origin}${markdownPath(url)})`)
    }
    if (links.length === 0) continue
    lines.push('', `## ${brickLabel(options.schema.bricks[brick]?.label, brick, bundle)}`, '', ...links)
  }
  return `${lines.join('\n')}\n`
}

/**
 * The llms-full.txt (https://llmstxt.org): the site name and description, then every collection entry that has a
 * URL in the bundle's locale, in llmsTxt's order: `---`, its absolute URL as `Source:`, and its Markdown (entryMarkdown).
 */
export async function llmsFullTxt(bundle: Bundle, options: AgentOptions & { siteName: string; description?: string; origin: string }): Promise<string> {
  const origin = withoutTrailingSlashes(options.origin)
  const parts = [`# ${options.siteName}`]
  if (options.description) parts.push(`> ${options.description}`)
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      const markdown = await entryMarkdown(item, brick, options)
      parts.push(`---\n\nSource: ${origin}${url}\n\n${markdown.trimEnd()}`)
    }
  }
  return `${parts.join('\n\n')}\n`
}

// Words of a requested path that can match a page: lowercase, without `.md`, split on `/ - _ .`, at least 3 letters.
const searchTokens = (path: string) => [...new Set(path.toLowerCase().replace(/\.md$/, '').split(/[/_.-]+/).filter((token) => token.length >= 3))]

/**
 * The Markdown 404 for a `.md` request without an entry: the requested path, up to `limit` collection entries (URL in the
 * bundle's locale) whose URL or title contains the most words of the path, and the llms.txt index. Nothing matches: no list.
 */
export function markdownNotFound(bundle: Bundle, path: string, options: { origin: string; limit?: number; schema?: AgentOptions['schema'] }): string {
  const origin = withoutTrailingSlashes(options.origin)
  const tokens = searchTokens(path)
  const matches: { url: string; title: string; score: number }[] = []
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      const title = entryTitle(item, options.schema?.bricks[brick]?.fields)
      const haystack = `${url} ${title}`.toLowerCase()
      const score = tokens.filter((token) => haystack.includes(token)).length
      if (score > 0) matches.push({ url, title, score })
    }
  }
  // Array sort is stable, so equal scores keep the bundle order.
  const suggestions = matches.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 5)
  const lines = ['# Not found', '', `There is no page at \`${path}\`.`]
  if (suggestions.length > 0) {
    lines.push('', '## Maybe you meant', '', ...suggestions.map((match) => `- [${markdownText(match.title, true)}](${origin}${markdownPath(match.url)})`))
  }
  lines.push('', `All pages: ${origin}/llms.txt`)
  return `${lines.join('\n')}\n`
}
