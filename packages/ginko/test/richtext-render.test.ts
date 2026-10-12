// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, Suspense } from 'vue'
import { describe, expect, test } from 'vitest'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import type { MarkdownTree } from '@lupinum/ginko'
import { parseMarkdown } from '@lupinum/ginko/internal'

// comark's renderer has an async setup, so (as in Nuxt pages) it needs a <Suspense> boundary.
async function render(value: MarkdownTree | undefined) {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(GinkoMarkdown, { value }) }) }))
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

  test('a task list shows disabled checkboxes, each named by its item text', async () => {
    const { value } = await parseMarkdown('- [x] Fertig **jetzt**\n- [ ] Offen\n- Ohne Kästchen', { profile: 'basic' })
    const html = await render(value)
    expect(html).toContain('<input class="task-list-item-checkbox" type="checkbox" disabled="" checked="" aria-label="Fertig jetzt">')
    expect(html).toContain('<input class="task-list-item-checkbox" type="checkbox" disabled="" aria-label="Offen">')
    expect(html.match(/<input/g)).toHaveLength(2)
  })
})
