// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, Suspense, type Component } from 'vue'
import { describe, expect, test } from 'vitest'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import type { MarkdownTree } from '@lupinum/ginko'
import { defineComponents, f, parseMarkdown, type ComponentRegistry } from '@lupinum/ginko/internal'

// comark's renderer has an async setup, so (as in Nuxt pages) it needs a <Suspense> boundary.
async function render(value: MarkdownTree | undefined, components?: Record<string, Component>, registry?: ComponentRegistry) {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(GinkoMarkdown, { value, components, registry }) }) }))
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

  // Bug caught: Vue assigned `outerHTML` / `.innerHTML` as DOM properties, so a changed value put raw HTML on the page.
  test('a tree with DOM sink props renders without them, also after the value changes', async () => {
    const tree = (html: string) => ({ nodes: [['p', {}, 'Hi ', ['strong', { 'outerHTML': html, '.innerHTML': html, '^innerHTML': html }, 'x']]] }) as MarkdownTree
    const wrapper = mount(defineComponent({ props: { value: Object }, render() { return h(Suspense, null, { default: () => h(GinkoMarkdown, { value: this.value as MarkdownTree }) }) } }), { props: { value: tree('a') } })
    await flushPromises()
    await wrapper.setProps({ value: tree('<img src="x" data-pwned="1">') })
    await flushPromises()
    expect(wrapper.html()).not.toMatch(/<img|innerhtml|outerhtml/i)
    expect(wrapper.html()).toContain('<strong>x</strong>')
  })

  // Bug caught: the renderer dropped only the listed dangers (on*, DOM sinks, `as`), so `style`, `id` or a bound value
  // that comark looks up in its render data reached the page from a tree that skipped the parser (an import).
  test('a tree keeps only the attributes of the allowlist', async () => {
    const value = { nodes: [
      ['p', { style: 'position:fixed;inset:0', id: '__nuxt', hidden: '', class: 'note', 'data-x': '1' }, 'Overlay'],
      ['p', {}, ['strong', { ':title': 'frontmatter.title', ':data-ok': '"ja"' }, 'x'], ['a', { href: '/a', ':href': '"/b"', target: '_top' }, 'a']],
      ['pre', { language: 'ts' }, ['code', {}, ['span', { style: 'color:#D73A49;--shiki-dark:#CBA6F7' }, 'const'], ['span', { style: 'position:fixed' }, ' x']]],
      // A file's image with its WebP copies (@lupinum/ginko-content): each address in srcset is checked.
      ['p', {}, ['img', { src: '/a.png', alt: 'A', srcset: '/a-640.webp 640w, /a.png 2000w', sizes: '100vw' }], ['img', { src: '/b.png', alt: 'B', srcset: 'javascript:alert(1) 1x' }]],
    ] } as MarkdownTree
    const html = await render(value)
    expect(html).toContain('<p class="note" data-x="1">Overlay</p>')
    expect(html).toContain('<strong data-ok="ja">x</strong>')
    expect(html).toContain('<a href="/a">a</a>')
    expect(html).toMatch(/<span style="color: ?#D73A49; ?--shiki-dark: ?#CBA6F7;?">const<\/span><span> x<\/span>/)
    expect(html).toContain('<img src="/a.png" alt="A" srcset="/a-640.webp 640w, /a.png 2000w" sizes="100vw">')
    expect(html).toContain('<img src="/b.png" alt="B">')
  })

  test('a component keeps the props its registry declares; without a registry only the global attributes', async () => {
    const Badge = defineComponent({ props: { color: String }, setup: (props, { slots }) => () => h('mark', { 'data-color': props.color }, slots.default?.()) })
    const registry = defineComponents({ badge: { kind: 'inline', label: 'Badge', describe: 'x', props: { color: f.text('Farbe') } } })
    const value = { nodes: [['p', {}, ['badge', { color: 'red', style: 'position:fixed', onclick: 'alert(1)', class: 'b' }, 'neu']]] } as MarkdownTree
    expect(await render(value, { badge: Badge }, registry)).toContain('<mark data-color="red" class="b">neu</mark>')
    expect(await render(value, { badge: Badge })).toContain('<mark class="b">neu</mark>')
  })

  // Bug caught: a registry that declares `embed` lets `::embed` through the parser; without a mapped component
  // the renderer emitted a native <embed> that loads the address like an iframe.
  test('a blocked tag renders only through a mapped component', async () => {
    const value = { nodes: [['embed', { src: 'https://example.org' }], ['script', {}, 'alert(1)'], ['SCRIPT', {}, 'alert(2)'], ['EMBED', { src: 'https://example.org' }], ['p', {}, 'kept']] } as MarkdownTree
    const bare = await render(value)
    expect(bare).not.toMatch(/<embed|<script|alert/i)
    expect(bare).toContain('<p>kept</p>')
    const Embed = defineComponent({ props: { src: String }, setup: (props) => () => h('figure', props.src) })
    const registry = defineComponents({ embed: { kind: 'block', label: 'Embed', describe: 'x', props: { src: f.text('Adresse') } } })
    expect(await render(value, { embed: Embed }, registry)).toContain('<figure>https://example.org</figure>')
  })

  // Bug caught: `**x**{as="embed"}` in a tree that skipped the parser mounted the mapped embed component.
  test('an `as` prop mounts no component, except on an alert', async () => {
    const Embed = defineComponent({ props: { src: String }, setup: (props) => () => h('figure', props.src) })
    const Tip = defineComponent({ setup: (_, { slots }) => () => h('aside', slots.default?.()) })
    const value = { nodes: [['p', {}, ['strong', { as: 'embed', src: 'https://example.org' }, 'x']], ['blockquote', { as: 'tip' }, 'Hinweis']] } as MarkdownTree
    const html = await render(value, { embed: Embed, tip: Tip })
    expect(html).not.toContain('<figure')
    expect(html).toContain('<strong>x</strong>')
    expect(html).toContain('<aside as="tip">Hinweis</aside>')
  })
})
