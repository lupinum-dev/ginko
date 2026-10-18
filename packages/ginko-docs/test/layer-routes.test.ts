import { describe, expect, it } from 'vitest'
import { layerRoutes } from '../shared/layerRoutes'
import docsSite from '../../../sites/docs/ginko.config.ts'

// Wrong behaviour caught: a site that embeds the docs got a second blog and changelog at /blog and /changelog (fixed
// addresses), next to its own pages or posts elsewhere.
describe('layerRoutes', () => {
  it('standalone docs site: blog and changelog at the addresses its bricks and pages name', () => {
    expect(layerRoutes(docsSite as never, [])).toMatchObject({ docs: { base: '/docs' }, addresses: { blog: '/blog', changelog: '/changelog' }, blog: '/blog', changelog: '/changelog', noAddress: [] })
    expect(layerRoutes(docsSite as never, []).pages.map((p) => p.path)).toEqual(['/docs/:slug()', '/docs', '/', '/blog', '/blog/:slug()', '/changelog'])
  })

  it('saas-like site: its own pages at the brick routes get no layer page and no feed', () => {
    const site = {
      locales: ['en', 'de'],
      pages: { news: { en: '/blog', de: '/de/blog' }, changelog: { en: '/changelog', de: '/de/neuerungen' } },
      bricks: { docs: { route: { en: '/help/[slug]' } }, posts: { route: { en: '/blog/[slug]' } }, changelog: {} },
    }
    // `/news` is `/blog` through the page-paths module's meta, as it is on the final page list.
    // `home.vue` answers at `/` the same way, so the layer adds no start page either.
    const pages = [{ path: '/news', meta: { i18n: { paths: { en: '/blog', de: '/de/blog' } } } }, { path: '/news/:slug()' }, { path: '/changelog' }, { path: '/home', meta: { i18n: { paths: { en: '/' } } } }]
    expect(layerRoutes(site, pages)).toEqual({
      docs: { base: '/help' },
      addresses: { blog: '/blog', changelog: '/changelog' },
      pages: [{ name: 'docs-slug', path: '/help/:slug()', file: 'doc.vue' }, { name: 'docs', path: '/help', file: 'docs.vue' }],
      noAddress: [],
    })
  })

  it('posts at another route get the layer blog there, not at /blog', () => {
    const site = { locales: ['en'], bricks: { posts: { route: { en: '/news/[slug]' } } } }
    expect(layerRoutes(site, []).blog).toBe('/news')
  })

  it('a changelog brick without a route or pages.changelog gets no page and is reported', () => {
    const site = { locales: ['en'], bricks: { changelog: {} } }
    expect(layerRoutes(site, [])).toMatchObject({ addresses: {}, noAddress: ['changelog'] })
  })
})
