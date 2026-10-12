// The sitemap document as a pure function (SPEC 8 "Sitemap"), so it can be unit tested without Nuxt.
import { alternatesOf, type LocaleConfig } from '@lupinum/ginko-i18n/core'
import { isVisible, type Brick, type Bundle, type Fields, type Locale, type Schema } from '../../../index.ts'

/** One group of `<url>` elements; `alternates` lists the group's URLs as `xhtml:link` hreflang entries. */
interface Group {
  urls: Record<Locale, string>
  alternates: boolean
  /** ISO 8601 time of the entry's last change (`updatedAt`); static pages have none. */
  lastmod?: string
  /** Absolute image URLs per locale (`imagesOf`). */
  images?: Partial<Record<Locale, string[]>>
}

/** Google's limit for `<image:image>` elements per `<url>`. */
const MAX_IMAGES = 20

/**
 * `bundles` must hold every locale of the site for routed entries; `today` is the site's date
 * (todayIn of its timezone), so the visibility rule matches the pages. `locales` is ginko-i18n's
 * config: hreflang uses its languages and `x-default`, exactly as the page head does.
 */
export function sitemapXml(site: Schema, bundles: Partial<Record<Locale, Bundle>>, today: string, locales: Pick<LocaleConfig, 'locales' | 'defaultLocale'>): string {
  const base = site.url.replace(/\/$/, '')
  const groups: Group[] = [...staticGroups(site, base), ...entryGroups(site, bundles, today, base)]
  const seen = new Set<string>()
  const urls: string[] = []
  let hasImages = false
  for (const group of groups) {
    const alternates = alternatesOf(group.urls, locales).map((a) => `<xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.path)}"/>`)
    for (const [locale, href] of Object.entries(group.urls)) {
      if (seen.has(href)) continue
      seen.add(href)
      const images = (group.images?.[locale] ?? []).map((src) => `<image:image><image:loc>${escapeXml(src)}</image:loc></image:image>`)
      hasImages ||= images.length > 0
      urls.push(`  <url><loc>${escapeXml(href)}</loc>${group.lastmod ? `<lastmod>${escapeXml(group.lastmod)}</lastmod>` : ''}${group.alternates ? alternates.join('') : ''}${images.join('')}</url>`)
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"${hasImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>`,
    ...urls,
    '</urlset>',
  ].join('\n')
}

/** Static pages: one group per page key, with its path in every locale it has. */
function staticGroups(site: Schema, base: string): Group[] {
  return Object.values(site.pages).map((paths) => ({
    urls: Object.fromEntries(Object.entries(paths).map(([locale, path]) => [locale, `${base}${path}`])),
    alternates: Object.keys(paths).length > 1,
  }))
}

/**
 * Routed collection entries: one group per entry, merging the URLs of every locale in which the
 * entry is visible. Visibility is checked per locale copy with the schema's rule (SPEC 2.1).
 */
function entryGroups(site: Schema, bundles: Partial<Record<Locale, Bundle>>, today: string, base: string): Group[] {
  const groups = new Map<string, Group>()
  for (const locale of site.locales) {
    const bundle = bundles[locale]
    if (!bundle) continue
    for (const [key, brick] of Object.entries(site.bricks)) {
      const value = bundle.bricks[key]
      if (!isRoutedCollection(brick) || value?.kind !== 'collection') continue
      for (const item of value.items) {
        if (!item.urls || !isVisible(brick, item.data, today)) continue
        const id = `${key}/${item.id}`
        const group = groups.get(id) ?? { urls: {}, alternates: true }
        // The locale copies of one entry share a time; the latest wins if they ever differ.
        if (item.updatedAt && (!group.lastmod || item.updatedAt > group.lastmod)) group.lastmod = item.updatedAt
        const images = imagesOf(brick.fields, item.data, base)
        if (images.length) group.images = { ...group.images, [locale]: images }
        for (const member of site.locales) {
          const path = item.urls[member]
          if (path) group.urls[member] = `${base}${path}`
        }
        groups.set(id, group)
      }
    }
  }
  return [...groups.values()]
}

/**
 * Absolute URLs of the images of one entry: top-level `image` fields and the rows of `list` fields
 * (resolved values are `{ url, alt, width, height }`, see resolve.ts). Deduped, at most MAX_IMAGES.
 */
function imagesOf(fields: Fields, data: Record<string, unknown>, base: string): string[] {
  const found = new Set<string>()
  const walk = (of: Fields, values: Record<string, unknown>) => {
    for (const [name, field] of Object.entries(of)) {
      const value = values[name]
      if (field.type === 'image') {
        const url = (value as { url?: unknown } | undefined)?.url
        if (typeof url === 'string' && url) found.add(/^https?:\/\//.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`)
      } else if (field.type === 'list' && Array.isArray(value)) {
        for (const row of value) walk(field.of, row as Record<string, unknown>)
      }
    }
  }
  walk(fields, data)
  return [...found].slice(0, MAX_IMAGES)
}

function isRoutedCollection(brick: Brick | undefined): brick is Brick & { kind: 'collection' } {
  return brick?.kind === 'collection' && brick.route !== undefined
}

/** Escapes the five XML special characters, so no URL can break the document. */
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
