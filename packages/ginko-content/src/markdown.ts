import { parseMarkdown as parseCore, type ParsedMarkdown } from '@lupinum/ginko/internal'
import shiki from 'comark/plugins/shiki'
import { bundledLanguages } from 'shiki/langs'
import { bundledThemes } from 'shiki/themes'

// Languages that are preloaded into the one Shiki highlighter. Other languages render as plain code.
const languageNames = ['typescript', 'javascript', 'json', 'vue', 'bash', 'markdown', 'yaml', 'html', 'css'] as const

/**
 * Comark's Shiki plugin keeps one highlighter for the whole process, so the plugin and its grammars
 * are loaded once here and reused by every call.
 */
async function createPlugins() {
  const [light, dark] = await Promise.all([bundledThemes['github-light'](), bundledThemes['catppuccin-mocha']()])
  const languages = await Promise.all(languageNames.map((name) => bundledLanguages[name]()))
  return [
    shiki({
      registerDefaultThemes: false,
      registerDefaultLanguages: false,
      themes: { light: light.default, dark: dark.default },
      languages: languages.map((language) => language.default),
    }),
  ]
}

let plugins: ReturnType<typeof createPlugins> | undefined

/**
 * One Markdown file → frontmatter and body tree: the core parser (heading anchors, toc) with the
 * Shiki plugin (themes github-light and catppuccin-mocha; code panels are dark, so the dark one shows) added. Profile checks are left to validate().
 * Components (`::callout` blocks and `<Callout>` tags) stay as element nodes; the site maps them.
 */
export async function parseFile(text: string): Promise<ParsedMarkdown> {
  const shikiPlugins = await (plugins ??= createPlugins())
  const parsed = await parseCore(text, { frontmatter: true, plugins: shikiPlugins })
  parsed.value.nodes = await withPreviews(parsed.value.nodes, async (code) => (await parseCore(code, { plugins: shikiPlugins })).value.nodes)
  return parsed
}

type Node = string | [string, Record<string, unknown>, ...Node[]]
const textOf = (node: Node): string => (typeof node === 'string' ? node : node.slice(2).map((n) => textOf(n as Node)).join(''))

/**
 * A ```md preview fence shows its Markdown and what it renders: it becomes `['example', { preview }, pre]`, the
 * parsed content in the `preview` prop and the code block as the child. The preview sits in a prop, so its
 * headings stay out of the page's table of contents and its text out of search. A site without an `example`
 * renderer shows the code block alone.
 */
async function withPreviews<T>(nodes: T[], parse: (code: string) => Promise<unknown[]>): Promise<T[]> {
  return Promise.all(nodes.map(async (raw) => {
    const node = raw as Node
    if (typeof node === 'string') return raw
    const [tag, props, ...children] = node
    if (tag === 'pre' && props.language === 'md' && /(?:^|\s)preview(?:\s|$)/.test(String(props.meta ?? ''))) {
      return ['example', { preview: await parse(textOf(node).replace(/\n$/, '')) }, node] as T
    }
    return [tag, props, ...await withPreviews(children, parse)] as T
  }))
}
