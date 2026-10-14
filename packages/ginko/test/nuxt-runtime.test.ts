// Pure parts of the Nuxt runtime: page paths and the sitemap document (SPEC 8).
// The corpus is the restaurant contract (contracts/restaurant), so the expected values come from data.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { ref } from 'vue'
import type { Locale } from '../src/index.ts'
import type { Bundle, Schema } from '../src/internal.ts'
import { agentRequest, withUrl } from '../src/nuxt/runtime/shared.ts'
import { BUNDLE_STATE, TODAY_STATE, useGinkoLang, useGinkoBreadcrumbs, useGinkoEntry, useGinkoNeighbors, useGinkoQuery, useGinkoSeo, useGinkoPath } from '../src/nuxt/runtime/composables.ts'
import * as shim from './shims/imports.ts'
import { i18nLocale, routePath, seoConfig, useState } from './shims/imports.ts'
import { installOgImage } from './shims/og.ts'
import { installSchemaOrg } from './shims/schema-org.ts'
import siteSchema from './shims/schema.ts'
import { resolveConfig } from '@lupinum/ginko-i18n/core'
import { sitemapXml as render } from '../src/nuxt/runtime/server/sitemap-xml.ts'

const corpus = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../contracts/restaurant/${name}`, import.meta.url)), 'utf8'))

const schema = corpus('schema.json') as Schema
const bundles: Partial<Record<Locale, Bundle>> = {
  de: corpus('bundle.format3.de.json') as Bundle,
  en: corpus('bundle.format3.en.json') as Bundle,
}

// What the Ginko module passes to ginko-i18n (module.ts), so hreflang matches the page head.
const i18n = resolveConfig({ locales: schema.locales })
const sitemapXml = (site: Schema, input: Partial<Record<Locale, Bundle>>, today: string) => render(site, input, today, i18n)

describe('useGinkoPath', () => {
  test.each([
    ['de', 'menu', undefined, '/speisekarte'],
    ['de', 'menu', 'en', '/en/menu'],
    ['en', 'menu', undefined, '/en/menu'],
    ['en', 'menu', 'de', '/speisekarte'],
    ['en', 'untranslated', undefined, '/nur-deutsch'],
  ])('in %s, %s as %s is %s', (current, key, locale, path) => {
    // A page the site config only has in German (SPEC 2 `pages`): it falls back to the main locale.
    ;(siteSchema.pages as Record<string, Partial<Record<Locale, string>>>).untranslated = { de: '/nur-deutsch' }
    i18nLocale.value = current
    expect(useGinkoPath()(key as never, locale as Locale | undefined)).toBe(path)
    delete (siteSchema.pages as Record<string, unknown>).untranslated
  })
})

describe('useGinkoSeo', () => {
  const site = { titleTemplate: '%s | Restaurant', description: 'Site description', image: '/og.png', organization: { logo: '/logo.png', sameAs: ['https://social.test/r'] } }
  const metaOf = (head: { meta: { name?: string; property?: string; content: string }[] }, key: string) => head.meta.find((m) => m.name === key || m.property === key)?.content
  const run = (path: string, input: Parameters<typeof useGinkoSeo>[0], config: Record<string, unknown> = site) => {
    for (const key of Object.keys(seoConfig)) delete seoConfig[key]
    Object.assign(seoConfig, config)
    routePath.value = path
    i18nLocale.value = 'de'
    useGinkoSeo(input)
    return shim.head as { title: string; meta: { name?: string; property?: string; content: string }[]; script: { type: string; innerHTML: string }[] }
  }

  test.each([
    ['template and site description apply', { title: 'Menü' }, 'Menü | Restaurant', 'description', 'Site description'],
    ['page description wins', { title: 'Menü', description: 'Page' }, 'Menü | Restaurant', 'description', 'Page'],
    ['site image becomes absolute', { title: 'Menü' }, 'Menü | Restaurant', 'og:image', 'https://restaurant.test/og.png'],
    ['page image path becomes absolute', { title: 'Menü', image: '/a.png' }, 'Menü | Restaurant', 'og:image', 'https://restaurant.test/a.png'],
    ['absolute page image stays', { title: 'Menü', image: 'https://cdn.test/a.png' }, 'Menü | Restaurant', 'og:image', 'https://cdn.test/a.png'],
    ['noindex sets robots', { title: 'Menü', noindex: true }, 'Menü | Restaurant', 'robots', 'noindex, nofollow'],
  ])('%s', (_label, input, title, key, value) => {
    const head = run('/speisekarte', input)
    expect(head.title).toBe(title)
    expect(metaOf(head, key)).toBe(value)
  })

  test('a site without nuxt-og-image keeps the page and site image; with it, every page gets a card with its image inside', () => {
    // No module: today's output (the site image), and nothing to call.
    expect(metaOf(run('/speisekarte', { title: 'Menü' }), 'og:image')).toBe('https://restaurant.test/og.png')
    const calls: unknown[][] = []
    installOgImage((...args) => calls.push(args))
    try {
      const generated = run('/speisekarte', { title: 'Menü', description: 'Page', section: 'Karte', image: '/a.png' })
      expect(metaOf(generated, 'og:image')).toBeUndefined()
      // nuxt-og-image writes `summary_large_image`; a `summary` of ours would win and shrink the card on X.
      expect(metaOf(generated, 'twitter:card')).toBeUndefined()
      expect(calls).toHaveLength(1)
      const [template, props] = calls[0] as [string, Record<string, string | (() => string)>]
      const value = (key: string) => { const v = props[key]; return typeof v === 'function' ? v() : v }
      expect([template, ...['title', 'description', 'section', 'siteName', 'image', 'logo'].map(value)]).toStrictEqual(['GinkoCard', 'Menü', 'Page', 'Karte', 'Restaurant', '/a.png', '/logo.png'])
    } finally { installOgImage(undefined) }
  })

  test('with nuxt-schema-org, the JSON-LD goes into its graph and no script of our own is written', () => {
    // The lab found two WebSite nodes on a home page: ours and the module's default one.
    const graphs: Record<string, unknown>[][] = []
    installSchemaOrg((nodes) => graphs.push(nodes.value))
    try {
      const home = run('/', { title: 'Home', jsonLd: [{ '@context': 'https://schema.org', '@type': 'FAQPage' }] })
      expect(home.script).toStrictEqual([])
      expect(graphs).toStrictEqual([[{ '@type': 'FAQPage' }]])
    } finally { installSchemaOrg(undefined) }
  })

  test('the home page gets WebSite and Organization JSON-LD before the page\'s own; other pages only their own', () => {
    const own = { '@type': 'FAQPage' }
    const home = run('/', { title: 'Home', jsonLd: [own] })
    expect(home.script.map((s) => [s.type, JSON.parse(s.innerHTML)['@type']])).toStrictEqual([
      ['application/ld+json', 'WebSite'], ['application/ld+json', 'Organization'], ['application/ld+json', 'FAQPage'],
    ])
    expect(JSON.parse(home.script[0]!.innerHTML).inLanguage).toBe('de-AT')
    expect(JSON.parse(home.script[1]!.innerHTML)).toMatchObject({ logo: 'https://restaurant.test/logo.png', sameAs: ['https://social.test/r'] })
    expect(run('/', { title: 'Home' }, {}).script.map((s) => JSON.parse(s.innerHTML)['@type'])).toStrictEqual(['WebSite'])
    expect(run('/speisekarte', { jsonLd: [own] }).script).toHaveLength(1)
  })

  test('a "<" in JSON-LD cannot close the script element', () => {
    const { script } = run('/speisekarte', { jsonLd: [{ name: '</script><b>' }] })
    expect(script[0]!.innerHTML).not.toContain('<')
    expect(JSON.parse(script[0]!.innerHTML).name).toBe('</script><b>')
  })
})

describe('entry helpers', () => {
  test('a routed item gets the url of the current locale', () => {
    const [item] = withUrl([{ id: 'x', fallback: ['title'], urls: { de: '/veranstaltungen/a', en: '/en/events/a' } }], 'en')
    expect(item!.url).toBe('/en/events/a')
  })

  test('useGinkoLang gives the language tag of the main locale (de-AT) only for a fallen-back field', () => {
    const langOf = useGinkoLang()
    const item = { fallback: ['title'] }
    expect(langOf(item, 'title')).toBe('de-AT')
    expect(langOf(item, 'description')).toBeUndefined()
  })
})

// Events of the corpus on 2026-10-08: sommerfest is past (hidden), weinabend and martinigans are upcoming.
function today(date: string) {
  useState<Partial<Record<Locale, Bundle>>>(BUNDLE_STATE).value = bundles
  useState<string>(TODAY_STATE).value = date
  i18nLocale.value = 'de'
}

describe('collection composables', () => {
  test.each([
    ['all visible, hidden one not counted', {}, ['weinabend', 'martinigans'], 2, 1],
    ['order newest first', { order: 'when desc' }, ['martinigans', 'weinabend'], 2, 1],
    ['where on money', { where: { price: { gt: 4000 } } }, ['martinigans'], 1, 1],
    ['limit with page 2', { limit: 1, page: 2 }, ['martinigans'], 2, 2],
  ])('useGinkoQuery: %s', (_name, q, ids, total, pages) => {
    today('2026-10-08')
    const result = useGinkoQuery('events' as never, q as never).value
    expect(result.items.map((i: { id: string }) => i.id)).toEqual(ids)
    expect([result.total, result.pages]).toEqual([total, pages])
    // A routed entry carries its url of the current locale.
    expect(result.items[0]).toHaveProperty('url', `/veranstaltungen/${ids[0] === 'weinabend' ? 'weinabend-ebner' : 'martini-gansl'}`)
  })

  test('useGinkoQuery follows a reactive query and a hidden entry comes back when it is current', () => {
    today('2026-06-20')
    const page = ref(1)
    const result = useGinkoQuery('events' as never, () => ({ limit: 1, page: page.value }))
    expect(result.value.items.map((i: { id: string }) => i.id)).toEqual(['sommerfest'])
    page.value = 3
    expect(result.value.items.map((i: { id: string }) => i.id)).toEqual(['martinigans'])
  })

  test('useGinkoNeighbors skips the hidden entry: the first visible one has no prev', () => {
    today('2026-10-08')
    const { prev, next } = useGinkoNeighbors('events' as never, 'weinabend').value as { prev?: unknown; next?: { id: string } }
    expect(prev).toBeUndefined()
    expect(next?.id).toBe('martinigans')
  })

  test('useGinkoNeighbors takes the order as { order }', () => {
    today('2026-10-08')
    const { prev, next } = useGinkoNeighbors('events' as never, 'weinabend', { order: 'price desc' }).value as { prev?: { id: string }; next?: unknown }
    expect(prev?.id).toBe('martinigans')
    expect(next).toBeUndefined()
  })

  // Wrong behaviour caught: a page reused for another slug (client navigation) keeps showing the first entry.
  test('useGinkoEntry follows a slug getter and answers 404 for a missing slug', () => {
    today('2026-10-08')
    const slug = ref<string | undefined>('weinabend-ebner')
    const entry = useGinkoEntry('events' as never, () => slug.value)
    expect((entry.value as { id: string }).id).toBe('weinabend')
    slug.value = 'martini-gansl'
    expect((entry.value as { id: string }).id).toBe('martinigans')
    slug.value = undefined
    expect(() => entry.value).toThrow(expect.objectContaining({ statusCode: 404 }))
  })

  test('useGinkoBreadcrumbs gives the trail for the route path', () => {
    today('2026-10-08')
    routePath.value = '/veranstaltungen/martini-gansl'
    expect(useGinkoBreadcrumbs(['events'] as never).value.map((n) => n.id)).toEqual(['martinigans'])
    routePath.value = '/unbekannt'
    expect(useGinkoBreadcrumbs(['events'] as never).value).toEqual([])
    routePath.value = '/'
  })
})

// Wrong behaviour caught: a page whose slug has a dot (`/blog/v1.2`) is taken for a file, so it gets no Link header.
describe('agentRequest', () => {
  test.each([
    ['/blog/v1.2', { page: '/blog/v1.2', asMarkdown: false }],
    ['/blog/v1.2.md', { page: '/blog/v1.2', asMarkdown: true }],
    ['/en/menu', { page: '/en/menu', asMarkdown: false }],
    ['/index.md', { page: '/', asMarkdown: true }],
    ['/__ginko/files/de.json', undefined],
    ['/_ginko/img/abc.webp', undefined],
    ['/_nuxt/entry.js', undefined],
  ])('%s', (path, request) => {
    expect(agentRequest(path)).toEqual(request)
  })
})

describe('sitemapXml', () => {
  test('lists 7 static pages per locale and the visible routed entries, 18 URLs in total', () => {
    const xml = sitemapXml(schema, bundles, '2026-10-08')
    expect(xml.match(/<url>/g)).toHaveLength(18)
    expect(xml).toContain('<loc>https://ginko-demo-restaurant.vercel.app/en/events/wine-evening-ebner</loc>')
  })

  test('drops an entry once it is past (sommerfest ended 2026-06-21)', () => {
    expect(sitemapXml(schema, bundles, '2026-10-08')).not.toContain('sommerfest')
  })

  test('drops an entry after its last day (weinabend 2026-10-16)', () => {
    const xml = sitemapXml(schema, bundles, '2026-10-17')
    expect(xml).not.toContain('weinabend')
    expect(xml.match(/<url>/g)).toHaveLength(16)
  })

  test('links an entry to its URL in every locale it has', () => {
    const xml = sitemapXml(schema, bundles, '2026-10-08')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="de" href="https://ginko-demo-restaurant.vercel.app/veranstaltungen/weinabend-ebner"/>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://ginko-demo-restaurant.vercel.app/en/events/wine-evening-ebner"/>')
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://ginko-demo-restaurant.vercel.app/veranstaltungen/weinabend-ebner"/>')
  })

  test('pairs a static page with its other locales by key; a page in one locale has no alternates', () => {
    const xml = sitemapXml(schema, bundles, '2026-10-08')
    expect(xml).toContain('<url><loc>https://ginko-demo-restaurant.vercel.app/en</loc><xhtml:link rel="alternate" hreflang="de" href="https://ginko-demo-restaurant.vercel.app/"/>')
    const single: Schema = { ...schema, pages: { home: { de: '/', en: '/en' }, karte: { de: '/speisekarte' } } }
    expect(sitemapXml(single, {}, '2026-10-08')).toContain('<url><loc>https://ginko-demo-restaurant.vercel.app/speisekarte</loc></url>')
  })

  // Wrong behaviour caught: lastmod missing for entries (search engines never learn what changed) or invented for static pages.
  test('gives an entry URL its updatedAt as lastmod in every locale; static pages have none', () => {
    const xml = sitemapXml(schema, bundles, '2026-10-08')
    const base = 'https://ginko-demo-restaurant.vercel.app'
    expect(xml).toContain(`<loc>${base}/veranstaltungen/martini-gansl</loc><lastmod>2026-10-01T14:30:00.000Z</lastmod>`)
    expect(xml).toContain(`<loc>${base}/en/events/martini-gansl</loc><lastmod>2026-10-01T14:30:00.000Z</lastmod>`)
    expect(xml.match(/<lastmod>/g)).toHaveLength(4)
    expect(xml).toContain(`<url><loc>${base}/en</loc><xhtml:link`)
  })

  test('escapes URLs so no value breaks the document', () => {
    const odd: Bundle = { ...bundles.de!, bricks: { ...bundles.de!.bricks, events: { kind: 'collection', items: [{ id: 'x', data: { when: { from: '2026-10-01', to: '2026-10-31' } }, fallback: [], urls: { de: '/veranstaltungen/a&b' } }] } } }
    expect(sitemapXml(schema, { de: odd }, '2026-10-08')).toContain('<loc>https://ginko-demo-restaurant.vercel.app/veranstaltungen/a&amp;b</loc>')
  })

  describe('images', () => {
    const site = 'https://ginko-demo-restaurant.vercel.app'
    const urls = { de: '/veranstaltungen/weinabend-ebner', en: '/en/events/wine-evening-ebner' }
    const img = (url: string) => ({ url, alt: '', width: 1, height: 1 })
    const render = (data: Record<string, unknown>) => {
      const s = structuredClone(schema)
      const events = s.bricks.events as { fields: Record<string, unknown> }
      events.fields.gallery = { type: 'list', label: 'Galerie', of: { photo: { type: 'image', label: 'Foto' } } }
      const items = [{ id: 'w', data: { when: { from: '2026-10-01', to: '2026-10-31' }, ...data }, fallback: [], urls }]
      const bundle: Bundle = { ...bundles.de!, bricks: { ...bundles.de!.bricks, events: { kind: 'collection', items } } }
      return sitemapXml(s, { de: bundle }, '2026-10-08')
    }
    const alternates = `<xhtml:link rel="alternate" hreflang="de" href="${site}/veranstaltungen/weinabend-ebner"/><xhtml:link rel="alternate" hreflang="en" href="${site}/en/events/wine-evening-ebner"/><xhtml:link rel="alternate" hreflang="x-default" href="${site}/veranstaltungen/weinabend-ebner"/>`

    test('lists a top-level image and a list-row image, deduped, with the image namespace', () => {
      const xml = render({ image: img('/files/a&b.jpg'), gallery: [{ _id: 'r1', photo: img('https://cdn.example/b.jpg') }, { _id: 'r2', photo: img('/files/a&b.jpg') }] })
      expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
      expect(xml).toContain(`  <url><loc>${site}/veranstaltungen/weinabend-ebner</loc>${alternates}<image:image><image:loc>${site}/files/a&amp;b.jpg</image:loc></image:image><image:image><image:loc>https://cdn.example/b.jpg</image:loc></image:image></url>`)
    })

    test('a page without images is unchanged and the namespace is absent', () => {
      const xml = render({})
      expect(xml).not.toContain('image')
      expect(xml).toContain(`  <url><loc>${site}/veranstaltungen/weinabend-ebner</loc>${alternates}</url>`)
    })
  })
})
