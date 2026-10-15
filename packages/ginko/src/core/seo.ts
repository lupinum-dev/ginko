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

/** Drops keys whose value is undefined, an empty text or an empty list, so optional data does not appear in the JSON-LD. */
export const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)))

/** A schema.org PostalAddress, or undefined when no part of it is known. `country` is an ISO 3166 code such as `DE`. */
export function postalAddressLd(a: { street?: string; postalCode?: string; city?: string; country?: string }): Record<string, unknown> | undefined {
  if (!a.street && !a.postalCode && !a.city) return undefined
  return compact({ '@type': 'PostalAddress', streetAddress: a.street, postalCode: a.postalCode, addressLocality: a.city, addressCountry: a.country })
}

export function websiteLd(o: { name: string; url: string; lang: string }): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: o.name, url: o.url, inLanguage: o.lang }
}

/**
 * `node` with the site's `country` (ISO 3166 code) where a builder left it out: `addressCountry` of every PostalAddress,
 * and where remote applicants of a remote JobPosting must live. The Nuxt module applies it to a page's JSON-LD, so
 * `siteJsonLd` and `jobJsonLd` need no `country` (an explicit one wins). An empty `country` changes nothing.
 */
export function withCountry<T>(node: T, country: string): T {
  if (!country || node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((item) => withCountry(item, country)) as T
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withCountry(value, country)]))
  if (out['@type'] === 'PostalAddress' && out.addressCountry === undefined) out.addressCountry = country
  if (out['@type'] === 'JobPosting' && out.jobLocationType === 'TELECOMMUTE' && out.applicantLocationRequirements === undefined) {
    out.applicantLocationRequirements = { '@type': 'Country', name: country }
  }
  return out as T
}

/** The schema.org types `organizationLd` writes. A page whose JSON-LD has a node of one of them is the site's organisation node. */
export const ORGANIZATION_TYPES = ['Organization', 'LocalBusiness', 'NGO'] as const

export interface OrganizationLdInput {
  name: string
  url: string
  /** `Organization` (default), `LocalBusiness` for a shop or practice, `NGO` for a nonprofit. */
  type?: (typeof ORGANIZATION_TYPES)[number]
  legalName?: string
  /** Absolute URL of the logo. */
  logo?: string
  email?: string
  telephone?: string
  address?: { street?: string; postalCode?: string; city?: string; country?: string }
  vatID?: string
  /** Absolute URLs of the organisation's profiles elsewhere. */
  sameAs?: string[]
}

export function organizationLd(o: OrganizationLdInput): Record<string, unknown> {
  return compact({
    '@context': 'https://schema.org',
    '@type': o.type ?? 'Organization',
    name: o.name,
    legalName: o.legalName,
    url: o.url,
    logo: o.logo,
    email: o.email,
    telephone: o.telephone,
    address: o.address && postalAddressLd(o.address),
    vatID: o.vatID,
    sameAs: o.sameAs,
  })
}

/**
 * A schema.org BreadcrumbList from the first step (usually the home page) to the page itself. Each step has a `title`
 * and a `path` of the site, as the nodes of `useGinkoBreadcrumbs` do; `siteUrl` (`useGinkoSite().url`) makes the
 * paths absolute.
 */
export function breadcrumbJsonLd(steps: readonly Pick<NavNode, 'title' | 'path'>[], siteUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map((step, i) => ({ '@type': 'ListItem', position: i + 1, name: step.title, item: new URL(step.path, siteUrl).href })),
  }
}

export interface ArticleLdInput {
  /** `Article` (default) or `BlogPosting` for a post of a blog. */
  type?: 'Article' | 'BlogPosting'
  title: string
  url: string
  description?: string
  image?: string
  published?: string
  modified?: string
  /** One author by name, or a list of authors with an optional website each. */
  author?: string | readonly { name: string; url?: string }[]
  keywords?: readonly string[]
  lang: string
}

export function articleLd(o: ArticleLdInput): Record<string, unknown> {
  const person = (a: { name: string; url?: string }) => compact({ '@type': 'Person', name: a.name, url: a.url })
  return compact({
    '@context': 'https://schema.org',
    '@type': o.type ?? 'Article',
    headline: o.title,
    url: o.url,
    description: o.description,
    image: o.image,
    datePublished: o.published,
    dateModified: o.modified,
    author: typeof o.author === 'string' ? person({ name: o.author }) : o.author?.map(person),
    keywords: o.keywords?.join(', '),
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
