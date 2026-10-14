import { defineEventHandler, getRequestHeader, getRequestURL, sendRedirect } from 'nuxt/server'
import { config } from '#ginko-i18n/config.mjs'
import { cleanPath, inUserZone, isExcluded, localizePath } from '@lupinum/ginko-i18n/core'
import { preferredLocale, requestLocale } from './locale'

const c = config

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  // Router paths never include `app.baseURL`; strip it so `/sub/en/about` reads as `/en/about`.
  if (c.base && url.pathname !== c.base && !url.pathname.startsWith(`${c.base}/`)) return
  const path = url.pathname.slice(c.base.length) || '/'

  // One URL per page. vue-router ignores a trailing slash and matches `/EN/about` (rendering it in the
  // default locale), and `//blog` reads as a protocol-relative URL with the host `blog`.
  if (!isExcluded(path, c)) {
    const clean = cleanPath(path, c)
    if (clean) return sendRedirect(event, `${c.base}${clean}${url.search}`, 301)
  }

  // User-locale zone: the locale is the user's, never the URL's. Caches must tell users apart.
  if (inUserZone(path, c)) {
    event.res.headers.append('vary', 'accept-language, cookie')
    event.context.locale = requestLocale(event, path)
    return
  }

  // `prefix`: `/` has no content. Redirect live requests; the prerendered page handles static hosts.
  if (path === '/' && c.strategy === 'prefix' && !getRequestHeader(event, 'x-nitro-prerender')) {
    event.res.headers.append('vary', 'accept-language, cookie')
    return sendRedirect(event, c.base + localizePath('/', preferredLocale(event) ?? c.defaultLocale, c) + url.search, 302)
  }

  event.context.locale = requestLocale(event, path)
})
