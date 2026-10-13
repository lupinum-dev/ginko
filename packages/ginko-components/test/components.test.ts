import { readFileSync } from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { componentProblems, GINKO_TOC_KEY, isStableMarkdown, markdownBlocks, parseMarkdown, serializeMarkdown } from '@lupinum/ginko/internal'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import { components } from '../src/registry.ts'
import { componentMap } from '../src/runtime/components/index.ts'

/** Plain Markdown tags the map overrides (they have no registry entry). */
const PLAIN_TAG_OVERRIDES = ['pre', 'img']

// Root class each tag renders. Aliases share the callout.
const ROOT: Record<string, string> = {
  callout: 'ginko-callout', note: 'ginko-callout', info: 'ginko-callout', warning: 'ginko-callout', error: 'ginko-callout',
  success: 'ginko-callout', idea: 'ginko-callout', aside: 'ginko-aside', excerpt: 'ginko-excerpt', dropcap: 'ginko-dropcap',
  kbd: 'ginko-kbd', badge: 'ginko-badge', flow: 'ginko-flow', layout: 'ginko-layout', column: 'ginko-column', center: 'ginko-center',
  timeline: 'ginko-timeline', 'timeline-item': 'ginko-timeline-item',
  'code-group': 'ginko-code-group', 'code-tree': 'ginko-code-tree', files: 'ginko-files',
  figure: 'ginko-figure', video: 'ginko-video', embedded: 'ginko-embed',
  quiz: 'ginko-quiz', 'quiz-question': 'ginko-quiz-question', api: 'ginko-api', 'api-param': 'ginko-api-param',
  tabs: 'ginko-tabs', tab: 'class="ginko-tab"', accordion: 'ginko-accordion', 'accordion-item': 'ginko-accordion-item', collapse: 'ginko-collapse', steps: 'ginko-steps', cards: 'ginko-cards', card: 'ginko-card', 'read-more': 'ginko-read-more', 'inline-toc': 'ginko-inline-toc',
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => { warn = vi.spyOn(console, 'warn') })
afterEach(() => { warn.mockRestore() })

