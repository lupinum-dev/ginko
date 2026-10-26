import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import { parseFile } from '../src/markdown.ts'

const text = (node: unknown): string => (typeof node === 'string' ? node : Array.isArray(node) ? node.slice(2).map(text).join('') : '')

describe('parseFile', () => {
  it('splits frontmatter and keeps a component as an element', async () => {
    const r = await parseFile('---\ntitle: Hallo\n---\n\n## Erster Teil\n\n::callout{type="warning"}\nVorsicht\n::\n')
    expect(r.frontmatter).toEqual({ title: 'Hallo' })
    const tags = JSON.stringify(r.value.nodes)
    expect(tags).toContain('"callout"')
    expect(text(r.value.nodes.find((n) => Array.isArray(n) && n[0] === 'h2'))).toBe('Erster Teil')
  })

  it('highlights code at build time and lists headings in the toc', async () => {
    const r = await parseFile('## Setup\n\n```ts {1}\nconst a = 1\n```\n\n### Details\n')
    // The renderer keeps only the classes it knows (core/markdown.ts): Shiki's must pass, also for these themes.
    const html = await renderToString(createSSRApp({ render: () => h(GinkoMarkdown, { value: r.value }) }))
    expect(html).toContain('<pre data-language="ts" data-highlights="[1]" class="shiki shiki-themes github-light catppuccin-mocha dark:catppuccin-mocha"><code class="language-ts"><span class="line highlight" style="display: inline-block"><span style="color:#D73A49;--shiki-dark:#CBA6F7">const</span>')
    expect(JSON.stringify(r.value.toc)).toContain('Details')
  })

  it('keeps umlauts in heading anchors as letters, and the toc points at the same ids', async () => {
    const r = await parseFile('## Für Empfänger\n\n### Größe & Maß\n\n## Eigene {#eigen}\n\n## Café Noël\n')
    const ids = r.value.nodes.filter((n) => Array.isArray(n)).map((n) => (n[1] as { id?: string }).id)
    expect(ids).toEqual(['fuer-empfaenger', 'fuer-empfaenger-groesse-mass', 'eigen', 'cafe-noel'])
    expect(JSON.stringify(r.value.toc)).toContain('"id":"fuer-empfaenger-groesse-mass"')
  })

  it('a ```md preview fence carries its parsed content; its headings stay out of the toc', async () => {
    const r = await parseFile('## Page\n\n````md preview\n### Inside\n::note\nHi\n::\n````\n\n```md\n### Plain\n```\n')
    const tag = (n: unknown) => (Array.isArray(n) ? n[0] : n)
    expect(r.value.nodes.map(tag)).toEqual(['h2', 'example', 'pre'])
    const [, props, source] = r.value.nodes[1] as [string, { preview: unknown[] }, unknown]
    expect(props.preview.map(tag)).toEqual(['h3', 'note'])
    expect(tag(source)).toBe('pre')
    expect(JSON.stringify(r.value.toc)).not.toContain('Inside')
  })

  it('a file without frontmatter has an empty one', async () => {
    expect((await parseFile('Nur Text.')).frontmatter).toEqual({})
  })
})
