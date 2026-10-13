import { resolveConfig } from '@lupinum/ginko-i18n/core'
import { addComponent, addComponentsDir, addImports, addPlugin, addServerHandler, addServerTemplate, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, extendPages, hasNuxtModule, installModule, tryResolveModule } from '@nuxt/kit'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, join, relative, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Nuxt } from 'nuxt/schema'
import { checkExternalLinks } from './external-links.ts'
import { unservedPaths } from './pages.ts'
import { prerenderRoutes } from './prerender.ts'
import { configFilesToWatch } from './watch.ts'
import { checkLinks, checkSite, coreMessage, entryRedirects, redirectProblems, serializeSchema, type Bundle, type Locale, type MarkdownTree, type Schema, type SiteInput } from '../core/index.ts'

// Runtime files are .ts in the workspace and .mjs in the published build (dist/nuxt/runtime), so the extension follows this file's own.
const runtimeExt = import.meta.url.endsWith('.mjs') ? 'mjs' : 'ts'

/**
 * `@lupinum/ginko/nuxt` (SPEC part 8). The site passes its `defineSite` result:
 *
 *   import ginko from './ginko.config'
 *   export default defineNuxtConfig({ modules: ['@lupinum/ginko/nuxt'], ginko })
 *
 * The platform origin comes from `NUXT_PUBLIC_GINKO_PLATFORM` (default in dev: http://localhost:3100).
 */
