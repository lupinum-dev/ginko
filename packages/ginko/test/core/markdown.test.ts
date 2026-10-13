import { describe, expect, test } from 'vitest'
import { parseMarkdown, plainText, type MarkdownProfile } from '../../src/core/index.ts'

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
    [':badge[neu]{href="/ok"}', 'page', false],
    // style and id from the text (overlay, clash with Nuxt's own ids); parser-made ids and cell alignment stay.
    ['::div{style="position:fixed;inset:0"}\nx\n::', 'page', true],
    ['::div{#__NUXT_DATA__}\nx\n::', 'page', true],
    ['**x**{id="a"}', 'page', true],
    ['::div{.box}\nx\n::', 'page', false],
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
