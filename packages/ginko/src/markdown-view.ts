// Renders a parsed Markdown tree (`MarkdownTree`) with comark's Vue renderer: no parser or highlighter
// runs here, the tree was built by `parseMarkdown`. Nuxt-free, so plain Vue apps use it directly; the
// Nuxt component (`nuxt/runtime/GinkoMarkdown.ts`) loads `{ ref }` values and renders through this one.
import { defineComponent, h, type Component, type PropType } from 'vue'
import { MarkdownDocument } from '@comark/vue'
import type { MarkdownTree } from './core/index.ts'

// KaTeX and mermaid.js are not part of Ginko's bundle, so math and mermaid nodes show their source:
// math as `<code class="math">`, mermaid as `<pre class="mermaid">` (the markup mermaid.js looks for).
// A ```md preview fence (`example`, from @lupinum/ginko-content) shows its code block alone.
// A site that wants real rendering passes its own `math` / `mermaid` / `example` components, which win over these.
const sourceOnly: Record<string, Component> = {
  math: defineComponent({
    name: 'GinkoMath',
    // The parser's `class` ("math inline" or "math block") falls through to the element.
    props: { content: { type: String, default: '' } },
    setup: (props) => () => h('code', props.content),
  }),
  mermaid: defineComponent({
    name: 'GinkoMermaid',
    props: { content: { type: String, default: '' } },
    setup: (props) => () => h('pre', { class: 'mermaid' }, props.content),
  }),
  example: defineComponent({
    name: 'GinkoExample',
    // Declared so the parsed preview does not fall through as an attribute; the code block is the slot.
    props: { preview: { type: Array, default: undefined } },
    setup: (_, { slots }) => () => slots.default?.(),
  }),
}

type Tree = MarkdownTree['nodes'][number]

const textOf = (node: Tree): string => (typeof node === 'string' ? node : Array.isArray(node) ? node.slice(2).map((child) => textOf(child as Tree)).join('') : '')

/**
 * A task list item (`- [x] text`) comes as `li > input` followed by the text. A bare checkbox has no name for a
 * screen reader, so each one gets the text of its item as `aria-label` (nested lists are not part of the label).
 */
function labelCheckboxes(node: Tree): Tree {
  if (!Array.isArray(node)) return node
  const [tag, props, ...children] = node as [string | null, Record<string, Tree>, ...Tree[]]
  let rest = children.map(labelCheckboxes)
  if (tag === 'li') {
    // A loose item wraps its text (and the checkbox) in a paragraph.
    const holder = Array.isArray(rest[0]) && rest[0][0] === 'p' ? 0 : -1
    const own = (holder === 0 ? (rest[0] as unknown[]).slice(2) : rest) as Tree[]
    const box = own.findIndex((child) => Array.isArray(child) && child[0] === 'input')
    if (box === 0) {
      const label = own.slice(1).filter((child) => !(Array.isArray(child) && (child[0] === 'ul' || child[0] === 'ol'))).map(textOf).join('').trim()
      const input = own[0] as [string, Record<string, Tree>]
      const labelled = label ? [input[0], { ...input[1], 'aria-label': label }] : input
      const next = [labelled, ...own.slice(1)] as Tree[]
      rest = holder === 0 ? [[...(rest[0] as unknown[]).slice(0, 2), ...next] as Tree, ...rest.slice(1)] : next
    }
  }
  return [tag, props, ...rest] as Tree
}

export const GinkoMarkdown = defineComponent({
  name: 'GinkoMarkdown',
  props: {
    value: { type: Object as PropType<MarkdownTree | null | undefined>, default: undefined },
    /** Tag → component (or another tag name), e.g. `{ callout: Callout }`. Other tags use a global component of that name (PascalCase), else a plain element. */
    components: { type: Object as PropType<Record<string, Component | string>>, default: () => ({}) },
  },
  setup(props) {
    // The tree is plain JSON; comark's renderer takes the same `{ nodes }` shape.
    return () => (props.value ? h(MarkdownDocument, { value: { nodes: props.value.nodes.map(labelCheckboxes) as never }, components: { ...sourceOnly, ...props.components } }) : null)
  },
})
