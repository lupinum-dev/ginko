import { defineEventHandler, getCookie, getRequestHeader, getRequestURL, sendRedirect } from 'nuxt/server'
import { config } from '#ginko-i18n/config.mjs'
import { canonicalCase, inUserZone, isExcluded, localeFromPath, localizePath, negotiateLocale } from '@lupinum/ginko-i18n/core'

const c = config

function preferred(event: Parameters<typeof getCookie>[0]): string | undefined {
  const cookie = getCookie(event, 'ginko_locale')
  if (cookie && c.locales.some(l => l.code === cookie)) return cookie
  return negotiateLocale(getRequestHeader(event, 'accept-language'), c)
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  // Router paths never include `app.baseURL`; strip it so `/sub/en/about` reads as `/en/about`.
  if (c.base && url.pathname !== c.base && !url.pathname.startsWith(`${c.base}/`)) return
  const path = url.pathname.slice(c.base.length) || '/'

  // User-locale zone: the locale is the user's, never the URL's. Caches must tell users apart.
  if (inUserZone(path, c)) {
    event.res.headers.append('vary', 'accept-language, cookie')
    event.context.locale = preferred(event) ?? c.defaultLocale
    return
  }

  // `/EN/about` would match `/en/about` (vue-router is case-insensitive) but render in the default locale.
  const canonical = canonicalCase(path, c)
  if (canonical) return sendRedirect(event, `${c.base}${canonical}${url.search}`, 301)
  const fromPath = localeFromPath(path, c)

  // `prefix`: `/` has no content. Redirect live requests; the prerendered page handles static hosts.
  if (path === '/' && c.strategy === 'prefix' && !getRequestHeader(event, 'x-nitro-prerender')) {
    event.res.headers.append('vary', 'accept-language, cookie')
    return sendRedirect(event, c.base + localizePath('/', preferred(event) ?? c.defaultLocale, c) + url.search, 302)
  }

  // Page paths carry their locale. Unprefixed API and excluded paths use cookie, then header.
  event.context.locale = fromPath ?? (isExcluded(path, c) ? preferred(event) : undefined) ?? c.defaultLocale
})