describe('registry and components', () => {
  test('the registry is valid and every tag has a component', () => {
    expect(componentProblems(components)).toEqual([])
    expect(Object.keys(components).filter((tag) => !(tag in componentMap))).toEqual([])
    expect(Object.keys(componentMap).filter((tag) => !(tag in components)).sort()).toEqual(PLAIN_TAG_OVERRIDES.slice().sort())
  })

  test.each(Object.entries(components))('%s: example parses and renders', async (tag, def) => {
    // `inline-toc` shows the headings of its page, so its example gets one.
    const text = tag === 'inline-toc' ? `## Überblick\n\n${def.editor!.example!}` : def.editor!.example!
    const parsed = await parseMarkdown(text, { profile: 'page', components })
    expect(parsed.problems).toEqual([])
    const app = createSSRApp({ render: () => h(GinkoMarkdown, { value: parsed.value, components: componentMap }) })
    app.provide(GINKO_TOC_KEY, parsed.value.toc)
    const html = await renderToString(app)
    expect(html).toContain(ROOT[tag]!)
    expect(warn).not.toHaveBeenCalled()
    // The editor writes it back unchanged, and a re-render of it parses the same.
    const options = { profile: 'page' as const, components }
    expect(await isStableMarkdown(text, options)).toBe(true)
    expect(await serializeMarkdown(parsed.value.nodes, { original: await markdownBlocks(text, options) })).toBe(text)
  })

  // `appearance` is theming API: every tag that offers it renders it as `data-appearance` on its framed root.
  test.each(Object.entries(components).filter(([, def]) => 'appearance' in (def.props ?? {})).map(([tag]) => tag))('%s: appearance renders as data-appearance', async (tag) => {
    const example = tag === 'inline-toc' ? `## Überblick\n\n${components[tag].editor!.example!}` : components[tag as keyof typeof components].editor!.example!
    const text = example.replace(new RegExp(`(:+${tag})(\\{[^}]*)?\\}?`), (_, open: string, attrs?: string) => `${open}${attrs ? `${attrs} ` : '{'}appearance="tint"}`)
    const parsed = await parseMarkdown(text, { profile: 'page', components })
    expect(parsed.problems).toEqual([])
    const app = createSSRApp({ render: () => h(GinkoMarkdown, { value: parsed.value, components: componentMap }) })
    app.provide(GINKO_TOC_KEY, parsed.value.toc)
    expect(await renderToString(app)).toMatch(new RegExp(`class="${ROOT[tag]}[^"]*"[^>]*data-appearance="tint"`))
  })

  // The prop lists on the docs pages and in the README are written by hand: a new prop must not stay undocumented.
  const docs = ['7.komponenten.md', '7.komponenten.en.md'].map((file) => readFileSync(new URL(`../../../sites/docs/content/docs/${file}`, import.meta.url), 'utf8'))
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  test.each(Object.entries(components))('%s: every prop is documented', (tag, def) => {
    const props = Object.keys(def.props ?? {})
    for (const page of docs) {
      // Examples hold headings of their own: leave the fenced blocks out.
      const section = page.replace(/^(`{3,})[^\n]*\n[^]*?^\1[ \t]*$/gm, '').split(/\n(?=##+ )/).find((part) => new RegExp(`^###+ .*\`${tag}\``).test(part))
      expect(section, `docs section of ${tag}`).toBeDefined()
      expect(props.filter((prop) => !section!.includes(`\`${prop}\``))).toEqual([])
    }
    const row = readme.split('\n').find((line) => line.startsWith('| ') && line.split('|')[1]!.includes(`\`${tag}\``))
    expect(row, `README row of ${tag}`).toBeDefined()
    expect(props.filter((prop) => prop !== 'appearance' && !row!.includes(`\`${prop}\``))).toEqual([])
    if (props.includes('appearance')) expect(readme).toMatch(new RegExp(`The tags with \`appearance\`:[^]*?\`${tag}\``))
  })

  test('a code group holds only code blocks', async () => {
    const parsed = await parseMarkdown('::code-group\n## Titel\n\nText\n::', { profile: 'page', components })
    expect(parsed.problems.join('\n')).toContain('darf nur „pre“ enthalten, nicht „h2“')
  })

  test('a callout with an unknown type is a problem', async () => {
    const parsed = await parseMarkdown('::callout{type="loud"}\nText\n::', { profile: 'page', components })
    expect(parsed.problems.join('\n')).toContain('Eigenschaft „type“ hat einen ungültigen Wert')
  })

  test.each(['info', 'lucide:flag'])('a callout accepts icon="%s"', async (icon) => {
    const parsed = await parseMarkdown(`::callout{icon="${icon}"}\nText\n::`, { profile: 'page', components })
    expect(parsed.problems).toEqual([])
  })

  test('a bare `active` marks the timeline item', async () => {
    const parsed = await parseMarkdown(components.timeline.editor.example, { profile: 'page', components })
    const html = await renderToString(createSSRApp({ render: () => h(GinkoMarkdown, { value: parsed.value, components: componentMap }) }))
    expect(html.match(/data-active/g)).toHaveLength(1)
    expect(html).toContain('class="ginko-timeline" role="list"')
    expect(html.match(/role="listitem"/g)?.length).toBe(html.match(/class="ginko-timeline-item"/g)?.length)
  })

  const render = async (markdown: string) => {
    const parsed = await parseMarkdown(markdown, { profile: 'page', components })
    expect(parsed.problems).toEqual([])
    return renderToString(createSSRApp({ render: () => h(GinkoMarkdown, { value: parsed.value, components: componentMap }) }))
  }

  // Labels without their icons, for readable assertions.
  const labels = (html: string) => [...html.matchAll(/class="ginko-code-label">(?:<svg[\s\S]*?<\/svg>)?([^<]*)</g)].map((m) => m[1])

  test('a code block has a copy button and a label: the filename, "Terminal" for shell code, else the language', async () => {
    const html = await render('```ts [app.ts]\nconst x = 1\n```\n\n```bash\nnpm i\n```\n\n```json\n{}\n```')
    expect(html.match(/<button type="button" class="ginko-code-copy" aria-label="Code kopieren"/g)).toHaveLength(3)
    expect(labels(html)).toEqual(['app.ts', 'Terminal', 'json'])
  })

  test('a code group shows the first block and hides the others', async () => {
    const html = await render(components['code-group'].editor.example)
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html.replace(/<svg[\s\S]*?<\/svg>/g, '')).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>npm</)
    expect(html.match(/role="tabpanel"[^>]*hidden/g)).toHaveLength(1)
    expect(html).toMatch(/role="tabpanel"[^>]*hidden[^>]*>[\s\S]*pnpm add/)
    // The group shows the tab labels, so the blocks inside carry no label of their own.
    expect(html).not.toContain('ginko-code-label')
  })

  test('code-tree: a folder per path part, the default file open', async () => {
    const html = await render(components['code-tree'].editor.example)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]*?app\.vue/)
    expect(html.match(/ginko-code-tree-panel[^>]*hidden/g)).toHaveLength(1)
  })

  test.each([['expandAll', 2], ['expandAll="false"', 1]])('code-tree{%s} opens %i folders', async (flag, open) => {
    const fence = (path: string) => `\`\`\`ts [${path}]\nx\n\`\`\`\n`
    const html = await render(`::code-tree{${flag}}\n${fence('a/one.ts')}${fence('b/two.ts')}::`)
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(open)
  })

  test('a video loads nothing from the provider before the click', async () => {
    const html = await render(components.video.editor.example)
    expect(html).not.toContain('<iframe')
    expect(html).not.toMatch(/youtube\.com|youtube-nocookie|youtu\.be|ytimg|vimeo\.com/i)
    expect(html).toContain('aria-label="Abspielen: Beispielvideo des YouTube-Players"')
    expect(html).toContain('Beim Abspielen lädt YouTube Inhalte und setzt ggf. Cookies.')
  })

  test('an embed loads nothing from the provider before the click', async () => {
    const html = await render(components.embedded.editor.example)
    expect(html).not.toContain('<iframe')
    expect(html).not.toMatch(/openstreetmap\.org|spotify|google\.com/i)
    expect(html).toContain('Inhalt laden: Karte von Berlin-Mitte')
    expect(html).toContain('Beim Laden lädt OpenStreetMap Inhalte und setzt ggf. Cookies.')
  })

  test('a video file is a native player; an unknown host is a plain link', async () => {
    const file = await render('::video{src="https://example.org/film.mp4" title="Film"}\n::')
    expect(file).toMatch(/<video class="ginko-video-file" controls preload="none"/)
    const other = await render('::video{src="https://example.org/clip" title="Clip"}\n::')
    expect(other).not.toContain('<iframe')
    expect(other).toContain('<a class="ginko-video-link" href="https://example.org/clip"')
  })

  test('an image is lazy and keeps the size from the tree', async () => {
    expect(await render('![Küche](/kueche.jpg)')).toMatch(/<img class="ginko-img" src="\/kueche.jpg" alt="Küche" loading="lazy" decoding="async">/)
    const sized = await renderToString(createSSRApp({ render: () => h(componentMap.img!, { src: '/a.jpg', alt: 'A', width: 800, height: 600 }) }))
    expect(sized).toContain('width="800" height="600" loading="lazy"')
  })

  test('a figure shows the image and the caption; zoom="false" has no dialog', async () => {
    const zoom = await render(components.figure.editor.example)
    expect(zoom).toContain('<dialog')
    expect(zoom).toContain('Das Zeichen von Ginko</figcaption>')
    expect(await render('::figure{src="/a.jpg" alt="A" zoom="false"}\n::')).not.toContain('<dialog')
  })

  test('a quiz question outside a quiz is a problem; an api-param outside an api too', async () => {
    const q = await parseMarkdown('::quiz-question{question="Frage?"}\n- [x] A\n- [ ] B\n::', { profile: 'page', components })
    expect(q.problems.join('\n')).toContain('darf nur in „quiz“ stehen')
    const p = await parseMarkdown('::api-param{name="id"}\n::', { profile: 'page', components })
    expect(p.problems.join('\n')).toContain('darf nur in „api“ stehen')
  })

  // A boolean prop reads the same everywhere: `prop="false"` is the prop absent when its default is off, and differs
  // from it when its default is on.
  const booleans = Object.entries(components).flatMap(([tag, def]) =>
    Object.entries(def.props ?? {}).filter(([, field]) => field.type === 'boolean').map(([prop, field]) => ({ tag, prop, defaultOn: field.default === true, example: def.editor!.example! })))
  // The example with the prop taken out of the opening line of the tag, and the same with `prop="false"` put in.
  const withFalse = ({ tag, prop, example }: (typeof booleans)[number]) => {
    const lines = example.split('\n')
    const at = lines.findIndex((l) => new RegExp(`^:+${tag}(?![\\w-])`).test(l))
    const bare = lines[at]!.replace(new RegExp(`\\s*\\b${prop}\\b(?:="[^"]*")?`), '').replace('{}', '')
    const flagged = bare.includes('{') ? bare.replace('}', ` ${prop}="false"}`).replace('{ ', '{') : bare.replace(tag, `${tag}{${prop}="false"}`)
    const build = (line: string) => lines.with(at, line).join('\n')
    return { absent: build(bare), off: build(flagged) }
  }

  test('api-param: a bare required shows the badge; :required="false" renders like absent', async () => {
    const row = (attrs: string) => render(`:::api\n::api-param{name="id" type="string"${attrs}}\n::\n:::`)
    const [bare, off, absent] = [await row(' required'), await row(' :required="false"'), await row('')]
    expect(bare).toContain('data-state="required"')
    expect(off).toBe(absent)
    expect(absent).not.toContain('data-state="required"')
  })

  test.each(booleans)('$tag{$prop="false"} is $prop absent (default on: $defaultOn)', async (entry) => {
    const text = (md: string) => (entry.tag === 'inline-toc' ? `## Überblick\n\n${md}` : md)
    const { absent, off } = withFalse(entry)
    const [a, b] = [await render(text(absent)), await render(text(off))]
    if (entry.defaultOn) expect(b).not.toBe(a)
    else expect(b).toBe(a)
  })

  test('api: a blank group is the default group, for the tab and for the row id', async () => {
    const html = await render('::api\n::api-param{name="id" group=" "}\n::\n::api-param{name="page"}\n::\n::')
    // One group, so no tabs; both rows get the id of the default group.
    expect(html.match(/id="api-[a-z]+-(id|page)"/g)).toEqual(['id="api-parameter-id"', 'id="api-parameter-page"'])
  })

  test('quiz: answers are radios or checkboxes in a fieldset with a legend; nothing is revealed before checking', async () => {
    const html = await render(components.quiz.editor.example)
    expect(html.match(/<fieldset/g)).toHaveLength(2)
    expect(html).toMatch(/<legend[^>]*>\s*Wann gießt man am besten\?/)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html.match(/type="checkbox"/g)).toHaveLength(3)
    expect(html).toContain('aria-live="polite"')
    // Questions after the first are hidden; the explanation, the result and the marks only come after a check.
    expect(html.match(/ginko-quiz-step" hidden/g)).toHaveLength(1)
    expect(html).not.toContain('Am Morgen verdunstet weniger Wasser.')
    expect(html).not.toMatch(/data-state="(correct|incorrect)"|ginko-quiz-mark/)
    expect(html).toContain('Frage 1 von 2')
    // The task list was read: both questions have a valid answer set (otherwise the problem text would show).
    expect(html).not.toContain('ginko-quiz-problem')
  })

  test('quiz: a question without a valid answer list shows a problem text instead of a broken form', async () => {
    const html = await render(':::quiz\n::quiz-question{question="Allein?"}\n- [x] Nur eine\n::\n:::')
    expect(html).toContain('Diese Frage braucht mindestens zwei Antworten.')
  })

  test('api: method, path, one tab per group, signature and badges from the props', async () => {
    const html = await render(components.api.editor.example)
    expect(html).toMatch(/ginko-api-method"[^>]*>GET</)
    expect(html).toContain('/v1/gaerten')
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html.match(/role="tabpanel"[^>]*hidden/g)).toHaveLength(1)
    expect(html).toContain('>: number = 20</span>')
    expect(html).toContain('id="api-query-limit"')
    expect(html).toContain('seit 1.2')
  })

  test('de.json and en.json have the same keys and parameters', () => {
    const flat = (tree: object, prefix = ''): Record<string, string> => Object.fromEntries(Object.entries(tree).flatMap(([k, v]) =>
      typeof v === 'string' ? [[prefix + k, (v.match(/\{\w+\}/g) ?? []).join()]] : Object.entries(flat(v, `${prefix}${k}.`))))
    expect(flat(en)).toEqual(flat(de))
  })

  test('files: a nested list makes folders', async () => {
    const html = await render(components.files.editor.example)
    for (const name of ['app', 'app.vue', 'components', 'Header.vue', 'nuxt.config.ts']) expect(html).toContain(`>${name}</span>`)
    expect(html.match(/ginko-files-list/g)).toHaveLength(3)
    expect(html.match(/data-active/g)).toHaveLength(1)
  })

  test('files: text after ` # ` is a note, not part of the name or the path', async () => {
    const html = await render('::files{active="app/app.config.ts"}\n- app\n  - app.config.ts # Name und Logo\n::')
    expect(html).toContain('>app.config.ts</span>')
    expect(html).toContain('class="ginko-files-note">Name und Logo</span>')
    expect(html.match(/data-active/g)).toHaveLength(1)
  })
})
