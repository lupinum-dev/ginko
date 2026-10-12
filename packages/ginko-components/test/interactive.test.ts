import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GINKO_TOC_KEY, parseMarkdown } from '@lupinum/ginko/internal'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import { components } from '../src/registry.ts'
import { componentMap } from '../src/runtime/components/index.ts'

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => { warn = vi.spyOn(console, 'warn') })
afterEach(() => { warn.mockRestore() })

async function render(text: string, provideToc = false): Promise<string> {
  const parsed = await parseMarkdown(text, { profile: 'page', components })
  expect(parsed.problems).toEqual([])
  const app = createSSRApp({ render: () => h(GinkoMarkdown, { value: parsed.value, components: componentMap }) })
  if (provideToc) app.provide(GINKO_TOC_KEY, parsed.value.toc)
  const html = await renderToString(app)
  expect(warn).not.toHaveBeenCalled()
  return html
}

describe('interactive components', () => {
  test('a tab outside tabs is a problem; a card may stand alone', async () => {
    const tab = await parseMarkdown('::tab{label="A"}\nText\n::', { profile: 'page', components })
    expect(tab.problems.join('\n')).toContain('darf nur in „tabs“ stehen')
    expect((await parseMarkdown('::card{title="A"}\nText\n::', { profile: 'page', components })).problems).toEqual([])
  })

  test('tabs: the first panel is visible, the others stay in the DOM with `hidden`', async () => {
    const html = await render(':::tabs\n::tab{label="Eins"}\nErster Text\n::\n::tab{label="Zwei"}\nZweiter Text\n::\n::tab{label="Drei"}\nDritter Text\n::\n:::')
    const panels = [...html.matchAll(/<div id="[^"]*-p\d"[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0])
    expect(panels).toHaveLength(3)
    expect(panels.map((p) => /\shidden(=|\s|>)/.test(p))).toEqual([false, true, true])
    expect(html).toContain('Zweiter Text')
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0])
    expect(tabs.map((t) => t.includes('aria-selected="true"'))).toEqual([true, false, false])
    expect(tabs.map((t) => t.includes('tabindex="0"'))).toEqual([true, false, false])
  })

  test('a bare `open` opens an accordion item and a collapse', async () => {
    const html = await render(':::accordion\n::accordion-item{label="A" open}\nx\n::\n::accordion-item{label="B"}\ny\n::\n:::\n\n::collapse{label="C"}\nz\n::')
    expect(html.match(/<details[^>]*>/g)!.map((d) => d.includes(' open'))).toEqual([true, false, false])
  })

  test('accordion items close each other through a shared name; `multiple` lets several stay open', async () => {
    const names = async (text: string) => (await render(text)).match(/<details[^>]*>/g)!.map((d) => d.match(/name="([^"]+)"/)?.[1])
    const single = await names(':::accordion\n::accordion-item{label="A"}\nx\n::\n::accordion-item{label="B"}\ny\n::\n:::')
    expect(single[0]).toBeTruthy()
    expect(single[1]).toBe(single[0])
    expect(await names(':::accordion{multiple}\n::accordion-item{label="A"}\nx\n::\n::accordion-item{label="B"}\ny\n::\n:::')).toEqual([undefined, undefined])
  })

  test('collapse without a label clips the content behind a "show more" button instead of an empty summary', async () => {
    const html = await render('::collapse\nLanger Text.\n::')
    expect(html).not.toContain('<details')
    expect(html).toContain('data-clipped')
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>\s*Mehr anzeigen/)
  })

  test('inline-toc lists the headings nested and renders nothing without any', async () => {
    const html = await render('## Eins\n\n### Eins A\n\n## Zwei\n\n::inline-toc\n::', true)
    expect(html).toContain('href="#eins"')
    expect(html).toMatch(/href="#eins">Eins<\/a><ul>.*href="#eins-eins-a"/)
    expect(await render('Kein Titel.\n\n::inline-toc\n::', true)).not.toContain('ginko-inline-toc')
    expect(await render('## Eins\n\n::inline-toc\n::')).not.toContain('ginko-inline-toc')
  })
})
