import { describe, expect, it } from 'vitest'
import { articleLd, breadcrumbLd, faqLd, isPreviewHost, organizationLd, robotsTxt, seoHead, websiteLd, type SeoInput } from '../../src/core/index.ts'

const base: SeoInput = { siteName: 'Site' }

describe('seoHead', () => {
  it('builds title and meta with image and description', () => {
    const head = seoHead({
      siteName: 'Site',
      title: 'About',
      description: 'Desc',
      image: { url: 'https://ex.com/i.png', width: 1200, height: 630, alt: 'Alt' },
    })
    expect(head).toStrictEqual({
      title: 'About · Site',
      meta: [
        { name: 'description', content: 'Desc' },
        { property: 'og:title', content: 'About' },
        { property: 'og:description', content: 'Desc' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Site' },
        { property: 'og:image', content: 'https://ex.com/i.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Alt' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    })
  })

  it.each<[string, string | undefined, string | undefined, string]>([
    ['%s · Site', 'About', undefined, 'About · Site'],
    ['%s · Site', undefined, undefined, 'Site'],
    ['%s · Site', '', undefined, 'Site'],
    ['%s | Docs', 'Pricing', '%s | Docs', 'Pricing | Docs'],
  ])('applies title template %j to title %j', (_label, title, template, expected) => {
    expect(seoHead({ ...base, title, titleTemplate: template }).title).toBe(expected)
  })

  it('noindex sets the robots meta', () => {
    expect(seoHead({ ...base, title: 'Draft', noindex: true }).meta).toContainEqual({ name: 'robots', content: 'noindex, nofollow' })
  })
})

describe('robotsTxt', () => {
  it.each<[string, Parameters<typeof robotsTxt>[0], string]>([
    ['allows all by default', {}, 'User-agent: *\nAllow: /\n'],
    ['adds the sitemap line', { sitemap: 'https://ex.com/sitemap.xml' }, 'User-agent: *\nAllow: /\n\nSitemap: https://ex.com/sitemap.xml\n'],
    ['lists disallow paths', { disallow: ['/admin', '/tmp'] }, 'User-agent: *\nDisallow: /admin\nDisallow: /tmp\n'],
    ['blocks everything under noindex', { noindex: true, sitemap: 'https://ex.com/sitemap.xml' }, 'User-agent: *\nDisallow: /\n'],
  ])('%s', (_label, options, expected) => {
    expect(robotsTxt(options)).toBe(expected)
  })
})

describe('isPreviewHost', () => {
  it.each<[string, string | undefined, boolean]>([
    ['the site host is indexable', 'ex.com', false],
    ['case does not matter', 'EX.com', false],
    ['a Vercel preview is not', 'ex-git-feature-team.vercel.app', true],
    ['www is the same site', 'www.ex.com', false],
    ['localhost with port', 'localhost:3393', true],
    ['a missing host is not trusted', undefined, true],
  ])('%s', (_label, host, expected) => {
    expect(isPreviewHost(host, 'https://ex.com')).toBe(expected)
  })
})

describe('JSON-LD helpers', () => {
  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    [
      'websiteLd',
      websiteLd({ name: 'Site', url: 'https://ex.com', lang: 'de' }),
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site', url: 'https://ex.com', inLanguage: 'de' },
    ],
    [
      'organizationLd without optional fields',
      organizationLd({ name: 'Lupinum', url: 'https://lupinum.com' }),
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Lupinum', url: 'https://lupinum.com' },
    ],
    [
      'breadcrumbLd',
      breadcrumbLd(
        [
          { title: 'Docs', path: '/docs', children: [] },
          { title: 'Setup', path: '/docs/setup', children: [] },
        ],
        'https://ex.com',
      ),
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Docs', item: 'https://ex.com/docs' },
          { '@type': 'ListItem', position: 2, name: 'Setup', item: 'https://ex.com/docs/setup' },
        ],
      },
    ],
    [
      'articleLd with author and date',
      articleLd({ title: 'Hello', url: 'https://ex.com/blog/hello', lang: 'de', published: '2026-01-02', author: 'Romi' }),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Hello',
        url: 'https://ex.com/blog/hello',
        datePublished: '2026-01-02',
        author: { '@type': 'Person', name: 'Romi' },
        inLanguage: 'de',
      },
    ],
    [
      'articleLd with modified (pass item.updatedAt)',
      articleLd({ title: 'Hello', url: 'https://ex.com/blog/hello', lang: 'de', modified: '2026-10-05T09:00:00.000Z' }),
      { '@context': 'https://schema.org', '@type': 'Article', headline: 'Hello', url: 'https://ex.com/blog/hello', dateModified: '2026-10-05T09:00:00.000Z', inLanguage: 'de' },
    ],
    [
      'articleLd without optional fields',
      articleLd({ title: 'Hello', url: 'https://ex.com/blog/hello', lang: 'de' }),
      { '@context': 'https://schema.org', '@type': 'Article', headline: 'Hello', url: 'https://ex.com/blog/hello', inLanguage: 'de' },
    ],
    [
      'faqLd',
      faqLd([{ question: 'Q?', answer: 'A.' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }],
      },
    ],
  ])('%s', (_label, actual, expected) => {
    expect(actual).toStrictEqual(expected)
  })
})
