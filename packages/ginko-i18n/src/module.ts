import { existsSync, mkdirSync, readdirSync, readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import { addComponent, addImports, addPlugin, addServerHandler, addServerImports, addNitroPlugin, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, updateTemplates } from '@nuxt/kit'
import type { NuxtPage } from '@nuxt/schema'
import { cachedNegotiatedPaths } from './cache-rules.ts'
import { MANIFEST_VERSION, type Manifest, type ManifestSource } from './manifest.ts'
import { compileTree, mergeTrees, sourceProblem, type RawTree } from './core/compiler.ts'
import { inUserZone, isExcluded, localizePath, resolveConfig, type LocaleConfig, type LocaleInput, type Strategy } from './core/locales.ts'
import type { Params } from './core/messages.ts'

export type { Alternate, AlternatesResolver, I18n, ServerI18n, TypedTranslator } from './runtime/types'

export interface ModuleOptions {
  locales: (string | LocaleInput)[]
  /** The URL code of the default locale (`'de'`, not `'de-AT'`). Default: the first locale. */
  defaultLocale?: string
  strategy?: Strategy
  /** Head tags: html lang/dir, canonical, hreflang + x-default, og:locale. */
  seo?: boolean
  /** Absolute site URL for canonical and hreflang. */
  baseUrl?: string
  /** Parameters every message can use, e.g. `{ tone: 'sie' }`. */
  params?: Params
  /** Extra unprefixed paths: exact (`/studio`) or a prefix (`/admin/**`). `/api/**` and Nuxt internals are always excluded. */
  exclude?: string[]
  /** Paths whose locale comes from the user (cookie, then Accept-Language), not the URL: `['/app/**']`. Same syntax as `exclude`. */
  userLocale?: string[]
  /** IANA time zone of the site, e.g. `Europe/Vienna`, for timestamps. Calendar dates stay UTC. Default `UTC`. */
  timeZone?: string
}

export interface PageI18n {
  /** Path per locale code. Locales not listed keep the file path. */
  paths?: Record<string, string>
  /** Limit the page to these locale codes. */
  locales?: string[]
}

/** A library's messages: `dir` holds `<code>.json` files, read under the key `namespace` (required). */
export interface MessageSource { namespace: string, dir: string }

declare module '@nuxt/schema' {
  interface NuxtHooks {
    /** Libraries add their default messages here. Host app and layers override them per key. */
    'ginko-i18n:sources': (sources: MessageSource[]) => void | Promise<void>
  }
}

const KNOWN = new Set(['locales', 'defaultLocale', 'strategy', 'seo', 'baseUrl', 'params', 'exclude', 'userLocale', 'timeZone'])

function readDir(dir: string): Record<string, RawTree> {
  const out: Record<string, RawTree> = {}
  if (!existsSync(dir)) return out
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const code = file.slice(0, -5)
    try {
      out[code] = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    }
    catch (error) {
      // eslint-disable-next-line preserve-caught-error -- the message carries the file name and the parser text; the cause adds nothing
      throw new Error(`[ginko-i18n] ${join(dir, file)} is not valid JSON: ${(error as Error).message}`)
    }
  }
  return out
}

