import { addComponent, addComponentsDir, addImports, addNitroPlugin, addPlugin, addServerHandler, addServerImports, addServerTemplate, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, extendPages, installModule, tryResolveModule } from '@nuxt/kit'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, join, relative, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Nuxt } from 'nuxt/schema'
import { appSchema, componentsForMarkdown } from './app-schema.ts'
import { fileLinkIssues } from './external-links.ts'
import { checkI18nOptions } from './i18n.ts'
import { listsNuxtSeo, nuxtSeoDependencies, runsNuxtSeo } from './nuxt-seo.ts'
import { unservedPaths } from './pages.ts'
import { prerenderRoutes } from './prerender.ts'
import { ginkoRouteRules, ginkoVercelConfig } from './route-rules.ts'
import { restartOnConfigChange } from './watch.ts'
import { checkSite, siteForContent, coreMessage, entryRedirects, fileMarkdownRef, redirectProblems, serializeSchema, withMarkdownRefs, type Bundle, type Locale, type MarkdownTree, type Schema, type SiteInput } from '../core/index.ts'

// Runtime files are .ts in the workspace and .mjs in the published build (dist/nuxt/runtime), so the extension follows this file's own.
const runtimeExt = import.meta.url.endsWith('.mjs') ? 'mjs' : 'ts'

declare module '@nuxt/schema' {
  interface NuxtHooks {
    /**
     * Internal, for @lupinum/ginko-docs: called once before the file bundles are built. `keepSource: true` keeps each
     * file entry's repository path (`source`) in the served bundle, for an "Edit this page" link.
     */
    'ginko:files': (options: { keepSource: boolean }) => void | Promise<void>
  }
}

/**
 * `@lupinum/ginko/nuxt` (SPEC part 8). The site passes its `defineSite` result:
 *
 *   import ginko from './ginko.config.ts'
 *   export default defineNuxtConfig({ modules: ['@lupinum/ginko/nuxt'], ginko })
 *
 * The platform origin comes from `NUXT_PUBLIC_GINKO_PLATFORM` (default in dev: http://localhost:3100).
 */
