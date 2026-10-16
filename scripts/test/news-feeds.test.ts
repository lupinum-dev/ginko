import { describe, expect, it } from 'vitest'
import { feedRoutes } from '../../templates/_features/blog/modules/news-feeds/routes.ts'

describe('feedRoutes', () => {
  // Wrong behaviour caught: a site built with `nuxt generate` has no feeds (the crawler skips .xml links), or a news
  // page at the root gives `//rss.xml`.
  it.each([
    ['a static build lists the feed of each language', { en: '/journal', de: '/de/journal' }, true, ['/journal/rss.xml', '/de/journal/rss.xml']],
    ['a news page at the root', { en: '/', de: '/de' }, true, ['/rss.xml', '/de/rss.xml']],
    ['a server build lists none', { en: '/journal' }, false, []],
    ['a site without a news page lists none', undefined, true, []],
  ])('%s', (_name, news, isStatic, expected) => {
    expect(feedRoutes(news, isStatic)).toEqual(expected)
  })
})
