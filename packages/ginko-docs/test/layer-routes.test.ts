import { describe, expect, it } from 'vitest'
import { layerRoutes } from '../shared/layerRoutes'
import docsSite from '../../../sites/docs/ginko.config.ts'

// Wrong behaviour caught: a site that embeds the docs got a second blog and changelog at /blog and /changelog (fixed
// addresses), next to its own pages or posts elsewhere.
describe('layerRoutes', () => {
  it('standalone docs site: blog and changelog at the addresses its bricks and pages name', () => {
    expect(layerRoutes(docsSite as never, [])).toEqual({ docs: { base: '/docs' }, blog: '/blog', changelog: '/changelog', skipped: [] })
  })

  it('saas-like site: its own pages at the brick routes get no layer page and no feed', () => {
    const site = {
      locales: ['en', 'de'],
      pages: { news: { en: '/blog', de: '/de/blog' }, changelog: { en: '/changelog', de: '/de/neuerungen' } },
      bricks: { docs: { route: { en: '/help/[slug]' } }, posts: { route: { en: '/blog/[slug]' } }, changelog: {} },
    }
    expect(layerRoutes(site, ['/news', '/news/:slug()', '/changelog'])).toEqual({
      docs: { base: '/help' },
      skipped: ['posts: the site has a page at /blog', 'changelog: the site has a page at /changelog'],
    })
  })

  it('posts at another route get the layer blog there, not at /blog', () => {
    const site = { locales: ['en'], bricks: { posts: { route: { en: '/news/[slug]' } } } }
    expect(layerRoutes(site, []).blog).toBe('/news')
  })
})
