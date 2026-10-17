import { describe, expect, it } from 'vitest'
import { feedRoutes } from '../../templates/_features/site/modules/feeds/routes.ts'

const pages = {
  home: { en: '/', de: '/de' },
  news: { en: '/news', de: '/de/neuigkeiten' },
  changelog: { en: '/changelog', de: '/de/neuerungen' },
}

describe('feedRoutes', () => {
  // Wrong behaviour caught: `nuxt generate` writes no feed (or only the main language's), because the crawler never
  // follows `.xml` links; or it lists a feed whose page the template removed, which fails the static build.
  it.each([
    ['blog and changelog, every language', ['news-feed.ts', 'changelog-feed.ts'], ['/news/rss.xml', '/de/neuigkeiten/rss.xml', '/changelog/rss.xml', '/de/neuerungen/rss.xml']],
    ['a feed without its page, and other middleware', ['jobs-feed.ts', 'redirects.ts'], []],
  ])('%s', (_name, middleware, expected) => {
    expect(feedRoutes(middleware, pages)).toEqual(expected)
  })
})
