import { describe, expect, test } from 'vitest'
import { findEntryByPath, markdownRequestPath, prefersMarkdown, type Bundle } from '../../src/core/index.ts'

const bundle = {
  locale: 'de',
  bricks: {
    settings: { kind: 'single', data: {}, fallback: [] },
    docs: {
      kind: 'collection',
      items: [
        { id: 'home', data: {}, fallback: [], urls: { de: '/' } },
        { id: 'a', data: {}, fallback: [], urls: { de: '/docs/a', en: '/en/docs/a' } },
        { id: 'hidden', data: {}, fallback: [] },
      ],
    },
  },
} as unknown as Bundle

describe('findEntryByPath', () => {
  test.each([
    ['/docs/a', 'a'],
    ['/docs/a/', 'a'],
    ['/', 'home'],
    ['/en/docs/a', undefined], // the English URL belongs to the English bundle
    ['/docs/unknown', undefined],
    ['/docs', undefined],
  ])('%s is %s', (path, id) => {
    expect(findEntryByPath(bundle, path)?.item.id).toBe(id)
  })
})

describe('markdownRequestPath', () => {
  test.each([
    ['/docs/a.md', '/docs/a'],
    ['/index.md', '/'],
    ['/en/index.md', '/en/index'], // only the root index is special; an entry may be called index
    ['/.md', undefined],
    ['/docs/a/.md', undefined],
    ['/docs/a', undefined],
    ['/docs/a.mdx', undefined],
  ])('%s is %s', (path, page) => {
    expect(markdownRequestPath(path)).toBe(page)
  })
})

describe('prefersMarkdown', () => {
  test.each([
    ['text/markdown', true],
    ['text/markdown, text/html;q=0.9', true],
    ['text/html;q=1, text/markdown;q=0.9', false],
    ['text/html, text/markdown', false], // a tie goes to the first listed
    ['text/markdown, text/html', true],
    ['text/markdown, */*;q=0.1', true],
    ['text/markdown;q=0', false],
    ['text/markdown;q=0.5, text/*;q=0.8', false],
    ['*/*', false],
    ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', false],
    ['', false],
    [undefined, false],
  ])('%j is %s', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected)
  })
})
