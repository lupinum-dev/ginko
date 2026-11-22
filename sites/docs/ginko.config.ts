// The Ginko docs. Every page comes from Markdown in content/docs (CONTENT.md); the layout,
// search and components come from @lupinum/ginko-docs. This site never asks the platform.
import { defineSite } from '@lupinum/ginko'
import { blogCollections, blogPages, changelogCollection, changelogPages, components, docsCollection, docsHome } from '@lupinum/ginko-docs/config'

// English is the main language: its pages have no prefix, German lives under /de.
const locales = ['en', 'de'] as const

/**
 * The German slugs of the docs pages as they were at the switch, each with the slug of the German page that has its
 * content now. Until November 2026 these addresses had no prefix (`/docs/einstieg`).
 */
const germanDocs: Record<string, string> = {
  'einstieg': 'einstieg',
  'umstieg': 'umstieg',
  'bausteine': 'bausteine',
  'inhalte-aus-dateien': 'inhalte-aus-dateien',
  'seiten-lesen': 'seiten-lesen',
  'komponenten': 'komponenten',
  'doku-anpassen': 'doku-anpassen',
  'sprachen': 'sprache-hinzufuegen',
  'doku-seiten': 'doku-seite-starten',
  'doku-exporte': 'doku-referenz',
  'seo-und-agenten': 'was-eine-seite-ausliefert',
  'veroeffentlichen': 'auf-vercel-veroeffentlichen',
  'plattform-und-cli': 'cli',
}

/**
 * Pages that the rewrite of November 2026 split into guides and reference pages: the old address goes to the page
 * that now holds most of its content. English first, then the German slug of the same two pages.
 */
const movedDocs: [from: string, to: string, fromDe: string, toDe: string][] = [
  ['languages', 'add-a-language', 'sprachen', 'sprache-hinzufuegen'],
  ['presets', 'ready-made-bricks', 'presets', 'fertige-bausteine'],
  ['seo-and-agents', 'site-output', 'seo-und-agenten', 'was-eine-seite-ausliefert'],
  ['deploy', 'deploy-to-vercel', 'veroeffentlichen', 'auf-vercel-veroeffentlichen'],
  ['platform-and-cli', 'cli', 'plattform-und-cli', 'cli'],
  ['docs-sites', 'start-a-docs-site', 'doku-seiten', 'doku-seite-starten'],
  ['docs-exports', 'docs-site-reference', 'doku-exporte', 'doku-referenz'],
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
  // (internals/migrations.md). The first rule that matches wins, so the moved pages come before `/en/docs/*`.
  redirects: [
    { from: '/en', to: '/' },
    { from: '/en/docs', to: '/docs' },
    ...movedDocs.flatMap(([from, to, fromDe, toDe]) => [
      { from: `/docs/${from}`, to: `/docs/${to}` },
      { from: `/en/docs/${from}`, to: `/docs/${to}` },
      { from: `/de/docs/${fromDe}`, to: `/de/docs/${toDe}` },
    ]),
    { from: '/en/docs/*', to: '/docs/:splat' },
    { from: '/en/blog', to: '/blog' },
    { from: '/en/blog/*', to: '/blog/:splat' },
    { from: '/en/changelog', to: '/changelog' },
    ...Object.entries(germanDocs).map(([slug, now]) => ({ from: `/docs/${slug}`, to: `/de/docs/${now}` })),
    ...['blog-aus-dateien', 'eine-datei-pro-sprache'].map((slug) => ({ from: `/blog/${slug}`, to: `/de/blog/${slug}` })),
  ],
  bricks: { home: docsHome(), docs: docsCollection({ locales }), ...blogCollections({ locales }), changelog: changelogCollection() },
})
