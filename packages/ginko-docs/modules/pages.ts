// Registers the layer's pages and feeds from the site's Ginko config, so every address has one source (the bricks' routes)
// and a site that embeds the docs gets only the pages it has content for. A page the site defines itself wins.
import { addServerHandler, createResolver, defineNuxtModule, extendPages, useLogger } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'
import { BLOG_PATH, CHANGELOG_PATH } from '../shared/paths.ts'

interface SiteOptions { locales?: readonly string[], pages?: Record<string, unknown>, bricks?: Record<string, { route?: Record<string, string> }> }

// Typed here so the build can write its declaration without naming @nuxt/schema's internal path.
const docsPages: NuxtModule = defineNuxtModule({
  meta: { name: '@lupinum/ginko-docs/pages' },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    // The site's ginko.config.ts, passed to the Ginko module as `ginko` in nuxt.config.ts.
    const site = (nuxt.options as { ginko?: SiteOptions }).ginko
    const bricks = site?.bricks ?? {}
    const main = site?.locales?.[0] ?? ''
    // docsCollection writes `<base>/[slug]` for the main language; other languages get a prefix from ginko-i18n.
    const base = bricks.docs?.route?.[main]?.replace(/\/\[slug\]$/, '') ?? '/docs'

    extendPages((pages) => {
      const taken = new Set(pages.map((p) => p.path))
      const add = (name: string, path: string, file: string) => {
        if (!taken.has(path)) pages.push({ name, path, file: resolve(`../app/docs-pages/${file}`) })
      }
      add('docs-slug', `${base}/:slug()`, 'doc.vue')
      add('docs', base, 'docs.vue')
      add('index', '/', 'index.vue')
      if (bricks.posts) {
        add('blog', BLOG_PATH, 'blog.vue')
        add('blog-slug', `${BLOG_PATH}/:slug()`, 'post.vue')
      }
      if (bricks.changelog) add('changelog', CHANGELOG_PATH, 'changelog.vue')
    })

    if (bricks.posts) {
      addServerHandler({ route: `${BLOG_PATH}/rss.xml`, method: 'get', handler: resolve('../server/feeds/blog.get') })
      addServerHandler({ route: `/:locale${BLOG_PATH}/rss.xml`, method: 'get', handler: resolve('../server/feeds/blog-locale.get') })
    }

    // The list pages work without an entry in `pages`, but the sitemap and the static build only know pages listed there.
    const logger = useLogger('ginko-docs')
    if (bricks.posts && !site?.pages?.blog) logger.warn('The site has a blog but no `blog: blogPages({ locales })` in `pages`: the blog list is missing from the sitemap and the static build.')
    if (bricks.changelog && !site?.pages?.changelog) logger.warn('The site has a changelog but no `changelog: changelogPages({ locales })` in `pages`: it is missing from the sitemap and the static build.')
  },
})

export default docsPages
