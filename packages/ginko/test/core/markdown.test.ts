import { describe, expect, test } from 'vitest'
import { fileRefsIn, parseMarkdown, plainText, type MarkdownProfile } from '../../src/core/index.ts'

describe('parseMarkdown profiles', () => {
  // Each row: text, profile, does the profile refuse it.
  test.each<[string, MarkdownProfile, boolean]>([
    ['Hallo **fett** und [Link](https://example.com)', 'inline', false],
    ['Eins\n\nZwei', 'inline', true],
    ['## Titel\n\n- a\n- b\n\n> Zitat', 'basic', false],
    ['| a |\n|---|\n| 1 |', 'basic', true],
    ['| a |\n|---|\n| 1 |\n\n```ts\nconst a = 1\n```', 'rich', false],
    ['::callout\nHi\n::', 'rich', true],
    ['::callout\nHi\n::', 'page', false],
    ['::script\nalert(1)\n::', 'page', true],
    ['**fett**{onclick="alert(1)"}', 'page', true],
    // DOM sink props: Vue assigns `el.outerHTML = value`, which puts raw HTML on the page at the next patch.
    ['**x**{outerHTML="<img src=x onerror=alert(1)>"}', 'inline', true],
    ['**x**{:innerText="x"}', 'page', true],
    ['[x](javascript:alert(1)){href="javascript:alert(1)"}', 'page', true],
    // Without a registry a component takes the global attributes only (title, lang, dir, aria-*).
    [':badge[neu]{href="/ok"}', 'page', true],
    [':badge[neu]{title="Neu" lang="de" aria-label="Neu"}', 'page', false],
    // style and id from the text (overlay, clash with Nuxt's own ids); parser-made ids and cell alignment stay.
    ['::div{style="position:fixed;inset:0"}\nx\n::', 'page', true],
    ['::div{#__NUXT_DATA__}\nx\n::', 'page', true],
    ['**x**{id="a"}', 'page', true],
    // One allowlist (attributeProblem): what Markdown writes per tag, plus title, lang, dir and aria-*.
    ['**x**{hidden tabindex="0"}', 'page', true],
    ['**x**{title="t" lang="en" dir="ltr" aria-label="x"}', 'inline', false],
    // A class or data-* of the text's own takes a rule of the site's CSS: an invisible link over the whole page
    // (`.ginko-quiz-input` of ginko-components, a Vue scoped rule through `data-v-<hash>`, a Tailwind utility).
    ['Neu: [Angebot ansehen](https://evil.example/deal){.ginko-quiz-input}', 'inline', true],
    ['[Hier klicken](https://evil.example/login){.input data-v-0a1b2c3d}', 'basic', true],
    ['**x**{data-x="1"}', 'inline', true],
    ['::div{.box}\nx\n::', 'page', true],
    ['- [ ] offen{.fixed}', 'basic', true],
    ['```mermaid {.fixed .inset-0}\ngraph TD; A-->B\n```', 'rich', true],
    ['[x](/a){target="_blank" rel="noopener noreferrer"}', 'inline', false],
    ['[x](/a){target="_top"}', 'inline', true],
    ['[x](https://example.com){target="_blank" rel="opener"}', 'inline', true],
    ['![x](/a.png){width="100" height="50" srcset="/a-640.webp 640w, /a.png 1280w" sizes="100vw"}', 'rich', false],
    ['![x](/a.png){srcset="/a.webp 640w, javascript:alert(1) 2x"}', 'rich', true],
    // A bound value must be JSON (comark looks anything else up in its render data); a bound address never passes.
    ['- [x] erledigt', 'basic', false],
    ['1. [ ] offen\n2. [x] erledigt', 'basic', false],
    ['**x**{:title="frontmatter.title"}', 'page', true],
    ["[x](/a){:href='\"/b\"'}", 'page', true],
    ['| a |\n|---|\n| 1 |\n\n**x**{style="text-align:left"}', 'rich', true],
    // `as` makes comark's renderer mount another component; only the alert plugin's own `as` stays.
    ['Hi **x**{as="embed" src="https://www.youtube.com/watch?v=abc"}', 'page', true],
    ['Hi **x**{as="embed" src="https://www.youtube.com/watch?v=abc"}', 'rich', true],
    ['> [!TIP]\n> Hinweis', 'basic', false],
    ['## Titel {#eigene-id}', 'page', false],
    ['| a | b |\n|:--|--:|\n| 1 | 2 |', 'page', false],
    ['Text[^1]\n\n[^1]: Fußnote', 'basic', false],
    ['Text[^1]\n\n[^1]: Fußnote', 'inline', true],
    ['Formel $x^2$', 'rich', false],
    ['Formel $x^2$', 'basic', true],
    ['$$\nE=mc^2\n$$', 'page', false],
    ['```mermaid\ngraph TD; A-->B\n```', 'rich', false],
    ['```mermaid\ngraph TD; A-->B\n```', 'basic', true],
    ['Super :tada:', 'inline', false],
  ])('%j as %s refused: %s', async (text, profile, refused) => {
    const { problems } = await parseMarkdown(text, { profile })
    expect(problems.length > 0).toBe(refused)
  })

  test('the problem names the attribute, and a registry prop of that name is kept', async () => {
    const refused = await parseMarkdown('::div{style="color:red"}\nx\n::', { profile: 'page' })
    expect(refused.problems).toEqual(['Die Eigenschaft „style“ ist nicht erlaubt.'])
    const components = { box: { kind: 'block', label: 'Box', describe: 'Box', props: { id: { type: 'text', optional: true } } } } as never
    const kept = await parseMarkdown('::box{id="a"}\nx\n::', { profile: 'page', components })
    expect(kept.problems).toEqual([])
  })

  test('an emoji shortcode becomes the character', async () => {
    const { value } = await parseMarkdown('Super :tada:', { profile: 'inline' })
    expect(plainText(value)).toBe('Super 🎉')
  })

  test('the text before <!-- more --> is the summary, and the marker is gone', async () => {
    const withMarker = await parseMarkdown('Anriss **fett**\n\n<!-- more -->\n\nRest', { profile: 'basic' })
    expect(withMarker.value.summary).toEqual([['p', {}, 'Anriss ', ['strong', {}, 'fett']]])
    expect(plainText(withMarker.value)).toBe('Anriss fett\nRest')
    const without = await parseMarkdown('Anriss\n\nRest', { profile: 'basic' })
    expect('summary' in without.value).toBe(false)
  })

  test('plainText leaves out code blocks', async () => {
    const { value } = await parseMarkdown('Vorher\n\n```ts\nconst a = 1\n```\n\nNachher', { profile: 'rich' })
    expect(plainText(value)).toBe('Vorher\nNachher')
  })

  // Wrong behaviour caught: a reference definition became a nameless `component` node, so the text was refused with
  // "Komponente „component“ gibt es nicht", also when it defined a picture of the Files library.
  test('reference links and images resolve, and their definitions leave the tree', async () => {
    const text = 'Siehe die [Anleitung][g].\n\n![Logo][l]\n\n[g]: https://example.com/guide\n[l]: $file.k57logo'
    const { value, problems } = await parseMarkdown(text, { profile: 'rich' })
    expect(problems).toEqual([])
    expect(value.nodes).toEqual([
      ['p', {}, 'Siehe die ', ['a', { href: 'https://example.com/guide' }, 'Anleitung'], '.'],
      ['p', {}, ['img', { src: '$file.k57logo', alt: 'Logo' }]],
    ])
    expect(fileRefsIn(text)).toEqual(new Set(['k57logo']))
  })

  // Wrong behaviour caught: `<!-- TODO -->` was shown on the site as a paragraph of text, also when it held
  // formatting or commented out whole paragraphs.
  test.each([
    ['a comment in a line, one alone and one in code', 'Text <!-- TODO --> mehr\n\n<!--\nnur für uns\n-->\n\n`<!-- Code -->`', [['p', {}, 'Text mehr'], ['p', {}, ['code', {}, '<!-- Code -->']]]],
    ['formatting inside a comment', 'Text <!-- TODO: **fix** this --> weiter', [['p', {}, 'Text weiter']]],
    ['a commented-out section of two paragraphs', 'Eins\n\n<!--\nAlt\n\nAuch alt\n-->\n\nZwei', [['p', {}, 'Eins'], ['p', {}, 'Zwei']]],
  ])('HTML comments are notes in the stored text, the tree leaves them out: %s', async (_name, text, nodes) => {
    const { value, body } = await parseMarkdown(text, { profile: 'rich' })
    expect(value.nodes).toEqual(nodes)
    expect(body).toBe(text)
  })

  test('raw HTML stays text, so it never becomes an element', async () => {
    const { value, problems } = await parseMarkdown('<script>alert(1)</script>', { profile: 'page' })
    expect(problems).toEqual([])
    expect(value.nodes).toEqual([['p', {}, '<script>alert(1)</script>']])
  })

  test('a field value has no frontmatter: --- is a divider, not metadata', async () => {
    const field = await parseMarkdown('---\ntitle: x\n---\nText')
    expect(field.frontmatter).toEqual({})
    const file = await parseMarkdown('---\ntitle: x\n---\nText', { frontmatter: true })
    expect(file.frontmatter).toEqual({ title: 'x' })
    expect(plainText(file.value)).toBe('Text')
    expect(file.body).toBe('Text')
  })
})

describe('fileRefsIn', () => {
  // Wrong behaviour caught: a `$file.<id>` in code counted as a picture: another site's ID in a code example blocked
  // the save, and an own file named only in inline code could not go to the trash.
  test.each([
    ['fenced code', '```md\n![Doku]($file.fremd)\n```', []],
    ['a tilde fence with a longer close', '~~~\n![Doku]($file.fremd)\n~~~~', []],
    ['inline code', 'So geht es: `![x]($file.k57a)`', []],
    ['a picture after inline code', '`Code` und ![Hund]($file.k57a)', ['k57a']],
    ['an escaped backtick is no code', 'Geht\\`s gut? ![x]($file.k57a) Ja, geht\\`s.', ['k57a']],
    ['a picture after a closed fence', '```\nx\n```\n\n![Hund]($file.k57a)', ['k57a']],
    ['the YAML props block of a component', '::figure\n```yaml [props]\nsrc: $file.k57a\n```\n::', ['k57a']],
  ])('%s', (_name, text, ids) => {
    expect([...fileRefsIn(text)]).toEqual(ids)
  })
})
