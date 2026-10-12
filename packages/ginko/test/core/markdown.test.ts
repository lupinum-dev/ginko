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
    ['[x](javascript:alert(1)){href="javascript:alert(1)"}', 'page', true],
    [':badge[neu]{href="/ok"}', 'page', false],
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
