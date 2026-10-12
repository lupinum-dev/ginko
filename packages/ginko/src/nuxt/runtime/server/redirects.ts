/// <reference path="../schema.d.ts" />
// Old URLs answer with a redirect (SPEC 8 "Weiterleitungen"): the site's `redirects` first, then the
// `redirectFrom` of file entries in the bundle of the path's locale. Entries of platform bricks have none yet,
// so the platform is never asked here: a platform failure cannot break a request.
import { defineEventHandler, getRequestURL, sendRedirect } from 'nuxt/server'
import { localeFromPath } from '@lupinum/ginko-i18n/core'
import fileBundles from '#ginko/files'
import locales from '#ginko/locales'
import redirects from '#ginko/redirects'
import { findRedirect } from '../../../internal.ts'

export default defineEventHandler((event) => {
  const method = event.req.method
  if (method !== 'GET' && method !== 'HEAD') return
  const url = getRequestURL(event)
  const path = url.pathname
  // Paths with an extension stay in: old `.html` and `.php` URLs are the most common thing to redirect.
  if (/^\/(__ginko|_nuxt)(\/|$)/.test(path)) return
  const locale = localeFromPath(path, locales) ?? locales.defaultLocale
  const bundle = Object.hasOwn(fileBundles, locale) ? fileBundles[locale as keyof typeof fileBundles] : undefined
  const hit = findRedirect(redirects, bundle, path + url.search)
  if (hit) return sendRedirect(event, hit.to, hit.status)
})
