// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, Suspense, type Component } from 'vue'
import { describe, expect, test } from 'vitest'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import type { MarkdownTree } from '@lupinum/ginko'
import { parseMarkdown } from '@lupinum/ginko/internal'

// comark's renderer has an async setup, so (as in Nuxt pages) it needs a <Suspense> boundary.
async function render(value: MarkdownTree | undefined, components?: Record<string, Component>) {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(GinkoMarkdown, { value, components }) }) }))
  await flushPromises()
  return wrapper.html()
}

describe('GinkoMarkdown (plain Vue)', () => {
  test('renders a parsed tree with its heading anchor and links', async () => {
    const { value } = await parseMarkdown('## Für Empfänger\n\nSiehe [Karte](/speisekarte) und [mehr](https://example.com).')
    const html = await render(value)
    expect(html).toContain('id="fuer-empfaenger"')
    expect(html).toContain('<a href="/speisekarte">Karte</a>')
    expect(html).toContain('href="https://example.com"')
  })

  test('math and mermaid show their source without KaTeX or mermaid.js', async () => {
    const { value } = await parseMarkdown('Formel $x^2$\n\n```mermaid\ngraph TD; A-->B\n```')
    const html = await render(value)
    expect(html).toContain('<code class="math inline">x^2</code>')
    expect(html).toContain('<pre class="mermaid">graph TD; A--&gt;B\n</pre>')
  })

  // Bug caught: without a site renderer the node became an unknown <example> element with the preview tree in an attribute.
  test('a ```md preview fence (`example`) shows its code block alone', async () => {
    const html = await render({ nodes: [['example', { preview: [['p', {}, 'Shown']] }, ['pre', { language: 'md' }, ['code', {}, 'Shown']]]] })
    expect(html).toContain('<pre language="md"><code>Shown</code></pre>')
    expect(html).not.toMatch(/<example|preview=|<p>Shown/)
  })

  test('a task list shows disabled checkboxes, each named by its item text', async () => {
    const { value } = await parseMarkdown('- [x] Fertig **jetzt**\n- [ ] Offen\n- Ohne Kästchen', { profile: 'basic' })
    const html = await render(value)
    expect(html).toContain('<input class="task-list-item-checkbox" type="checkbox" disabled="" checked="" aria-label="Fertig jetzt">')
    expect(html).toContain('<input class="task-list-item-checkbox" type="checkbox" disabled="" aria-label="Offen">')
    expect(html.match(/<input/g)).toHaveLength(2)
  })

  // Bug caught: a tree that skipped the parser (platform bundle) rendered script URLs and event handlers as they were.
  test('a tree with javascript: URLs and onclick renders without those attributes', async () => {
    const html = await render({ nodes: [['p', {}, ['a', { href: 'javascript:alert(1)', onclick: 'alert(2)' }, 'bad'], ' ', ['a', { href: '/ok' }, 'good'], ['img', { src: 'data:text/html,x', alt: 'i' }]]] })
    expect(html).not.toMatch(/javascript:|onclick|data:/)
    expect(html).toContain('<a>bad</a>')
    expect(html).toContain('<a href="/ok">good</a>')
  })

  // Bug caught: a registry that declares `embed` lets `::embed` through the parser; without a mapped component
  // the renderer emitted a native <embed> that loads the address like an iframe.
  test('a blocked tag renders only through a mapped component', async () => {
    const value = { nodes: [['embed', { src: 'https://example.org' }], ['script', {}, 'alert(1)'], ['p', {}, 'kept']] } as MarkdownTree
    const bare = await render(value)
    expect(bare).not.toMatch(/<embed|<script|alert/)
    expect(bare).toContain('<p>kept</p>')
    const Embed = defineComponent({ props: { src: String }, setup: (props) => () => h('figure', props.src) })
    expect(await render(value, { embed: Embed })).toContain('<figure>https://example.org</figure>')
  })
})
