import { describe, expect, test } from 'vitest'
import { isStableMarkdown, markdownBlocks, parseMarkdown, serializeMarkdown, type MarkdownProfile } from '../../src/core/index.ts'

interface Feature { name: string; profile: MarkdownProfile; text: string; unstable?: string }

// One case per element of the four profiles (markdown.ts).
const FEATURES: Feature[] = [
  // inline
  { name: 'bold', profile: 'inline', text: 'Das ist **fett** gesetzt' },
  { name: 'italic', profile: 'inline', text: 'Das ist *kursiv* gesetzt' },
  { name: 'strikethrough', profile: 'inline', text: 'Das ist ~~weg~~ gesetzt' },
  { name: 'inline code', profile: 'inline', text: 'Das ist `code` gesetzt' },
  { name: 'link', profile: 'inline', text: 'Siehe [Lupinum](https://lupinum.com) dort' },
  { name: 'line break', profile: 'inline', text: 'Zeile eins\\\nZeile zwei' },
  { name: 'emoji', profile: 'inline', text: 'Super 🎉' },
  // basic
  { name: 'paragraphs', profile: 'basic', text: 'Eins\n\nZwei' },
  { name: 'h2 h3 h4', profile: 'basic', text: '## Zwei\n\n### Drei\n\n#### Vier\n\nText' },
  {
    name: 'heading with explicit id',
    profile: 'basic',
    text: '## Titel {#eigene-id}\n\nText',
    // comark renders a heading without its id (`## Titel`), so the second parse gets the generated id `titel`.
    unstable: 'a custom heading id {#...} is dropped by the renderer',
  },
  { name: 'bullet list', profile: 'basic', text: '- a\n- b\n  - c' },
  { name: 'ordered list', profile: 'basic', text: '1. a\n2. b' },
  { name: 'loose list (blank lines inside one block)', profile: 'basic', text: '- a\n\n- b\n\n- c' },
  { name: 'blockquote', profile: 'basic', text: '> Zitat\n> zweite Zeile' },
  { name: 'alert', profile: 'basic', text: '> [!NOTE]\n> Hinweis' },
  { name: 'divider', profile: 'basic', text: 'Davor\n\n---\n\nDanach' },
  { name: 'more marker', profile: 'basic', text: 'Anriss\n\n<!-- more -->\n\nRest' },
  {
    name: 'footnote',
    profile: 'basic',
    text: 'Text[^1]\n\n[^1]: Fußnote',
    // The footnotes plugin turns the definition into a `section` with `fn-1` ids; comark renders that tree as
    // `::section{.footnotes}` component syntax and an `:sup[...]` link, not as `[^1]`, so the second parse differs.
    unstable: 'footnote definitions are rewritten into a rendered section, which comark cannot turn back into [^1]',
  },
  // rich
  { name: 'table', profile: 'rich', text: '| a   | b   |\n| --- | --- |\n| 1   | 2   |' },
  { name: 'image', profile: 'rich', text: '![Alt](/bild.png)' },
  { name: 'code block with filename', profile: 'rich', text: '```ts [a.ts]\nconst a = 1\n\nconst b = 2\n```' },
  { name: 'task list', profile: 'rich', text: '- [x] fertig\n- [ ] offen' },
  { name: 'inline math', profile: 'rich', text: 'Formel $x^2$ im Text' },
  { name: 'block math', profile: 'rich', text: '$$\nE=mc^2\n$$' },
  { name: 'mermaid', profile: 'rich', text: '```mermaid\ngraph TD; A-->B\n```' },
  // page
  { name: 'h1 h5 h6', profile: 'page', text: '# Eins\n\n##### Fünf\n\n###### Sechs' },
  { name: 'component', profile: 'page', text: '::callout{type="warning"}\nHinweistext\n::' },
  { name: 'inline component', profile: 'page', text: 'Das ist :badge[neu]{href="/neu"} im Text' },
  { name: 'component with slot template', profile: 'page', text: '::callout\nHaupttext\n\n#footer\nFuß\n::' },
  // The examples of the real component registry are checked in packages/ginko-components/test/components.test.ts.
]

const optionsOf = (profile: MarkdownProfile) => ({ profile })

/** Changes the first text leaf of a node tree, in place. */
function touch(node: unknown): boolean {
  if (!Array.isArray(node)) return false
  for (let i = 2; i < node.length; i++) {
    if (typeof node[i] === 'string') { node[i] += ' GEÄNDERT'; return true }
    if (touch(node[i])) return true
  }
  return false
}

