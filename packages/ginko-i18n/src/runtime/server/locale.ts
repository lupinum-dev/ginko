import { getCookie, getRequestHeader } from 'nuxt/server'
import { config } from '#ginko-i18n/config.mjs'
import { inUserZone, isExcluded, localeFromPath, negotiateLocale } from '@lupinum/ginko-i18n/core'

type RequestEvent = Parameters<typeof getCookie>[0]
const c = config

/** The locale the visitor prefers: the `ginko_locale` cookie, then Accept-Language. */
export function preferredLocale(event: RequestEvent): string | undefined {
  const cookie = getCookie(event, 'ginko_locale')
  if (cookie && c.locales.some(l => l.code === cookie)) return cookie
  return negotiateLocale(getRequestHeader(event, 'accept-language'), c)
}

/**
 * The locale of a request for `path` (without `app.baseURL`). Page paths carry their locale; a user-locale zone
 * and unprefixed excluded paths (APIs) use the visitor's preference.
 */
export function requestLocale(event: RequestEvent, path: string): string {
  if (inUserZone(path, c)) return preferredLocale(event) ?? c.defaultLocale
  return localeFromPath(path, c) ?? (isExcluded(path, c) ? preferredLocale(event) : undefined) ?? c.defaultLocale
}
