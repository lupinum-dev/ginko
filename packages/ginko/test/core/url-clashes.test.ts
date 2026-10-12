import { describe, expect, it } from 'vitest'
import { blockedSlugs, urlClashes } from '../../src/core/index.ts'

describe('urlClashes', () => {
  it('finds a clash between entries of different bricks, per locale only', () => {
    expect(urlClashes([
      { id: 'pages/a', urls: { de: '/intro', en: '/en/intro' } },
      { id: 'docs/b', urls: { de: '/intro', en: '/en/other' } },
      { id: 'docs/c', urls: { de: '/c' } },
    ])).toEqual([{ url: '/intro', locale: 'de', first: 'pages/a', second: 'docs/b' }])
  })
})

describe('blockedSlugs', () => {
  const route = { de: '/[slug]' }
  const schema = {
    locales: ['de'],
    pages: { home: { de: '/' }, about: { de: '/ueber' }, deep: { de: '/a/b' }, blog: { de: '/news/post' } },
    bricks: {
      people: { kind: 'collection', route },
      news: { kind: 'collection', route: { de: '/news/[slug]' } },
      docs: { kind: 'collection', route: { de: '/[slug]/doc' } },
      old: { kind: 'collection', route: { de: '/old-[slug]' }, retired: true },
      cfg: { kind: 'single' },
    },
  } as never
  it.each([
    ['people', { news: ['x'], docs: ['faq'], old: ['y'] }, ['ueber', 'a/b', 'news/post', 'news/x', 'faq/doc']],
    ['news', { people: ['news-1'], docs: ['faq'] }, ['post']],
    ['docs', { people: ['faq'], news: ['n'] }, []],
    ['cfg', { people: ['a'] }, []],
  ])('%s: blocks %j', (brick, taken, expected) => {
    expect([...blockedSlugs(schema, brick, 'de', taken)].sort()).toEqual([...expected].sort())
  })
})
