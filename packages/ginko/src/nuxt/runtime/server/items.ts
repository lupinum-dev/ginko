/// <reference path="../schema.d.ts" />
// `getGinkoItems` for a site's own server routes (a feed, a calendar file): the entries a page would list, read on the
// server, for file bricks and platform bricks alike.
import { createError, useRuntimeConfig, type RequestEvent } from 'nuxt/server'
import schema from '#ginko/schema'
import { isVisible, todayIn, type Brick, type BundleItem, type Locale } from '../../../internal.ts'
import { withUrl, type GinkoPublicConfig } from '../shared.ts'
import { loadServerBundles } from './bundles.ts'

/** An entry as `getGinkoItems` returns it: `url` is its path in the requested language (collections with a route). */
export type GinkoServerItem = BundleItem & { url?: string }

/**
 * The visible entries of collection `brick` in `locale` (default: the main language), in the collection's order, as
 * `useGinko(brick).items` has them on a page: drafts and entries past their `visible` date are left out. Throws a 404
 * for a language the site does not have or a key that is no collection, and a 503 when the platform cannot be reached.
 */
export async function getGinkoItems(event: RequestEvent, brick: string, locale?: string): Promise<GinkoServerItem[]> {
  const config = useRuntimeConfig().public.ginko as GinkoPublicConfig
  const code = (locale ?? config.mainLocale) as Locale
  const def = schema.bricks[brick] as Brick | undefined
  if (!config.locales.includes(code) || def?.kind !== 'collection') throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const bundle = (await loadServerBundles(event, config, [code]))[code]
  const value = bundle?.bricks[brick]
  if (!bundle || value?.kind !== 'collection') return []
  const today = todayIn(config.timeZone)
  const items = value.items.filter((item) => isVisible(def, item.data, today))
  return def.route ? withUrl(items, bundle.locale, bundle.mainLocale) : items
}
