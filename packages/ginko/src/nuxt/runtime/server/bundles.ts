/// <reference path="../schema.d.ts" />
// The bundles a server route reads, per locale, for file bricks and platform bricks alike.
// Platform rule (SPEC 8): any failure is a 503, never an empty answer.
import { createError, getRequestHeader } from 'nuxt/server'
import fileBundles from '#ginko/files'
import type { Bundle, Locale } from '../../../index.ts'
import { loadBundle, PlatformError } from '../fetch.ts'
import type { GinkoPublicConfig } from '../shared.ts'

export async function loadServerBundles(event: Parameters<typeof getRequestHeader>[0], config: GinkoPublicConfig, locales: readonly Locale[]): Promise<Partial<Record<Locale, Bundle>>> {
  const minRev = getRequestHeader(event, 'x-ginko-min-rev')
  const bundles: Partial<Record<Locale, Bundle>> = {}
  // File bricks are read from the build-time bundle (what `/__ginko/files/<locale>` serves), no request needed.
  const loadFiles = async (locale: Locale) => fileBundles[locale as keyof typeof fileBundles] as Bundle | undefined
  try {
    await Promise.all(locales.map(async (locale) => { bundles[locale] = await loadBundle(config, locale, minRev, loadFiles) }))
  } catch (error) {
    if (error instanceof PlatformError) throw createError({ statusCode: error.statusCode, statusMessage: error.message, fatal: true, cause: error.cause })
    throw error
  }
  return bundles
}
