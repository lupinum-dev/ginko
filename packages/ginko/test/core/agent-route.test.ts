import { describe, expect, test } from 'vitest'
import { findEntryByPath, markdownRequestPath, type Bundle } from '../../src/core/index.ts'

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
