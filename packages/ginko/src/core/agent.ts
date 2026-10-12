// Text for AI agents: one entry as Markdown, and the llms.txt index of a site's bundle. Pure: no Node APIs, no network.
import type { Node } from 'comark'
import { renderMarkdown } from 'comark/render'
import type { Bundle, BundleItem } from './bundle.ts'
import type { MarkdownTree } from './markdown.ts'
import { labelOf } from './labels.ts'
import type { Label, Schema } from './types.ts'

export interface AgentOptions {
  /** Tells which fields are markdown and text, and the labels of the bricks. */
  schema: Pick<Schema, 'bricks'>
  /** The trees behind `{ ref }` markdown values (withMarkdownRefs); not needed when the bundle holds the trees. */
  trees?: ReadonlyMap<string, MarkdownTree>
}

const treeOf = (value: unknown, trees?: ReadonlyMap<string, MarkdownTree>): MarkdownTree | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  if ('nodes' in value) return value as MarkdownTree
  const ref = (value as { ref?: unknown }).ref
  return typeof ref === 'string' ? trees?.get(ref) : undefined
}

/** One entry as Markdown: its title as `#`, then each text field as a paragraph and each markdown field as its Markdown. */
export async function entryMarkdown(item: BundleItem, brick: string, options: AgentOptions): Promise<string> {
  const title = typeof item.data.title === 'string' ? item.data.title : item.id
  const parts = [`# ${title}`]
  for (const [name, field] of Object.entries(options.schema.bricks[brick]?.fields ?? {})) {
    if (name === 'title') continue
    const value = item.data[name]
    if ((field.type === 'text' || field.type === 'longtext') && typeof value === 'string' && value.trim()) parts.push(value.trim())
    if (field.type !== 'markdown') continue
    const tree = treeOf(value, options.trees)
    if (tree) {
      const markdown = (await renderMarkdown({ nodes: tree.nodes as Node[] })).trim()
      if (markdown) parts.push(markdown)
    }
  }
  return `${parts.join('\n\n')}\n`
}

/** The Markdown twin of a page URL: `/` is `/index.md`, `/blog/a` is `/blog/a.md`. */
const markdownPath = (url: string) => {
  const path = url.replace(/\/+$/, '')
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
  const origin = options.origin.replace(/\/+$/, '')
  const lines = [`# ${options.siteName}`]
  if (options.description) lines.push('', `> ${options.description}`)
  for (const [brick, entry] of Object.entries(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    const links: string[] = []
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      const title = typeof item.data.title === 'string' ? item.data.title : item.id
      links.push(`- [${title}](${origin}${markdownPath(url)})`)
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
  const origin = options.origin.replace(/\/+$/, '')
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
export function markdownNotFound(bundle: Bundle, path: string, options: { origin: string; limit?: number }): string {
  const origin = options.origin.replace(/\/+$/, '')
  const tokens = searchTokens(path)
  const matches: { url: string; title: string; score: number }[] = []
  for (const entry of Object.values(bundle.bricks)) {
    if (entry.kind !== 'collection') continue
    for (const item of entry.items) {
      const url = item.urls?.[bundle.locale]
      if (!url) continue
      const title = typeof item.data.title === 'string' ? item.data.title : item.id
      const haystack = `${url} ${title}`.toLowerCase()
      const score = tokens.filter((token) => haystack.includes(token)).length
      if (score > 0) matches.push({ url, title, score })
    }
  }
  // Array sort is stable, so equal scores keep the bundle order.
  const suggestions = matches.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 5)
  const lines = ['# Not found', '', `There is no page at \`${path}\`.`]
  if (suggestions.length > 0) {
    lines.push('', '## Maybe you meant', '', ...suggestions.map((match) => `- [${match.title}](${origin}${markdownPath(match.url)})`))
  }
  lines.push('', `All pages: ${origin}/llms.txt`)
  return `${lines.join('\n')}\n`
}
