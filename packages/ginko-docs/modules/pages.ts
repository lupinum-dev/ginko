// Registers the layer's pages and feeds from the site's Ginko config, so every address has one source (the bricks' routes)
// and a site that embeds the docs gets only the pages it has content for. A page the site defines itself wins.
import { addServerHandler, createResolver, defineNuxtModule, extendPages, useLogger } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'
import { layerRoutes, type SiteOptions } from '../shared/layerRoutes.ts'

// Typed here so the build can write its declaration without naming @nuxt/schema's internal path.
const docsPages: NuxtModule = defineNuxtModule({
  meta: { name: '@lupinum/ginko-docs/pages' },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const logger = useLogger('ginko-docs')
    // The site's ginko.config.ts, passed to the Ginko module as `ginko` in nuxt.config.ts.
    const site = (nuxt.options as { ginko?: SiteOptions }).ginko
    extendPages((pages) => {
      const r = layerRoutes(site, pages.map((p) => p.path))
      const taken = new Set(pages.map((p) => p.path))
      const add = (name: string, path: string, file: string) => pages.push({ name, path, file: resolve(`../app/docs-pages/${file}`) })
      for (const [name, path, file] of [['docs-slug', `${r.docs.base}/:slug()`, 'doc.vue'], ['docs', r.docs.base, 'docs.vue'], ['index', '/', 'index.vue']] as const)
        if (!taken.has(path)) add(name, path, file)
      if (r.blog) {
        add('blog', r.blog, 'blog.vue')
        add('blog-slug', `${r.blog}/:slug()`, 'post.vue')
        addServerHandler({ route: `${r.blog}/rss.xml`, method: 'get', handler: resolve('../server/feeds/blog.get') })
        addServerHandler({ route: `/:locale${r.blog}/rss.xml`, method: 'get', handler: resolve('../server/feeds/blog-locale.get') })
        // The list pages work without an entry in `pages`, but the sitemap and the static build only know pages listed there.
        if (!site?.pages?.blog) logger.warn(`The layer adds the blog at ${r.blog} but the site has no \`blog: blogPages({ locales })\` in \`pages\`: the blog list is missing from the sitemap and the static build.`)
      }
      if (r.changelog) {
        add('changelog', r.changelog, 'changelog.vue')
        if (!site?.pages?.changelog) logger.warn(`The layer adds the changelog at ${r.changelog} but the site has no \`changelog: changelogPages({ locales })\` in \`pages\`: it is missing from the sitemap and the static build.`)
      }
    })
  },
})

export default docsPages