export default defineNuxtModule<SiteInput>({
  meta: { name: '@lupinum/ginko', configKey: 'ginko', compatibility: { nuxt: '^4.6.0' } },
  async setup(site, nuxt) {
    if (!site?.site || !site.bricks) throw new Error('[ginko] Option `ginko` is missing: the result of defineSite() from ginko.config.ts.')
    // The serialized schema is the site's own contract: checked at build, used at runtime for defaults.
    const schema = serializeSchema(site)
    const problems = checkSite(site, schema)
    if (problems.length) throw new Error(`[ginko] ginko.config.ts is invalid:\n- ${problems.join('\n- ')}`)

    const { resolve } = createResolver(import.meta.url)
    // Dev: a change to ginko.config.ts restarts the dev server (see watch.ts). Texts in i18n/*.json reload by themselves (ginko-i18n).
    if (nuxt.options.dev) nuxt.options.watch.push(...configFilesToWatch(nuxt.options.rootDir))
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
      timezone: schema.timezone,
      seo: site.seo ?? {},
      agents: site.agents ?? {},
      sources: {
        platform: Object.values(schema.bricks).some((b) => b.source !== 'files'),
        files: Object.values(schema.bricks).some((b) => b.source === 'files'),
      },
    } })
    // Languages come from ginko.config: ginko-i18n owns URLs, hreflang, canonical and the site's own texts
    // (i18n/<locale>.json). Other `i18n` options in nuxt.config (params, exclude) pass through.
    // Resolved from this package, not the site: with pnpm a site does not see @lupinum/ginko's own dependencies.
    const i18n = await tryResolveModule('@lupinum/ginko-i18n', import.meta.url)
    const locales = schema.locales.map((code) => ({ code, language: site.languages?.[code] ?? code }))
    await installModule(i18n ?? '@lupinum/ginko-i18n', { locales, defaultLocale: schema.locales[0], baseUrl: schema.url, timeZone: schema.timezone })
    // The same pure resolution ginko-i18n runs on these options, for the server routes (sitemap hreflang).
    const resolved = resolveConfig({ locales, defaultLocale: schema.locales[0] })
    addServerTemplate({ filename: '#ginko/locales', getContents: () => `export default ${JSON.stringify(resolved)}` })
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
    // Only the bypass token makes Vercel regenerate a page on demand (SPEC 4.4).
    nuxt.options.nitro.vercel = { ...nuxt.options.nitro.vercel, config: { ...nuxt.options.nitro.vercel?.config, bypassToken: process.env.NUXT_GINKO_REVALIDATE_TOKEN } }

    // ISR for every page; queries share one cache entry so a refresh reaches them (ISR spike, question 5).
    // The preview is never cached: the exact path and its children need their own rules (ISR spike).
    // No _payload.json on client navigation: Nuxt turns it on for every ISR route, and fetching it
    // renders the target on the server, which loads the production bundle. Pages read the bundle
    // already in the browser instead, so the preview never reaches production (SPEC 8).
    nuxt.options.experimental.payloadExtraction = false
    const rules = (nuxt.options.routeRules ??= {})
    rules['/**'] = { ...rules['/**'], isr: { expiration: 60, allowQuery: [] } }
    // A site's own server routes pick their language from a header or cookie (ginko-i18n), so they are not cached.
    rules['/api/**'] = { isr: false, ...rules['/api/**'] }
    for (const path of ['/__ginko', '/__ginko/**']) {
      rules[path] = { ...rules[path], isr: false, headers: { ...rules[path]?.headers, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } }
    }

    // Generated share cards (nuxt-og-image): only with that module installed and one renderer for it. `#ginko/og`
    // is the one place that reaches nuxt-og-image, so a site without it never imports it.
    const renderer = (await hasNuxtModule('nuxt-og-image', nuxt)) ? await ogRenderer(nuxt.options.rootDir) : undefined
    if (renderer) {
      // nuxt-og-image picks the renderer from the file name and finds templates in `components/OgImage` (also in listed component dirs).
      // Not in buildDir: Nuxt empties that after the modules ran (like the image cache of file bricks below). Not under `.cache` either: Nuxt ignores that folder name when it scans components.
      const ogDir = join(nuxt.options.rootDir, 'node_modules', '.ginko-og', 'components')
      mkdirSync(join(ogDir, 'OgImage'), { recursive: true })
      copyFileSync(resolve(`./runtime/og/GinkoCard.vue`), join(ogDir, 'OgImage', `GinkoCard.${renderer}.vue`))
      // nuxt-og-image registers `components/OgImage` of each layer itself, which this directory is not: register it as it does (island component).
      addComponentsDir({ path: join(ogDir, 'OgImage'), island: true })
      // Card URLs are absolute: nuxt-og-image reads the site URL from `site.url` (nuxt-site-config). The site's own setting wins.
      // `site` is typed by nuxt-site-config only when it is installed, so it is read as unknown here.
      const options = nuxt.options as { site?: unknown }
      const own = typeof options.site === 'object' && options.site !== null ? options.site as { url?: string } : {}
      options.site = { ...own, url: own.url ?? schema.url }
    } else if (await hasNuxtModule('nuxt-og-image', nuxt)) {
      console.warn('[ginko] nuxt-og-image has no renderer: install @takumi-rs/core (or satori with @resvg/resvg-js) to get generated share cards.')
    }
    const ogContents = renderer
      ? `import { defineOgImage } from '#imports'\nexport { defineOgImage }\nexport const ogTemplate = 'GinkoCard'`
      : 'export const defineOgImage = undefined\nexport const ogTemplate = undefined'
    addTemplate({ filename: 'ginko/og.mjs', getContents: () => ogContents })
    nuxt.options.alias['#ginko/og'] = resolve(nuxt.options.buildDir, 'ginko/og.mjs')
    addTemplate({ filename: 'ginko/schema.mjs', getContents: () => `export default ${JSON.stringify(schema)}` })
    nuxt.options.alias['#ginko/schema'] = resolve(nuxt.options.buildDir, 'ginko/schema.mjs')
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
    // robots.txt: the site's own public/robots.txt wins. Preview hosts get Disallow (robots.ts) and X-Robots-Tag (headers.ts).
    if (!existsSync(join(nuxt.options.rootDir, 'public', 'robots.txt'))) addServerHandler({ route: '/robots.txt', handler: resolve(`./runtime/server/robots.${runtimeExt}`) })
    // With @nuxtjs/sitemap installed, that module owns /sitemap.xml; ginko-i18n gives it the hreflang alternates.
    if (!(await hasNuxtModule('@nuxtjs/sitemap', nuxt))) addServerHandler({ route: '/sitemap.xml', handler: resolve(`./runtime/server/sitemap.${runtimeExt}`) })
    // Text for AI agents: /llms.txt (the site's own public/llms.txt wins) and one middleware for `<page>.md`, Accept negotiation and the Link header.
    if (site.agents?.enabled !== false) {
      if (!existsSync(join(nuxt.options.rootDir, 'public', 'llms.txt'))) addServerHandler({ route: '/llms.txt', handler: resolve(`./runtime/server/llms.${runtimeExt}`) })
      if (!existsSync(join(nuxt.options.rootDir, 'public', 'llms-full.txt'))) addServerHandler({ route: '/llms-full.txt', handler: resolve(`./runtime/server/llms-full.${runtimeExt}`) })
      addServerHandler({ middleware: true, handler: resolve(`./runtime/server/markdown.${runtimeExt}`) })
    }
    if (Object.values(schema.bricks).some((b) => b.source === 'files')) await useFiles(schema, site, nuxt)
    // The sitemap route imports the file bundles; a site without file bricks has none.
    else {
      addServerTemplate({ filename: '#ginko/files', getContents: () => 'export default {}' })
      addServerTemplate({ filename: '#ginko/files-md', getContents: () => 'export default {}' })
    }
    // ginko-i18n (installed above) localizes the pages first, so every locale's path is in the list here.
    nuxt.hook('pages:resolved', (pages) => { for (const warning of unservedPaths(schema, pages)) console.warn(`[ginko] ${warning}`) })
    addPlugin(resolve(`./runtime/plugin.${runtimeExt}`))
    addPlugin({ src: resolve(`./runtime/today.client.${runtimeExt}`), mode: 'client' })
    extendPages((pages) => { pages.push({ name: 'ginko-preview', path: '/__ginko/preview', file: resolve('./runtime/preview.vue') }) })
    for (const name of ['useGinko', 'useGinkoEntry', 'useGinkoQuery', 'useGinkoNeighbors', 'useGinkoNav', 'useGinkoBreadcrumbs', 'useGinkoToday', 'useGinkoWeek', 'useGinkoLocale', 'useGinkoSeo', 'useGinkoPath', 'ginkoLangOf', 'ginkoSafeHref', 'isGinkoVisible']) addImports({ name, from: composables })
    for (const name of ['GinkoItem', 'GinkoPageKey', 'GinkoLocale', 'GinkoSeoInput']) addImports({ name, from: composables, type: true })
    addComponent({ name: 'GinkoMarkdown', export: 'GinkoMarkdown', filePath: resolve(`./runtime/GinkoMarkdown.${runtimeExt}`) })
    addComponent({ name: 'GinkoImage', export: 'GinkoImage', filePath: resolve(`./runtime/GinkoImage.${runtimeExt}`) })
    for (const name of ['useGinkoMarkdown', 'fetchGinkoMarkdown']) addImports({ name, from: resolve(`./runtime/markdown.${runtimeExt}`) })
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
  // Markdown trees by the path that serves them; the bundles carry only `{ ref, toc }` (CONTENT.md, Phase 14).
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
  // The docs layer (@lupinum/ginko-docs) sets `appConfig.docs.editLinks`: its pages link to the file in the repository.
  const editLinks = (nuxt.options.appConfig as { docs?: { editLinks?: boolean } }).docs?.editLinks === true
  const build = async () => {
    const result = await content.buildFileBundles({ contentDir, publicDir, schema, drafts: nuxt.options.dev, imageDir })
    const report = result.errors.map((e) => `- ${content.errorLine(e)}`).join('\n')
    if (result.errors.length && !nuxt.options.dev) throw new Error(`[ginko] Errors in content/:\n${report}`)
    if (result.errors.length) console.error(`[ginko] Errors in content/ (these files are missing from the site):\n${report}`)
    // Link check (CONTENT.md): errors fail the build, warnings are printed. Paths of platform bricks are not known here, so unknown paths are checked only for sites with file bricks alone.
    const onlyFiles = Object.values(schema.bricks).every((b) => b.source === 'files')
    const links = checkLinks(Object.values(result.bundles) as Bundle[], schema, { linkCheck: site.linkCheck, redirects: site.redirects, files: onlyFiles ? (path) => existsSync(join(publicDir, path)) : undefined })
    // Opt-in (`linkCheck.external`): asks the servers of outside links, so only on build / generate, never in dev.
    if (!nuxt.options.dev) links.push(...await checkExternalLinks(Object.values(result.bundles) as Bundle[], { linkCheck: site.linkCheck, root: nuxt.options.rootDir, log: console.log }))
    const linkReport = links.map((i) => `- ${i.locale}/${i.id} (${i.field}): ${coreMessage('en', i.key, i.params)}`).join('\n')
    if (links.some((i) => i.severity === 'error') && !nuxt.options.dev) throw new Error(`[ginko] Broken links:\n${linkReport}`)
    if (links.length) console.warn(`[ginko] Link check:\n${linkReport}`)
    images = result.images
    writeImages(result.imageFiles)
    trees = new Map()
    // What is served to everyone: no expired entries, no repo paths (kept only for the docs layer's "Edit this page" link).
    const now = new Date()
    bundles = Object.fromEntries(Object.entries(result.bundles).map(([locale, bundle]) => [locale, content.withMarkdownRefs(content.publicBundle(bundle!, schema, now, { keepSource: editLinks }), schema, trees)]))
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
  if (Object.values(schema.bricks).every((b) => b.source === 'files') && nuxt.options.nitro.static) {
    const served = {
      robots: !existsSync(join(publicDir, 'robots.txt')),
      sitemap: !(await hasNuxtModule('@nuxtjs/sitemap', nuxt)),
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
  }
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
