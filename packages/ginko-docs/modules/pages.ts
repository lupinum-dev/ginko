// Registers the layer's pages and feeds from the site's Ginko config, so every address has one source (the bricks' routes)
// and a site that embeds the docs gets only the pages it has content for. A page the site defines itself wins.
import { addServerHandler, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'
import { layerRoutes, type SiteOptions } from '../shared/layerRoutes.ts'

export interface DocsModuleOptions {
  /** The key of the docs brick in ginko.config.ts (`bricks: { wissen: docsCollection(...) }`). Default `docs`. */
  brick: string
}

// Typed here so the build can write its declaration without naming @nuxt/schema's internal path.
const docsPages: NuxtModule<DocsModuleOptions> = defineNuxtModule<DocsModuleOptions>({
  meta: { name: '@lupinum/ginko-docs/pages', configKey: 'ginkoDocs' },
  defaults: { brick: 'docs' },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const logger = useLogger('ginko-docs')
    // The site's ginko.config.ts, passed to the Ginko module as `ginko` in nuxt.config.ts.
    const site = (nuxt.options as { ginko?: SiteOptions }).ginko
    // The addresses follow from the site config alone, so they are set here, before Nuxt writes the runtime config.
    // The app links to them, whoever serves the page (the layer or the site's own page).
    const { brick } = options
    const { addresses } = layerRoutes(site, [], brick)
    nuxt.options.runtimeConfig.public.ginkoDocs = { brick, blog: addresses.blog ?? '', changelog: addresses.changelog ?? '' }
    const docs = site?.bricks?.[brick]
    if (site?.bricks && !docs) logger.warn(`ginko.config.ts has no brick \`${brick}\`, so the docs are empty. Fix: name the docs brick \`${brick}\`, or set \`ginkoDocs: { brick: '<key>' }\` in nuxt.config.ts.`)
    // docsCollection's "Parent page" field points at its own brick, so both must know the key.
    const parent = docs?.fields?.parent?.to
    if (parent && parent !== brick) logger.warn(`The docs brick \`${brick}\` has a "Parent page" field that points at \`${parent}\`. Fix: \`docsCollection({ brick: '${brick}', ... })\`.`)
    let announced = false
    // `pages:resolved`, not `pages:extend`: it runs after every `pages:extend` hook (the templates' page-paths module has
    // given each page its address by then), so "the site has a page there" is decided on the final list. Dev runs it on
    // every page change; the pages are added each time, the feed handlers and warnings once.
    nuxt.hook('pages:resolved', (pages) => {
      const r = layerRoutes(site, pages, brick)
      for (const page of r.pages) pages.push({ ...page, file: resolve(`../app/docs-pages/${page.file}`) })
      if (announced) return
      announced = true
      if (r.blog) {
        addServerHandler({ route: `${r.blog}/rss.xml`, method: 'get', handler: resolve('../server/feeds/blog.get') })
        addServerHandler({ route: `/:locale${r.blog}/rss.xml`, method: 'get', handler: resolve('../server/feeds/blog-locale.get') })
        // The list pages work without an entry in `pages`, but the sitemap and the static build only know pages listed there.
        if (!site?.pages?.blog) logger.warn(`The layer adds the blog at ${r.blog} but the site has no \`blog: blogPages({ locales })\` in \`pages\`: the blog list is missing from the sitemap and the static build.`)
      }
      if (r.changelog && !site?.pages?.changelog) logger.warn(`The layer adds the changelog at ${r.changelog} but the site has no \`changelog: changelogPages({ locales })\` in \`pages\`: it is missing from the sitemap and the static build.`)
      for (const brick of r.noAddress)
        logger.warn(brick === 'changelog'
          ? 'The changelog brick has no address: give it a `route` or add `changelog: changelogPages({ locales })` to `pages`. No changelog page is added.'
          : 'The posts brick has no `route` for the main language, so the layer adds no blog page.')
    })
  },
})

export default docsPages
