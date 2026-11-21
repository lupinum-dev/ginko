// The Ginko docs. Every page comes from Markdown in content/docs (CONTENT.md); the layout,
// search and components come from @lupinum/ginko-docs. This site never asks the platform.
import { defineSite } from '@lupinum/ginko'
import { blogCollections, blogPages, changelogCollection, changelogPages, components, docsCollection, docsHome } from '@lupinum/ginko-docs/config'

// English is the main language: its pages have no prefix, German lives under /de.
const locales = ['en', 'de'] as const

/** The German slugs of the docs pages as they were at the switch, for the redirects below. */
const germanDocs = [
  'einstieg', 'umstieg', 'bausteine', 'inhalte-aus-dateien', 'seiten-lesen', 'sprachen', 'komponenten', 'doku-seiten',
  'seo-und-agenten', 'veroeffentlichen', 'plattform-und-cli', 'doku-exporte', 'doku-anpassen',
]

export default defineSite({
  site: 'ginko-docs',
  name: 'Ginko',
  url: 'https://ginko.lupinum.com',
  timeZone: 'Europe/Vienna',
  locales,
  currency: 'EUR',
  pages: { home: { en: '/', de: '/de' }, blog: blogPages({ locales }), changelog: changelogPages({ locales }) },
  // The share cards: the leaf logo on the docs' emerald.
  seo: { color: '#047857', organization: { logo: '/logo.svg' } },
  components,
  // Until November 2026 German was the main language: English lived under /en, German had no prefix
  // (internals/migrations.md). German `presets` has the same slug as English, so `/docs/presets` needs no rule.
  redirects: [
    { from: '/en', to: '/' },
    { from: '/en/docs', to: '/docs' },
    { from: '/en/docs/*', to: '/docs/:splat' },
    { from: '/en/blog', to: '/blog' },
    { from: '/en/blog/*', to: '/blog/:splat' },
    { from: '/en/changelog', to: '/changelog' },
    ...germanDocs.map((slug) => ({ from: `/docs/${slug}`, to: `/de/docs/${slug}` })),
    ...['blog-aus-dateien', 'eine-datei-pro-sprache'].map((slug) => ({ from: `/blog/${slug}`, to: `/de/blog/${slug}` })),
  ],
  bricks: { home: docsHome(), docs: docsCollection({ locales }), ...blogCollections({ locales }), changelog: changelogCollection() },
})