function localizePages(pages: NuxtPage[], config: LocaleConfig): NuxtPage[] {
  const codes = config.locales.map(l => l.code)
  const suffix = (page: NuxtPage, code: string): NuxtPage => ({
    ...page,
    name: page.name ? `${page.name}__${code}` : undefined,
    children: page.children?.map(child => suffix(child, code)),
  })
  const out: NuxtPage[] = []
  for (const page of pages) {
    const options = page.meta?.i18n as PageI18n | false | undefined
    if (options === false || isExcluded(page.path, config) || inUserZone(page.path, config)) {
      out.push(page)
      continue
    }
    for (const code of options?.locales ?? codes) {
      if (!codes.includes(code))
        throw new Error(`[ginko-i18n] ${page.file} lists locale "${code}" in definePageMeta, but it is not in i18n.locales.`)
      const path = options?.paths?.[code] ?? page.path
      out.push({
        ...suffix(page, code),
        path: localizePath(path, code, config),
        meta: { ...page.meta, i18nBase: page.name, i18nLocale: code },
      })
    }
  }
  return out
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@lupinum/ginko-i18n', configKey: 'i18n', compatibility: { nuxt: '>=4.6.0' } },
  defaults: { locales: [], seo: true, params: {} },
  async setup(options, nuxt) {
    const unknown = Object.keys(options).filter(k => !KNOWN.has(k))
    if (unknown.length)
      throw new Error(`[ginko-i18n] Unknown option(s) i18n.${unknown.join(', i18n.')}. Fix: remove them; ginko-i18n is not @nuxtjs/i18n.`)
    if (hasNuxtModule('@nuxtjs/i18n', nuxt))
      throw new Error('[ginko-i18n] @nuxtjs/i18n is also installed. Fix: remove one; two modules cannot both own the locale.')

    // Nuxt layers concatenate arrays, so a site that repeats a layer's locales gets each one twice.
    // Keep the first (the app's) and drop exact repeats; a real URL-code clash still fails below.
    const seen = new Set<string>()
    options.locales = options.locales.filter((l) => {
      const id = typeof l === 'string' ? l : `${l.language}|${l.code ?? ''}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    const config = resolveConfig(options)
    const { resolve } = createResolver(import.meta.url)
    const runtime = resolve('./runtime')
    const baseUrl = (options.baseUrl ?? (nuxt.options.runtimeConfig.public as { siteUrl?: string }).siteUrl ?? '').replace(/\/$/, '')
    if (options.seo && !baseUrl && !nuxt.options.dev)
      console.warn('[ginko-i18n] No baseUrl: canonical and hreflang will use relative URLs. Fix: set i18n.baseUrl.')

    // Messages: library sources first, then layers from the deepest to the app, so the app wins per key.
    const collectSources = async (): Promise<ManifestSource[]> => {
      const sources: ManifestSource[] = []
      const libraries: MessageSource[] = []
      await nuxt.callHook('ginko-i18n:sources', libraries)
      for (const lib of libraries) {
        const problem = sourceProblem(lib)
        if (problem) throw new Error(problem)
        sources.push({ ...lib, origin: 'library' })
      }
      const layers = [...nuxt.options._layers].reverse()
      layers.forEach((layer, index) => sources.push({ dir: join(layer.config.rootDir, 'i18n'), origin: index === layers.length - 1 ? 'app' : 'layer' }))
      return sources
    }
    const loadMessages = (sources: ManifestSource[]) => {
      const raw: Record<string, RawTree[]> = {}
      for (const source of sources) {
        for (const [code, tree] of Object.entries(readDir(source.dir))) {
          if (!config.locales.some(l => l.code === code)) continue
          ;(raw[code] ??= []).push(source.namespace ? { [source.namespace]: tree } : tree)
        }
      }
      const fallback = mergeTrees(...(raw[config.defaultLocale] ?? []))
      const fallbackKeys: Record<string, string[]> = {}
      const compiledTrees = Object.fromEntries(config.locales.map((l) => {
        if (l.code === config.defaultLocale) return [l.code, compileTree(fallback).tree]
        const own = mergeTrees(...(raw[l.code] ?? []))
        const ownKeys = new Set(Object.keys(compileTree(own).params))
        fallbackKeys[l.code] = Object.keys(compileTree(fallback).params).filter(k => !ownKeys.has(k))
        // The default locale fills gaps, so a missing key shows default text, not the raw key.
        return [l.code, compileTree(mergeTrees(fallback, own)).tree]
      }))
      const compiledFallback = compileTree(fallback)
      return { compiled: compiledTrees, fallbackKeys, defaultParams: compiledFallback.params, defaultNumeric: compiledFallback.numeric }
    }
    const report = (fallbackKeys: Record<string, string[]>) => {
      for (const [code, keys] of Object.entries(fallbackKeys)) {
        if (!keys.length) continue
        console.warn(`[ginko-i18n] ${code}: ${keys.length} message(s) missing, showing ${config.defaultLocale} text instead: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}. Fix: run \`ginko-i18n check\`.`)
      }
    }
    // Read sources after all modules ran: a library registered after this module would be missed otherwise.
    let sources: ManifestSource[] = []
    let state = loadMessages([])
    nuxt.hook('modules:done', async () => {
      sources = await collectSources()
      state = loadMessages(sources)
      report(state.fallbackKeys)
    })

    // Own alias: Nuxt forbids `#build` imports in server code, and both sides need these templates.
    const templateDir = join(nuxt.options.buildDir, 'ginko-i18n')
    nuxt.options.alias['#ginko-i18n'] = templateDir
    // Nuxt writes the `#ginko-i18n/*` tsconfig path only for an existing folder; a fresh checkout has none yet.
    mkdirSync(templateDir, { recursive: true })
    nuxt.hook('nitro:config', (nitro) => {
      nitro.alias = { ...nitro.alias, '#ginko-i18n': templateDir }
    })

    const timeZone = options.timeZone ?? 'UTC'
    try {
      new Intl.DateTimeFormat('en', { timeZone })
    }
    catch {
      throw new Error(`[ginko-i18n] Unknown time zone "${timeZone}" in i18n.timeZone. Fix: use an IANA name such as "Europe/Vienna".`)
    }

    const base = nuxt.options.app.baseURL.replace(/\/$/, '')
    const runtimeConfig = { ...config, seo: options.seo !== false, baseUrl, base, params: options.params ?? {}, timeZone }
    addTemplate({ filename: 'ginko-i18n/config.mjs', write: true, getContents: () => `export const config = ${JSON.stringify(runtimeConfig)}\n` })
    // Declarations for the templates above and below, so runtime code imports them fully typed.
    const runtimeTypes = JSON.stringify(join(runtime, 'types'))
    const coreTypes = JSON.stringify('@lupinum/ginko-i18n/core')
    const declarations: Record<string, string> = {
      'config': `import type { RuntimeConfig } from ${runtimeTypes}\nexport declare const config: RuntimeConfig\n`,
      'loaders': `import type { MessageTree } from ${coreTypes}\nexport declare const loaders: Record<string, () => Promise<MessageTree>>\n`,
      'messages-server': `import type { MessageTree } from ${coreTypes}\nexport declare const messages: Record<string, MessageTree>\n`,
      'sitemap': `export declare const entries: Record<string, string>[]\n`,
    }
    for (const [name, contents] of Object.entries(declarations))
      addTemplate({ filename: `ginko-i18n/${name}.d.mts`, write: true, getContents: () => contents })
    for (const l of config.locales) {
      addTemplate({
        filename: `ginko-i18n/messages/${l.code}.mjs`,
        write: true,
        getContents: () => `export default ${JSON.stringify(state.compiled[l.code])}\n`,
      })
    }
    addTemplate({
      filename: 'ginko-i18n/loaders.mjs',
      write: true,
      getContents: () => `export const loaders = {\n${config.locales.map(l => `  ${JSON.stringify(l.code)}: () => import('./messages/${l.code}.mjs').then(m => m.default),`).join('\n')}\n}\n`,
    })
    addTemplate({
      filename: 'ginko-i18n/messages-server.mjs',
      write: true,
      getContents: () => config.locales.map((l, i) => `import m${i} from './messages/${l.code}.mjs'`).join('\n')
        + `\nexport const messages = { ${config.locales.map((l, i) => `${JSON.stringify(l.code)}: m${i}`).join(', ')} }\n`,
    })

    // Typed keys: every default-locale key with its required parameter names (global params excluded).
    addTypeTemplate({
      filename: 'types/ginko-i18n.d.ts',
      getContents: () => {
        const global = new Set(Object.keys(options.params ?? {}))
        const entries = Object.entries(state.defaultParams).map(([key, params]) => {
          const required = params.filter(p => !global.has(p))
          const numeric = new Set(state.defaultNumeric[key] ?? [])
          const fields = required.map(p => `${JSON.stringify(p)}: ${numeric.has(p) ? 'number' : 'string | number'}`)
          return `    ${JSON.stringify(key)}: { ${fields.join('; ')} }`
        })
        return `import type { PageI18n } from ${JSON.stringify('@lupinum/ginko-i18n')}
import type { AlternatesResolver } from ${JSON.stringify(join(runtime, 'types'))}

declare global {
  interface GinkoI18nMessages {
${entries.join('\n')}
  }
}

declare module 'nuxt/schema' {
  interface RequestEventContext {
    /** Set by the ginko-i18n middleware: the URL locale, or cookie/header for unprefixed paths. */
    locale?: string
  }
}

declare module '#app' {
  interface PageMeta {
    /** Translated paths or a subset of locales; \`false\` keeps the page unlocalized. */
    i18n?: PageI18n | false
    /**
     * Per-locale paths of a dynamic page, resolved before render (CMS and content slugs). Not inside
     * \`i18n\`: Nuxt reads \`i18n\` at build time only while it is plain data, and a function would drop its \`paths\`.
     */
    i18nAlternates?: AlternatesResolver
  }
}

export {}
`
      },
    }, { nuxt: true, nitro: true })

    // Read by the `ginko-i18n` CLI, so it never has to resolve the Nuxt config, layers or libraries itself.
    addTemplate({
      filename: 'ginko-i18n/manifest.json',
      write: true,
      getContents: () => JSON.stringify({
        version: MANIFEST_VERSION,
        rootDir: nuxt.options.rootDir,
        locales: config.locales,
        defaultLocale: config.defaultLocale,
        strategy: config.strategy,
        params: options.params ?? {},
        sources,
        srcDirs: [...new Set(nuxt.options._layers.map(l => l.config.srcDir).filter(Boolean))],
      } satisfies Manifest, null, 2),
    })

    // Nuxt prefetches every dynamic chunk; a visitor needs only their own locale's messages.
    nuxt.hook('build:manifest', (manifest) => {
      for (const [key, chunk] of Object.entries(manifest))
        if (decodeURIComponent(key).includes('ginko-i18n/messages/')) chunk.prefetch = chunk.preload = false
    })

    // Dev: push edited messages to open pages over Vite's socket (see plugin). Templates update too,
    // so server renders and later page loads use the new text.
    const clients: { ws: { send: (payload: { type: 'custom', event: string, data: unknown }) => void } }[] = []
    nuxt.hook('vite:serverCreated', (server, ctx) => {
      if (ctx.isClient) clients.push(server as unknown as (typeof clients)[number])
    })
    // Nuxt's `builder:watch` only sees the app's own folders, not `i18n/` at a layer's root or a library's
    // catalog folder, so each source folder is watched directly (dev only).
    let reloading: ReturnType<typeof setTimeout> | undefined
    const reload = () => {
      clearTimeout(reloading)
      reloading = setTimeout(() => { void reloadMessages() }, 50)
    }
    // After `modules:done` (see above), when the sources are known.
    if (nuxt.options.dev) {
      nuxt.hook('modules:done', () => {
        for (const dir of new Set(sources.map(s => s.dir))) {
          if (!existsSync(dir)) continue
          const watcher = watch(dir, (_event, name) => { if (name?.endsWith('.json')) reload() })
          nuxt.hook('close', () => watcher.close())
        }
      })
    }
    const reloadMessages = async () => {
      state = loadMessages(sources)
      report(state.fallbackKeys)
      for (const client of clients)
        for (const l of config.locales) client.ws.send({ type: 'custom', event: 'ginko-i18n:messages', data: { code: l.code, tree: state.compiled[l.code] } })
      await updateTemplates({ filter: t => t.filename.startsWith('ginko-i18n/') || t.filename === 'types/ginko-i18n.d.ts' })
    }

    // Routing: one route per page and locale, built from definePageMeta({ i18n }).
    nuxt.options.experimental.extraPageMetaExtractionKeys = [...(nuxt.options.experimental.extraPageMetaExtractionKeys ?? []), 'i18n']
    let sitemapEntries: Record<string, string>[] = []
    let homes: string[] = []
    nuxt.hook('pages:resolved', (pages) => {
      const localized = localizePages(pages, config)
      for (const page of localized) {
        // Non-ASCII paths broke under Vercel ISR (cached 404 for /blog/grüße); content transliterates slugs.
        if (/[^\x20-\x7E]/.test(page.path))
          console.warn(`[ginko-i18n] ${page.path} contains non-ASCII characters. Some caches (Vercel ISR) mishandle them. Fix: use ASCII, e.g. "gruesse" for "grüße".`)
      }
      // Static pages for the sitemap feed: one entry per base page with its per-locale paths.
      const groups = new Map<string, Record<string, string>>()
      for (const page of localized) {
        const baseName = page.meta?.i18nBase as string | undefined
        if (page.path.includes(':') || page.name === 'ginko-i18n-root') continue
        // Unlocalized pages (`i18n: false`) are listed once, without alternates, under the key `*`.
        // User-locale zones have no public URL per locale, so they stay out of the sitemap.
        if (!baseName) {
          if (!inUserZone(page.path, config)) groups.set(`*${page.path}`, { '*': page.path })
        }
        else groups.set(baseName, { ...groups.get(baseName), [page.meta!.i18nLocale as string]: page.path })
      }
      sitemapEntries = [...groups.values()]
      // Seed the prerenderer with each locale home, but only where a page serves it (an index page or
      // an optional catch-all such as `[...slug].vue`): a 404 there fails `nuxt build`.
      homes = config.locales.map(l => localizePath('/', l.code, config)).filter(home => localized.some(page =>
        page.path === home || /^\/:[^/]+\(\.\*\)\*$/.test(page.path.slice(home === '/' ? 0 : home.length))))
      if (config.strategy === 'prefix' && !inUserZone('/', config))
        localized.push({ name: 'ginko-i18n-root', path: '/', file: join(runtime, 'pages/root.vue'), meta: { i18n: false } })
      pages.splice(0, pages.length, ...localized)
    })
    // `_generate` is set by `nuxt generate`; it is in Nuxt's schema defaults but not in its types.
    const generating = (nuxt.options as { _generate?: boolean })._generate === true
    // Only an app that prerenders gets the homes: a server-rendered site (content from a live CMS)
    // must not freeze its home pages into the build.
    nuxt.hook('prerender:routes', ({ routes }) => {
      if (!generating && !nuxt.options.nitro.prerender?.crawlLinks) return
      for (const home of homes) routes.add(home)
    })
    // `prefix` on a server: `/` must stay dynamic so the middleware can redirect by language.
    // A static file would win and every visitor would get the JS redirect page. `nuxt generate` keeps it.
    if (config.strategy === 'prefix' && !generating) {
      nuxt.hook('nitro:config', (nitro) => {
        nitro.prerender = { ...nitro.prerender, ignore: [...(nitro.prerender?.ignore ?? []), /^\/(\?.*)?$/] }
      })
    }

    // A zone page's language depends on the request, so a prerendered copy would show the default
    // language to everyone. Keep zones out of the prerenderer (crawlLinks and route seeding would add them).
    if (config.userLocale.length) {
      nuxt.hook('nitro:config', (nitro) => {
        const zones = config.userLocale.map((pattern) => {
          const base = pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern
          const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          // `/**` is the whole app; Nitro's own `/200.html` and `/404.html` fallbacks stay prerenderable.
          if (pattern === '/**') return /^\/(?!(?:200|404)\.html)/
          return new RegExp(pattern.endsWith('/**') ? `^${escaped}(?:/|$)` : `^${escaped}$`)
        })
        nitro.prerender = { ...nitro.prerender, ignore: [...(nitro.prerender?.ignore ?? []), ...zones] }
      })
    }

    // D10: warn when a route rule caches a path whose language comes from the request.
    nuxt.hook('nitro:config', (nitro) => {
      // Nuxt's own paths (assets, images, islands with a locale prop) do not depend on the visitor's language.
      const internal = new Set(['/_nuxt/**', '/__nuxt_island/**', '/_ipx/**'])
      const negotiated = [...new Set(['/api/**', ...config.exclude.filter(p => !internal.has(p)), ...config.userLocale, ...(config.strategy === 'prefix' ? ['/'] : [])])]
      for (const { pattern, path } of cachedNegotiatedPaths({ ...nuxt.options.routeRules, ...nitro.routeRules }, negotiated))
        console.warn(`[ginko-i18n] routeRules "${pattern}" caches ${path}, whose language comes from Accept-Language or a cookie. Cached copies ignore those, so visitors get the wrong language. Fix: exclude that path from the cache rule, or put the locale in the URL.`)
    })

    // @nuxtjs/sitemap pairs locales by stripping the prefix, which is wrong for translated slugs
    // (it would list /en/about as the de-AT version of itself). So its `autoI18n` is off, its own
    // discovery stays on, and a server plugin attaches our explicit alternates (D13).
    if (hasNuxtModule('@nuxtjs/sitemap')) {
      // `sitemap` is typed only when @nuxtjs/sitemap is installed; this module must build without it.
      const options = nuxt.options as unknown as { sitemap?: { autoI18n?: unknown } }
      options.sitemap = { ...options.sitemap, autoI18n: false }
      addTemplate({ filename: 'ginko-i18n/sitemap.mjs', write: true, getContents: () => `export const entries = ${JSON.stringify(sitemapEntries)}\n` })
      // A plain function, no Nitro API: the same file serves Nitro 2 (Nuxt 4) and Nitro 3 (Nuxt 5).
      const sitemapPlugin = join(runtime, 'server/plugins/sitemap')
      addNitroPlugin({ nitro2: sitemapPlugin, nitro3: sitemapPlugin })
    }

    addPlugin({ src: join(runtime, 'plugin'), mode: 'all' })
    addImports([
      { name: 'useI18n', from: join(runtime, 'composables') },
      { name: 'useLocaleSuggestion', from: join(runtime, 'composables') },
      { name: 'addAlternatesResolver', from: join(runtime, 'composables') },
    ])
    addComponent({ name: 'I18nT', filePath: join(runtime, 'components/I18nT') })

    // No `route`: Nitro 2 reads `/**` as a literal prefix, Nitro 3 reads no route as global.
    addServerHandler({ middleware: true, handler: { nuxt: join(runtime, 'server/middleware') } })
    addServerImports([{ name: 'getI18n', from: join(runtime, 'server/utils') }])
  },
})
