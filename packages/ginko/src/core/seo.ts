import type { NavNode } from './navigation.ts'

export interface SeoImage { url: string; width?: number; height?: number; alt?: string }
export interface SeoInput {
  siteName: string
  /** `%s` is replaced by the page title; default '%s · <siteName>'. A page without title gets siteName alone. */
  titleTemplate?: string
  title?: string
  description?: string
  image?: SeoImage
  type?: 'website' | 'article'
  noindex?: boolean
}
export interface SeoHead {
  title: string
  meta: (({ name: string } | { property: string }) & { content: string })[]
}

// Canonical, hreflang, og:locale and og:url belong to ginko-i18n; this only builds title and meta.
export function seoHead(input: SeoInput): SeoHead {
  const { siteName, description, image, noindex } = input
  const title = input.title || undefined
  const template = input.titleTemplate ?? `%s · ${siteName}`
  const fullTitle = title ? template.replace('%s', () => title) : siteName

  const meta: SeoHead['meta'] = [
    { name: 'description', content: description ?? '' },
    { name: 'robots', content: noindex ? 'noindex, nofollow' : '' },
    { property: 'og:title', content: title ?? siteName },
    { property: 'og:description', content: description ?? '' },
    { property: 'og:type', content: input.type ?? 'website' },
    { property: 'og:site_name', content: siteName },
    { property: 'og:image', content: image?.url ?? '' },
    { property: 'og:image:width', content: image?.width === undefined ? '' : String(image.width) },
    { property: 'og:image:height', content: image?.height === undefined ? '' : String(image.height) },
    { property: 'og:image:alt', content: image?.alt ?? '' },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
  ]

  return { title: fullTitle, meta: meta.filter((m) => m.content !== '') }
}

/** True when a request for `host` (with port, as in the Host header) is not for the site's own address: preview deployments, staging, localhost. Those must never be indexed. */
export function isPreviewHost(host: string | undefined, siteUrl: string): boolean {
  // `www.` is the same site: a production site served on both must never be noindexed.
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, '')
  return bare(host ?? '') !== bare(new URL(siteUrl).host)
}

export function robotsTxt(options: { sitemap?: string; noindex?: boolean; disallow?: string[] }): string {
  if (options.noindex) return 'User-agent: *\nDisallow: /\n'
  const rules = options.disallow?.length ? options.disallow.map((path) => `Disallow: ${path}`) : ['Allow: /']
  const lines = ['User-agent: *', ...rules]
  if (options.sitemap) lines.push('', `Sitemap: ${options.sitemap}`)
  return `${lines.join('\n')}\n`
}

/** Drops keys whose value is undefined so optional fields do not appear in the JSON-LD. */
const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

export function websiteLd(o: { name: string; url: string; lang: string }): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: o.name, url: o.url, inLanguage: o.lang }
}

export function organizationLd(o: { name: string; url: string; logo?: string; sameAs?: string[] }): Record<string, unknown> {
  return compact({ '@context': 'https://schema.org', '@type': 'Organization', name: o.name, url: o.url, logo: o.logo, sameAs: o.sameAs })
}

export function breadcrumbLd(nodes: NavNode[], origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: nodes.map((node, i) => ({ '@type': 'ListItem', position: i + 1, name: node.title, item: origin + node.path })),
  }
}

export function articleLd(o: { title: string; url: string; description?: string; image?: string; published?: string; modified?: string; author?: string; lang: string }): Record<string, unknown> {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: o.title,
    url: o.url,
    description: o.description,
    image: o.image,
    datePublished: o.published,
    dateModified: o.modified,
    author: o.author === undefined ? undefined : { '@type': 'Person', name: o.author },
    inLanguage: o.lang,
  })
}

export function faqLd(pairs: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map((p) => ({ '@type': 'Question', name: p.question, acceptedAnswer: { '@type': 'Answer', text: p.answer } })),
  }
}

/**
 * Headers every response of a Ginko site carries. Only the platform may frame `/__ginko` (the preview); nothing
 * else is framed. `nosniff` stops a browser from reading user text (`.md`, `llms.txt`, JSON) as HTML, and the
 * referrer policy keeps full URLs from leaving the site.
 */
export function siteHeaders(input: { preview: boolean; platformOrigin: string; noindex: boolean }): Record<string, string> {
  return {
    'content-security-policy': input.preview && input.platformOrigin ? `frame-ancestors ${input.platformOrigin}` : `frame-ancestors 'self'`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...(input.noindex ? { 'x-robots-tag': 'noindex' } : {}),
  }
}