describe('serializeMarkdown corpus', () => {
  test.each(FEATURES)('$name', async ({ profile, text, unstable }) => {
    const options = optionsOf(profile)
    // (a) a round trip through comark's renderer is stable, unless the case says why not
    expect(await isStableMarkdown(text, options), unstable ? `expected unstable: ${unstable}` : 'stable').toBe(!unstable)
    // (b) nothing touched: the text comes back byte for byte
    const original = await markdownBlocks(text, options)
    const { value } = await parseMarkdown(text, options)
    expect(original.nodes).toEqual(value.nodes)
    expect(await serializeMarkdown(value.nodes, { original })).toBe(text)

    // (c) change one block of `Vorher / feature / Nachher`: the text around it stays as it was
    const framed = `Vorher\n\n${text}\n\nNachher\n`
    const blocks = await markdownBlocks(framed, options)
    expect(await serializeMarkdown(blocks.nodes, { original: blocks })).toBe(framed)
    for (const index of new Set([0, 1, blocks.blocks.length - 1])) {
      const target = blocks.blocks[index]!
      const nodes = structuredClone(blocks.nodes)
      const first = blocks.blocks.slice(0, index).reduce((n, b) => n + b.nodes.length, 0)
      if (!touch(nodes[first])) continue
      const out = await serializeMarkdown(nodes, { original: blocks })
      const start = framed.indexOf(target.source, blocks.blocks.slice(0, index).reduce((n, b) => n + b.gap.length + b.source.length, 0))
      const before = framed.slice(0, start)
      const after = framed.slice(start + target.source.length)
      expect(out.startsWith(before), `text before block ${index}`).toBe(true)
      expect(out.endsWith(after), `text after block ${index}`).toBe(true)
      expect(out.slice(before.length, out.length - after.length)).not.toBe(target.source)
    }
  })
})

describe('markdownBlocks', () => {
  test('cuts at blank lines and keeps the exact spacing', async () => {
    const text = '\n# Titel\n\n\nEin Absatz\n\n```\na\n\nb\n```\n\n- x\n\n- y\n\n\n'
    const { blocks, tail } = await markdownBlocks(text, { profile: 'page' })
    expect(blocks.map((b) => b.source)).toEqual(['# Titel', 'Ein Absatz', '```\na\n\nb\n```', '- x\n\n- y'])
    expect(blocks.map((b) => b.gap)).toEqual(['\n', '\n\n\n', '\n\n', '\n\n'])
    expect(tail).toBe('\n\n\n')
  })

  test('a text that cannot be cut is one block', async () => {
    const text = 'Text[^1]\n\nNoch ein Absatz\n\n[^1]: Fußnote'
    const { blocks, nodes } = await markdownBlocks(text, { profile: 'basic' })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.source).toBe(text)
    expect(blocks[0]!.nodes).toEqual(nodes)
  })

  test('frontmatter is not part of the blocks', async () => {
    const { blocks } = await markdownBlocks('---\ntitle: Hallo\n---\n\nText\n\nNoch mehr', { frontmatter: true })
    expect(blocks.map((b) => b.source)).toEqual(['Text', 'Noch mehr'])
  })
})

describe('serializeMarkdown', () => {
  test('inserting and deleting blocks keeps the others and the <!-- more --> line', async () => {
    const text = 'Eins\n\n<!-- more -->\n\nZwei\n\n*   Alt\n*   Stil\n\nDrei\n'
    const original = await markdownBlocks(text, { profile: 'basic' })
    const [one, two, list, three] = original.nodes
    // delete "Zwei", insert a new paragraph before "Drei"
    const out = await serializeMarkdown([one!, list!, ['p', {}, 'Neu'], three!], { original })
    expect(out).toBe('Eins\n\n<!-- more -->\n\n*   Alt\n*   Stil\n\nNeu\n\nDrei\n')
    expect(two).toBeDefined()
  })

  test('a moved block keeps its own text, also to the first place', async () => {
    const text = 'Eins  \n\n*   Alt\n*   Stil\n\n__Drei__\n\nVier\n'
    const original = await markdownBlocks(text, { profile: 'basic' })
    const [one, list, three, four] = original.nodes
    expect(await serializeMarkdown([three!, one!, list!, four!], { original })).toBe('__Drei__\n\nEins  \n\n*   Alt\n*   Stil\n\nVier\n')
    expect(await serializeMarkdown([one!, three!, list!, four!], { original })).toBe('Eins  \n\n__Drei__\n\n*   Alt\n*   Stil\n\nVier\n')
  })

  test('without original it is plain renderMarkdown with - bullets', async () => {
    const { value } = await parseMarkdown('* a\n* b', { profile: 'basic' })
    expect(await serializeMarkdown(value.nodes)).toBe('- a\n- b')
  })
})
