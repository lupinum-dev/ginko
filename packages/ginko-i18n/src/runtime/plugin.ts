import { shallowReactive } from 'vue'
import { defineNuxtPlugin, isPrerendered, loadPayload, useHead, useRequestEvent, useRoute, useRouter, useState } from '#imports'
import { config } from '#ginko-i18n/config.mjs'
import { loaders } from '#ginko-i18n/loaders.mjs'
import { alternatesOf, inUserZone, localeFromPath, ogLocale, type MessageTree } from '@lupinum/ginko-i18n/core'
import { alternatesKey, createLocalePath, currentLocale, useI18n, writeLocaleCookie } from './composables'
import type { AlternatesResolver, I18nState, RuntimeConfig } from './types'

export default defineNuxtPlugin({
  name: 'ginko-i18n',
  enforce: 'pre',
  async setup(nuxtApp) {
    const c: RuntimeConfig = config
    const messages = shallowReactive<Record<string, MessageTree>>({})
    // The first page's messages arrive inline in the HTML (see below), so hydration waits for no fetch.
    const inline = import.meta.client ? (window as { __GINKO_I18N__?: Record<string, MessageTree> }).__GINKO_I18N__ : undefined
    const load = async (code: string) => {
      if (messages[code]) return
      messages[code] = inline?.[code] ?? await loaders[code]!()
    }
    if (import.meta.hot) {
      // The module sends edited messages over Vite's socket, so an open page updates without a reload.
      import.meta.hot.on('ginko-i18n:messages', ({ code, tree }: { code: string, tree: MessageTree }) => {
        if (messages[code]) messages[code] = tree
      })
    }
    // The locale of user-locale zones. One source: the server middleware sets `event.context.locale`
    // from cookie or Accept-Language; the client reads the payload and never detects it itself.
    const userLocale = useState<string>('ginko-i18n:user-locale', () => {
      const fromEvent = import.meta.server ? useRequestEvent()?.context.locale : undefined
      return typeof fromEvent === 'string' && c.locales.some(l => l.code === fromEvent) ? fromEvent : c.defaultLocale
    })
    let inlined = false
    const resolvers: AlternatesResolver[] = []

    // Every navigation, including the first one on server and client, waits for its locale's
    // messages. Nuxt runs the initial navigation in `app:created`, before the app mounts, so the
    // client never hydrates with a different set of messages than the server rendered with.
    const router = useRouter()
    router.beforeResolve(async (to) => {
      const zone = inUserZone(to.path, c)
      const code = zone ? userLocale.value : localeFromPath(to.path, c) ?? c.defaultLocale
      await load(code)
      if (import.meta.server && !inlined) {
        inlined = true
        // Escaped for a script element: `<`, U+2028 and U+2029 cannot end or break the script.
        const json = JSON.stringify({ [code]: messages[code] }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
        nuxtApp.runWithContext(() => useHead({ script: [{ key: 'ginko-i18n', tagPosition: 'head', innerHTML: `window.__GINKO_I18N__=${json}` }] }))
      }
      // A zone page has one URL for every locale, so it has no alternates to resolve.
      if (zone) return
      // Dynamic pages (CMS slugs) resolve their alternates here, before anything renders, so the
      // layout's switcher and the head agree. The result lives in payload data: hydration reuses it,
      // and `nuxt generate` writes it to _payload.json, so static hosts need no API on navigation.
      const own = to.meta.i18nAlternates as AlternatesResolver | undefined
      const key = alternatesKey(to.path)
      if ((!own && !resolvers.length) || nuxtApp.payload.data[key] !== undefined) return
      if (import.meta.client && nuxtApp.static.data[key] === undefined && (await isPrerendered(to.path))) {
        const payload = await loadPayload(to.path)
        if (payload?.data?.[key] !== undefined) {
          nuxtApp.payload.data[key] = payload.data[key]
          return
        }
      }
      if (nuxtApp.static.data[key] !== undefined) {
        nuxtApp.payload.data[key] = nuxtApp.static.data[key]
        return
      }
      // Inside the app context: resolvers use Nuxt composables (content queries, $fetch with headers).
      const helpers = { locale: localeFromPath(to.path, c) ?? c.defaultLocale, localePath: createLocalePath(router) }
      let paths: Awaited<ReturnType<AlternatesResolver>>
      for (const resolve of own ? [own] : resolvers) {
        paths = await nuxtApp.runWithContext(() => resolve(to, helpers))
        if (paths) break
      }
      // No resolver knows this route: it keeps its own locale clones, like a page without one.
      if (!paths) return
      nuxtApp.payload.data[key] = Object.fromEntries(Object.entries(paths).filter((e): e is [string, string] => !!e[1]))
    })

    if (import.meta.client) {
      router.afterEach((to, from) => {
        const next = localeFromPath(to.path, c)
        if (next && next !== localeFromPath(from.path, c))
          writeLocaleCookie(next)
      })
    }

    // Islands render without a router navigation. Server components do not send the page URL, so the
    // locale comes from an explicit `locale` prop (`<MyComponent :locale="locale" />`), then from
    // `islandContext.url` (island pages and `<NuxtIsland :context="{ url: route.path }">`).
    const island = import.meta.server ? nuxtApp.ssrContext?.islandContext : undefined
    let fixedLocale: string | undefined
    if (island) {
      const prop = island.props?.locale
      const fromProp = typeof prop === 'string' && c.locales.some(l => l.code === prop) ? prop : undefined
      const url = island.url ?? '/'
      if (import.meta.dev && !fromProp && url === '/')
        console.warn(`[ginko-i18n] Island "${island.name}" has no locale and renders in ${c.defaultLocale}. Fix: pass :locale="locale" (from useI18n()) to the server component.`)
      fixedLocale = fromProp ?? currentLocale(new URL(url, 'http://x').pathname, c, userLocale.value)
    }
    if (fixedLocale) await load(fixedLocale)

    nuxtApp.provide('ginkoI18n', { messages, load, fixedLocale, resolvers, userLocale } satisfies I18nState)

    if (c.seo) {
      nuxtApp.hook('app:created', () => {
        const route = useRoute()
        const i18n = useI18n()
        useHead(() => {
          const code = currentLocale(route.path, c, userLocale.value)
          const locale = c.locales.find(l => l.code === code)!
          // User-locale zone: one URL for every locale, so only `lang` and `dir`; no canonical or hreflang.
          if (inUserZone(route.path, c)) return { htmlAttrs: { lang: locale.language, dir: locale.dir } }
          const translated = i18n.alternates.value.filter(a => a.translated)
          const url = (path: string) => `${c.baseUrl}${c.base}${path}`
          return {
            htmlAttrs: { lang: locale.language, dir: locale.dir },
            link: [
              { rel: 'canonical', href: url(route.path) },
              ...alternatesOf(Object.fromEntries(translated.map(a => [a.code, a.path])), c).map(a => ({ rel: 'alternate' as const, hreflang: a.hreflang, href: url(a.path) })),
            ],
            meta: [
              { property: 'og:locale', content: ogLocale(locale.language) },
              ...translated.filter(a => !a.current).map(a => ({ property: 'og:locale:alternate', content: ogLocale(a.language) })),
            ],
          }
        })
      })
    }
  },
})