export default defineNuxtModule<SiteInput>({
  meta: { name: '@lupinum/ginko', configKey: 'ginko', compatibility: { nuxt: '^4.6.0 || ^5.0.0-0' } },
  // The site's data for the Nuxt SEO modules it installs (nuxt-seo.ts). Read from nuxt.config, before setup runs.
  moduleDependencies: (nuxt) => nuxtSeoDependencies((nuxt.options as unknown as { ginko?: SiteInput }).ginko, nuxt),
  async setup(options, nuxt) {
    if (!options?.site || !options.bricks) throw new Error('[ginko] Option `ginko` is missing: the result of defineSite() from ginko.config.ts.')
    const site: SiteInput = siteForContent(options, process.env.GINKO_CONTENT)
    // The serialized schema is the site's own contract: checked at build (the same check as `ginko check`), used at runtime for defaults.
    const schema = serializeSchema(site)
    const problems = checkSite(site, schema)
    if (problems.length) throw new Error(`[ginko] ginko.config.ts is invalid:\n- ${problems.join('\n- ')}`)
    // Dev: a saved ginko.config.ts restarts the dev server when it passes the checks above, and reports its error when it
    // does not (watch.ts). Texts in i18n/*.json reload by themselves (ginko-i18n).
    if (nuxt.options.dev) restartOnConfigChange(nuxt, nuxt.options.rootDir)
    const sources = {
      platform: Object.values(schema.bricks).some((b) => b.source !== 'files'),
      files: Object.values(schema.bricks).some((b) => b.source === 'files'),
    }

    const { resolve } = createResolver(import.meta.url)
    // Object.assign, not `public.ginko =`: Nuxt types `public` from each site's own values, so a site's
    // `seo` would narrow the type this module must write (a site with `seo.description` makes it required).
    Object.assign(nuxt.options.runtimeConfig.public, { ginko: {
      site: schema.site,
      name: site.name,
      // The site's production address, for absolute links such as hreflang alternates and canonical URLs.
      url: schema.url,
      platform: nuxt.options.dev ? 'http://localhost:3100' : '',
      locales: schema.locales,
      mainLocale: schema.locales[0]!,
      timeZone: schema.timeZone,
      // ISO country code or ''; the hours rules of the basics take it as `country`, JSON-LD as `addressCountry`.
      country: site.country ?? '',
      // The resolved holiday calendar (`schema.holidays`) or '': `custom` means the site passes its own `calendar`.
      holidays: schema.holidays ?? '',
      seo: site.seo ?? {},
      agents: site.agents ?? {},
      sources,
      noindex: false,
    } })
    // Languages come from ginko.config: ginko-i18n owns URLs, hreflang, canonical and the site's own texts
    // (i18n/<code>.json). The other `i18n` options in nuxt.config pass through; the ones Ginko sets fail.
    // `i18n` is typed only where ginko-i18n's module types are loaded (a site), so it is read as unknown here.
    checkI18nOptions((nuxt.options as { i18n?: unknown }).i18n)
    // Resolved from this package, not the site: with pnpm a site does not see @lupinum/ginko's own dependencies.
    const i18n = await tryResolveModule('@lupinum/ginko-i18n', import.meta.url)
    const locales = schema.locales.map((code) => ({ code, language: site.languages?.[code] ?? code }))
    await installModule(i18n ?? '@lupinum/ginko-i18n', { locales, defaultLocale: schema.locales[0], baseUrl: schema.url, timeZone: schema.timeZone })
    // The server routes (sitemap hreflang, redirects, Markdown) read the config ginko-i18n resolved, with
    // its strategy, exclude and userLocale, so they never disagree with the module's own routes.
    addServerTemplate({ filename: '#ginko/locales', getContents: () => `export { config as default } from '#ginko-i18n/config.mjs'` })
    // Redirect rules of the site config (patterns); entries add theirs from `redirectFrom` in the middleware.
    const redirects = site.redirects ?? []
    const redirectIssues = redirectProblems(redirects)
    if (redirectIssues.length) {
      const report = `[ginko] Invalid redirects in ginko.config.ts:\n- ${redirectIssues.join('\n- ')}`
      if (!nuxt.options.dev) throw new Error(report)
      console.warn(report)
    }
    addServerTemplate({ filename: '#ginko/redirects', getContents: () => `export default ${JSON.stringify(redirects)}` })
    addServerHandler({ middleware: true, handler: resolve(`./runtime/server/redirects.${runtimeExt}`) })
    // Private runtime config (not `public`): `NUXT_GINKO_REVALIDATE_TOKEN` fills it at runtime. The server sends it as
    // `x-ginko-site-token`, so the platform does not count the site's own fetches against the visitor rate limit.
    nuxt.options.runtimeConfig.ginkoRevalidateToken ??= ''
    nuxt.options.nitro.vercel = ginkoVercelConfig(nuxt.options.nitro.vercel, process.env.NUXT_GINKO_REVALIDATE_TOKEN)

    // No _payload.json on client navigation: Nuxt turns it on for every ISR route, and fetching it
    // renders the target on the server, which loads the production bundle. Pages read the bundle
    // already in the browser instead, so the preview never reaches production (SPEC 8).
    nuxt.options.experimental.payloadExtraction = false
    // The rule type is Nitro's in a site and a fallback without `headers` here, so the result is cast back to it.
    nuxt.options.routeRules = ginkoRouteRules(nuxt.options.routeRules ?? {}) as typeof nuxt.options.routeRules

    // Generated share cards (nuxt-og-image): only with that module installed and one renderer for it. `#ginko/og`
    // is the one place that reaches nuxt-og-image, so a site without it never imports it.
    const ogImage = await listsNuxtSeo('nuxt-og-image', nuxt)
    const renderer = ogImage ? await ogRenderer(nuxt.options.rootDir) : undefined
    if (renderer) {
      // nuxt-og-image picks the renderer from the file name and finds templates in `components/OgImage` (also in listed component dirs).
      // Not in buildDir: Nuxt empties that after the modules ran (like the image cache of file bricks below). Not under `.cache` either: Nuxt ignores that folder name when it scans components.
      const ogDir = join(nuxt.options.rootDir, 'node_modules', '.ginko-og', 'components')
      mkdirSync(join(ogDir, 'OgImage'), { recursive: true })
      copyFileSync(resolve(`./runtime/og/GinkoCard.vue`), join(ogDir, 'OgImage', `GinkoCard.${renderer}.vue`))
      // nuxt-og-image registers `components/OgImage` of each layer itself, which this directory is not: register it as it does (island component).
      addComponentsDir({ path: join(ogDir, 'OgImage'), island: true })
      // nuxt-og-image signs the card URLs a server renders with NUXT_APP_SECRET and answers 500 without it. A static
      // build draws every card at build time and needs none. create-ginko writes one into the new site's `.env`.
      const secret = process.env.NUXT_APP_SECRET || (nuxt.options.runtimeConfig as { appSecret?: string }).appSecret
      if (!nuxt.options.dev && !nuxt.options.nitro.static && !secret) {
        console.warn('[ginko] Share cards need NUXT_APP_SECRET (at least 32 characters) where the site runs, or they answer with 500. Create one with `npx nuxt-og-image generate-secret` and set it in the host\'s environment.')
      }
    } else if (ogImage) {
      console.warn('[ginko] nuxt-og-image has no renderer: install @takumi-rs/core (or satori with @resvg/resvg-js) to get generated share cards.')
    }
    const ogContents = renderer
      ? `import { defineOgImage } from '#imports'\nexport { defineOgImage }\nexport const ogTemplate = 'GinkoCard'`
      : 'export const defineOgImage = undefined\nexport const ogTemplate = undefined'
    addTemplate({ filename: 'ginko/og.mjs', getContents: () => ogContents })
    nuxt.options.alias['#ginko/og'] = resolve(nuxt.options.buildDir, 'ginko/og.mjs')
    // JSON-LD: with nuxt-schema-org, `useGinkoSeo` adds its nodes to that module's graph. The one place that reaches it;
    // the template is written after `modules:done`, when every module is known.
    addTemplate({ filename: 'ginko/schema-org.mjs', getContents: () => (runsNuxtSeo('nuxt-schema-org', nuxt) ? `export { useSchemaOrg } from '#imports'` : 'export const useSchemaOrg = undefined') })
    nuxt.options.alias['#ginko/schema-org'] = resolve(nuxt.options.buildDir, 'ginko/schema-org.mjs')
    // The app's copy leaves out the editors' texts (app-schema.ts): it is part of every page's script.
    addTemplate({ filename: 'ginko/schema.mjs', getContents: () => `export default ${JSON.stringify(appSchema(schema))}` })
    nuxt.options.alias['#ginko/schema'] = resolve(nuxt.options.buildDir, 'ginko/schema.mjs')
    // The Markdown renderer's registry (props and their types) is its own module: only a page that renders Markdown loads it.
    addTemplate({ filename: 'ginko/components.mjs', getContents: () => `export default ${JSON.stringify(componentsForMarkdown(schema))}` })
    nuxt.options.alias['#ginko/components'] = resolve(nuxt.options.buildDir, 'ginko/components.mjs')
    // The server build does not see the alias above: the sitemap route imports the schema as a Nitro virtual module.
    addServerTemplate({ filename: '#ginko/schema', getContents: () => `export default ${JSON.stringify(schema)}` })
    // Types: useGinko() knows the bricks of this site's config (convention: <rootDir>/ginko.config.ts).
    const composables = resolve(`./runtime/composables.${runtimeExt}`)
    // The `#ginko/*` virtual modules' types, for the app and the server (layer code such as ginko-docs imports them).
    addTypeTemplate({ filename: 'types/ginko-virtual.d.ts', getContents: () => `/// <reference path=${JSON.stringify(resolve('./runtime/schema.d.ts'))} />\nexport {}` }, { nuxt: true, nitro: true })
    addTypeTemplate({
      filename: 'types/ginko.d.ts',
      getContents: () => [
        `declare module ${JSON.stringify(composables)} { interface GinkoRegister { site: typeof import(${JSON.stringify(resolve(nuxt.options.rootDir, 'ginko.config'))}).default } }`,
        'export {}',
      ].join('\n'),
    })

    addServerHandler({ middleware: true, handler: resolve(`./runtime/server/headers.${runtimeExt}`) })
    // Preview hosts are not indexable for the Nuxt SEO modules either; a no-op without nuxt-site-config.
    const siteConfigPlugin = resolve(`./runtime/server/site-config.${runtimeExt}`)
    addNitroPlugin({ nitro2: siteConfigPlugin, nitro3: siteConfigPlugin })
    // Decided when every module is installed, also those another module brings (nuxt-ai-ready brings @nuxtjs/sitemap).
    nuxt.hook('modules:done', () => {
      // robots.txt: the site's own public/robots.txt or @nuxtjs/robots wins. Preview hosts get Disallow (robots.ts) and X-Robots-Tag (headers.ts).
      if (!existsSync(join(nuxt.options.rootDir, 'public', 'robots.txt')) && !runsNuxtSeo('@nuxtjs/robots', nuxt)) addServerHandler({ route: '/robots.txt', handler: resolve(`./runtime/server/robots.${runtimeExt}`) })
      // With @nuxtjs/sitemap, that module owns /sitemap.xml and reads Ginko's URLs from /__ginko/sitemap.json (a source, see nuxt-seo.ts).
      if (runsNuxtSeo('@nuxtjs/sitemap', nuxt)) addServerHandler({ route: '/__ginko/sitemap.json', handler: resolve(`./runtime/server/sitemap-source.${runtimeExt}`) })
      else addServerHandler({ route: '/sitemap.xml', handler: resolve(`./runtime/server/sitemap.${runtimeExt}`) })
    })
    // Text for AI agents: /llms.txt (the site's own public/llms.txt wins) and one middleware for `<page>.md`, Accept negotiation and the Link header.
    if (site.agents?.enabled !== false) {
      if (!existsSync(join(nuxt.options.rootDir, 'public', 'llms.txt'))) addServerHandler({ route: '/llms.txt', handler: resolve(`./runtime/server/llms.${runtimeExt}`) })
      if (!existsSync(join(nuxt.options.rootDir, 'public', 'llms-full.txt'))) addServerHandler({ route: '/llms-full.txt', handler: resolve(`./runtime/server/llms-full.${runtimeExt}`) })
      addServerHandler({ middleware: true, handler: resolve(`./runtime/server/markdown.${runtimeExt}`) })
    }
    if (sources.files) await useFiles(schema, site, nuxt)
    // The sitemap route imports the file bundles and the docs layer's MCP route the search index; a site without file
    // bricks has neither.
    else {
      addServerTemplate({ filename: '#ginko/files', getContents: () => 'export default {}' })
      addServerTemplate({ filename: '#ginko/files-md', getContents: () => 'export default {}' })
      addServerTemplate({ filename: '#ginko/search', getContents: () => 'export default {}' })
    }
    // ginko-i18n (installed above) localizes the pages first, so every locale's path is in the list here.
    nuxt.hook('pages:resolved', (pages) => { for (const warning of unservedPaths(schema, pages)) console.warn(`[ginko] ${warning}`) })
    addPlugin(resolve(`./runtime/plugin.${runtimeExt}`))
    addPlugin({ src: resolve(`./runtime/today.client.${runtimeExt}`), mode: 'client' })
    // The preview shows drafts from the platform; a site whose bricks all come from files has nothing to preview.
    if (sources.platform) {
      extendPages((pages) => { pages.push({ name: 'ginko-preview', path: '/__ginko/preview', file: resolve('./runtime/preview.vue') }) })
      // Page state holds platform texts as `{ ref }` (runtime/plugin.ts); this route serves them on client navigation.
      addServerHandler({ route: '/__ginko/platform/:locale/:rev/md/**', handler: resolve(`./runtime/server/platform-md.${runtimeExt}`) })
    }
    for (const name of ['useGinko', 'useGinkoEntry', 'useGinkoQuery', 'useGinkoNeighbors', 'useGinkoNav', 'useGinkoBreadcrumbs', 'useGinkoToday', 'useGinkoWeek', 'useGinkoLocale', 'useGinkoSeo', 'useGinkoPath', 'useGinkoLang', 'useGinkoSite']) addImports({ name, from: composables })
    for (const name of ['GinkoItem', 'GinkoPageKey', 'GinkoLocale', 'GinkoSeoInput']) addImports({ name, from: composables, type: true })
    addComponent({ name: 'GinkoMarkdown', export: 'GinkoMarkdown', filePath: resolve(`./runtime/GinkoMarkdown.${runtimeExt}`) })
    addComponent({ name: 'GinkoImage', export: 'GinkoImage', filePath: resolve(`./runtime/GinkoImage.${runtimeExt}`) })
    for (const name of ['useGinkoMarkdown', 'fetchGinkoMarkdown']) addImports({ name, from: resolve(`./runtime/markdown.${runtimeExt}`) })
    // Server routes of the site (a feed, a calendar) read entries with the same visibility rule as the pages.
    addServerImports([{ name: 'getGinkoItems', from: resolve(`./runtime/server/items.${runtimeExt}`) }, { name: 'GinkoServerItem', from: resolve(`./runtime/server/items.${runtimeExt}`), type: true }])
  },
})

/**
 * File bricks (CONTENT.md): @lupinum/ginko-content builds a bundle per locale from content/ and
 * public/, served by /__ginko/files/<locale>.json. A file error fails the build; in dev it is logged and
 * the file left out, and every change under content/ rebuilds the bundles.
 */
async function useFiles(schema: Schema, site: SiteInput, nuxt: Nuxt) {
  const { rootDir } = nuxt.options
  // ESM resolution from the site: the published package exports only `import` paths.
  const siteUrl = pathToFileURL(join(rootDir, 'package.json')).href
  const entry = await tryResolveModule('@lupinum/ginko-content', siteUrl)
  if (!entry) throw new Error('[ginko] Bricks with source: \'files\' need @lupinum/ginko-content. Fix: pnpm add @lupinum/ginko-content')
  const content: typeof import('@lupinum/ginko-content') = await import(pathToFileURL(entry).href)
  const contentDir = join(rootDir, 'content')
  const publicDir = join(rootDir, 'public')
  let bundles: Partial<Record<Locale, Bundle>> = {}
  // Markdown trees by the path that serves them; the bundles carry only `{ ref }` (CONTENT.md, Phase 14).
  let trees = new Map<string, MarkdownTree>()
  // The search index per locale, from the bundles above (CONTENT.md, Phase 14).
  let searches: Partial<Record<Locale, Awaited<ReturnType<typeof content.searchIndex>>>> = {}
  // Images next to content files, copied under their content hash and served at /_ginko/img/ for a year (CONTENT.md "Bilder").
  const imageDir = join(rootDir, 'node_modules', '.cache', 'ginko-img') // not in buildDir: Nuxt empties that after the modules ran
  let images = new Map<string, string>()
  // The folder is a cache: variants (WebP) are named by content hash, so existing ones are kept and only stale files are removed.
  const writeImages = (variantFiles: Set<string>) => {
    mkdirSync(imageDir, { recursive: true })
    const keep = new Set(variantFiles)
    for (const [url, path] of images) {
      keep.add(basename(url))
      if (!existsSync(join(imageDir, basename(url)))) copyFileSync(path, join(imageDir, basename(url)))
    }
    for (const name of readdirSync(imageDir)) if (!keep.has(name)) rmSync(join(imageDir, name), { force: true })
  }
  ;(nuxt.options.nitro.publicAssets ??= []).push({ dir: imageDir, baseURL: '/_ginko/img', maxAge: 60 * 60 * 24 * 365 })
  // Internal hook: the docs layer (@lupinum/ginko-docs) sets `keepSource`, so its pages can link to the file in the repository.
  const fileOptions = { keepSource: false }
  await nuxt.callHook('ginko:files', fileOptions)
  const build = async () => {
    const result = await content.buildFileBundles({ contentDir, publicDir, schema, drafts: nuxt.options.dev, imageDir })
    const report = result.errors.map((e) => `- ${content.errorLine(e)}`).join('\n')
    if (result.errors.length && !nuxt.options.dev) throw new Error(`[ginko] Errors in content/:\n${report}`)
    if (result.errors.length) console.error(`[ginko] Errors in content/ (these files are missing from the site):\n${report}`)
    // Link check (CONTENT.md): errors fail the build, warnings are printed. External links (opt-in) ask other servers,
    // so only on build / generate, never in dev.
    const links = await fileLinkIssues({ bundles: Object.values(result.bundles) as Bundle[], schema, site, publicDir, root: nuxt.options.rootDir, log: console.log, external: !nuxt.options.dev })
    const linkReport = links.map((i) => `- ${i.locale}/${i.id} (${i.field}): ${coreMessage('en', i.key, i.params)}`).join('\n')
    if (links.some((i) => i.severity === 'error') && !nuxt.options.dev) throw new Error(`[ginko] Broken links:\n${linkReport}`)
    if (links.length) console.warn(`[ginko] Link check:\n${linkReport}`)
    images = result.images
    writeImages(result.imageFiles)
    trees = new Map()
    // What is served to everyone: no expired entries, no repo paths (kept only for the docs layer's "Edit this page" link).
    const now = new Date()
    bundles = Object.fromEntries(Object.entries(result.bundles).map(([locale, bundle]) => [locale, withMarkdownRefs(content.publicBundle(bundle!, schema, now, fileOptions), schema, trees, (brick, id, field) => fileMarkdownRef(locale, brick, id, field))]))
    searches = Object.fromEntries(await Promise.all(Object.entries(bundles).map(async ([locale, bundle]) => [locale, await content.searchIndex(bundle!, trees, schema)])))
  }
  await build()
  // A static host has no server: when every brick is a file brick the site can be prerendered, so the redirects are also route rules (exact paths only; patterns need the middleware).
  if (Object.values(schema.bricks).every((b) => b.source === 'files')) {
    const routeRules = (nuxt.options.routeRules ??= {})
    const exact = [...(site.redirects ?? []).filter((r) => !/[:*]/.test(r.from)), ...(Object.values(bundles) as Bundle[]).flatMap(entryRedirects)]
    for (const { from, to, status } of exact) routeRules[from] ??= { redirect: { to, statusCode: status ?? 301 } }
  }
  const { resolve } = createResolver(import.meta.url)
  // `nuxt generate` (it sets nitro.static) for Git-only sites (SPEC "Statische Seite"): prerender every page, document and JSON route into .output/public.
  // After `modules:done`, like the routes they prerender (module.ts).
  if (Object.values(schema.bricks).every((b) => b.source === 'files') && nuxt.options.nitro.static) nuxt.hook('modules:done', () => {
    const served = {
      robots: !existsSync(join(publicDir, 'robots.txt')) && !runsNuxtSeo('@nuxtjs/robots', nuxt),
      sitemap: !runsNuxtSeo('@nuxtjs/sitemap', nuxt),
      llms: site.agents?.enabled !== false && !existsSync(join(publicDir, 'llms.txt')),
      llmsFull: site.agents?.enabled !== false && !existsSync(join(publicDir, 'llms-full.txt')),
      markdown: site.agents?.enabled !== false,
    }
    nuxt.options.nitro.prerender = {
      ...nuxt.options.nitro.prerender,
      crawlLinks: true,
      failOnError: true,
      routes: [...(nuxt.options.nitro.prerender?.routes ?? []), ...prerenderRoutes(schema, bundles, trees.keys(), served)],
    }
  })
  addServerTemplate({ filename: '#ginko/files', getContents: () => `export default ${JSON.stringify(bundles)}` })
  addServerTemplate({ filename: '#ginko/files-md', getContents: () => `export default ${JSON.stringify(Object.fromEntries(trees))}` })
  addServerTemplate({ filename: '#ginko/search', getContents: () => `export default ${JSON.stringify(searches)}` })
  addServerHandler({ route: '/__ginko/files/:locale', handler: resolve(`./runtime/server/files.${runtimeExt}`) })
  addServerHandler({ route: '/__ginko/files/:locale/md/**', handler: resolve(`./runtime/server/files-md.${runtimeExt}`) })
  addServerHandler({ route: '/__ginko/search/:file', handler: resolve(`./runtime/server/search.${runtimeExt}`) })
  if (!nuxt.options.dev) return
  let reload: (() => Promise<void>) | undefined
  nuxt.hook('nitro:init', (nitro) => { reload = () => nitro.hooks.callHook('rollup:reload') })
  nuxt.hook('builder:watch', async (_event, path) => {
    if (relative(contentDir, resolvePath(rootDir, path)).startsWith('..')) return
    await build()
    await reload?.()
  })
}


/** The installed renderer of nuxt-og-image, resolved from the site (Takumi first, as the module recommends). */
async function ogRenderer(rootDir: string): Promise<'takumi' | 'satori' | undefined> {
  const has = async (name: string) => (await tryResolveModule(name, rootDir)) !== undefined
  if (await has('@takumi-rs/core') || await has('@takumi-rs/wasm')) return 'takumi'
  if (await has('satori')) return 'satori'
  return undefined
}
