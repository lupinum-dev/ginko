// The Ginko docs. Every page comes from Markdown in content/docs; the layout,
// search and components come from @lupinum/ginko-docs. This site never asks the platform.
import { defineSite, extend } from '@lupinum/ginko'
import { blogCollections, changelogCollection, components, docsCollection, docsHome } from '@lupinum/ginko-docs/config'

// The docs are in English only.
const locales = ['en'] as const

/**
 * Until 23 November 2026 the docs had German pages under /de: the slug of each German page, with the slug of the
 * English page that has its content (internals/migrations.md).
 */
const germanDocs: Record<string, string> = {
  'adressen-uebersetzen': 'translate-addresses',
  'aktualisieren': 'upgrade',
  'auf-vercel-veroeffentlichen': 'deploy-to-vercel',
  'aufgaben-fuer-inhaber': 'tasks-for-owners',
  'baustein-auf-die-plattform': 'move-a-brick-to-the-platform',
  'bausteine': 'bricks',
  'bilder': 'images',
  'bundles': 'bundles',
  'buttons-und-beschriftungen-uebersetzen': 'translate-buttons-and-labels',
  'cli': 'cli',
  'create-ginko': 'create-ginko',
  'dateien-oder-plattform': 'files-or-platform',
  'define-site': 'define-site',
  'doku-anpassen': 'docs-theming',
  'doku-blog-und-changelog': 'docs-blog-and-changelog',
  'doku-in-bestehender-seite': 'docs-in-an-existing-site',
  'doku-referenz': 'docs-site-reference',
  'doku-seite-starten': 'start-a-docs-site',
  'eigene-komponente': 'add-your-own-component',
  'einstieg': 'getting-started',
  'eintraege-auf-zeit': 'timed-entries',
  'eintragsseiten': 'entry-pages',
  'entwuerfe': 'drafts',
  'export-und-backup': 'export-and-backup',
  'fehlende-inhalte': 'missing-content',
  'fehlende-uebersetzungen': 'missing-translations',
  'fehler': 'errors',
  'feldtypen': 'field-types',
  'fertige-bausteine': 'ready-made-bricks',
  'filtern-und-sortieren': 'filter-and-sort',
  'gegen-die-plattform-entwickeln': 'develop-against-the-platform',
  'geld-datum-heute': 'money-dates-today',
  'grenzen': 'limits',
  'i18n-apps-hinter-login': 'i18n-apps-behind-a-login',
  'i18n-bibliotheken': 'i18n-library-messages',
  'i18n-referenz': 'i18n-reference',
  'i18n-schnellstart': 'i18n-quick-start',
  'i18n-server-routen': 'i18n-server-routes',
  'i18n-von-nuxtjs-i18n': 'i18n-from-nuxtjs-i18n',
  'inhalte-aus-dateien': 'content-from-files',
  'inhalte-in-dateien-schreiben': 'write-content-in-files',
  'inhalte-in-einer-seite-lesen': 'read-content-in-a-page',
  'inhalte-modellieren': 'model-your-content',
  'inhalte-vorausplanen': 'plan-content-ahead',
  'komponente-kopieren': 'copy-a-component',
  'komponenten': 'components',
  'komponenten-api': 'components-api',
  'komponenten-code': 'components-code',
  'komponenten-einrichten': 'set-up-components',
  'komponenten-formeln-und-diagramme': 'components-formulas-and-diagrams',
  'komponenten-gestalten': 'theme-the-components',
  'komponenten-hinweise': 'components-notices',
  'komponenten-interaktiv': 'components-interactive',
  'komponenten-layout': 'components-layout',
  'komponenten-lernen': 'components-learning',
  'komponenten-medien': 'components-media',
  'komponenten-text': 'components-text',
  'plattform-fuer-inhaber': 'platform-for-owners',
  'restaurant-referenz': 'restaurant-reference',
  'restaurant-seite': 'restaurant-site',
  'schema-aenderung-freigeben': 'release-a-schema-change',
  'schemas-wachsen-nur': 'schemas-only-grow',
  'seite-umziehen': 'move-a-page',
  'seite-von-hand-bauen': 'tutorial',
  'seiten-fuer-agenten': 'pages-for-agents',
  'seiten-lesen': 'reading-content',
  'sprache-hinzufuegen': 'add-a-language',
  'sprachwechsel': 'language-switch',
  'statische-seite-bauen': 'static-site',
  'strukturierte-daten': 'structured-data',
  'suche': 'site-search',
  'templates': 'templates',
  'titel-und-teilen-karten': 'titles-and-share-cards',
  'umgebungsvariablen': 'environment-variables',
  'umstieg': 'switching',
  'unuebersetzten-text-kennzeichnen': 'mark-untranslated-text',
  'versionen-und-changelog': 'versions-and-changelog',
  'was-eine-seite-ausliefert': 'site-output',
  'was-ginko-ist': 'what-ginko-is',
  'was-markdown-enthalten-darf': 'what-markdown-may-contain',
  'zwischen-seiten-verlinken': 'link-between-pages',
}

/**
 * Pages that the rewrite of November 2026 split into guides and reference pages, or that a later page absorbed: the old
 * slug, the slug of the page that now holds most of its content, and the German slug the old page had.
 */
const movedDocs: [from: string, to: string, fromDe: string][] = [
  ['languages', 'add-a-language', 'sprachen'],
  ['presets', 'ready-made-bricks', 'presets'],
  ['seo-and-agents', 'site-output', 'seo-und-agenten'],
  ['deploy', 'deploy-to-vercel', 'veroeffentlichen'],
  ['platform-and-cli', 'cli', 'plattform-und-cli'],
  ['docs-sites', 'start-a-docs-site', 'doku-seiten'],
  ['docs-exports', 'docs-site-reference', 'doku-exporte'],
  // "Build a site by hand" became chapter 1 of the tutorial (23 November 2026).
  ['build-a-site-by-hand', 'tutorial', 'seite-von-hand-bauen'],
]

/** Every German slug the docs ever had, with the slug of its English page. */
const german: Record<string, string> = { ...germanDocs, ...Object.fromEntries(movedDocs.map(([, to, fromDe]) => [fromDe, to])) }

/** Until 21 November 2026 German was the main language: these German pages had no prefix (`/docs/einstieg`). */
const germanFirst = ['einstieg', 'umstieg', 'bausteine', 'inhalte-aus-dateien', 'seiten-lesen', 'komponenten', 'doku-anpassen', 'sprachen', 'doku-seiten', 'doku-exporte', 'seo-und-agenten', 'veroeffentlichen', 'plattform-und-cli']

/** The two German posts, with the slug of the English post. */
const germanPosts: Record<string, string> = { 'blog-aus-dateien': 'blog-from-files', 'eine-datei-pro-sprache': 'one-file-per-language' }

export default defineSite({
  studio: { id: 'ginko-docs', bricks: [] },
  name: 'Ginko',
  url: 'https://ginko.lupinum.com',
  timeZone: 'Europe/Vienna',
  // The site's week: the calendar starts on firstDay, and workdays are the days you work.
  week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] },
  locales,
  currency: 'EUR',
  pages: { home: '/', blog: '/blog', changelog: '/changelog' },
  entries: { docs: '/docs/[slug]', posts: '/blog/[slug]' },
  // The share cards: the leaf logo on the docs' emerald.
  seo: { color: '#047857', organization: { logo: '/logo.svg' } },
  components,
  // Old addresses (internals/migrations.md). The first rule that matches wins, so the moved pages come before
  // `/en/docs/*`. Every rule leads straight to an English page.
  redirects: [
    // Until 21 November 2026 English lived under /en.
    { from: '/en', to: '/' },
    { from: '/en/docs', to: '/docs' },
    ...movedDocs.flatMap(([from, to]) => [
      { from: `/docs/${from}`, to: `/docs/${to}` },
      { from: `/en/docs/${from}`, to: `/docs/${to}` },
    ]),
    { from: '/en/docs/*', to: '/docs/:splat' },
    { from: '/en/blog', to: '/blog' },
    { from: '/en/blog/*', to: '/blog/:splat' },
    { from: '/en/changelog', to: '/changelog' },
    // The German pages: under /de until 23 November 2026, some without a prefix before 21 November.
    { from: '/de', to: '/' },
    { from: '/de/docs', to: '/docs' },
    ...Object.entries(german).map(([slug, english]) => ({ from: `/de/docs/${slug}`, to: `/docs/${english}` })),
    ...germanFirst.map((slug) => ({ from: `/docs/${slug}`, to: `/docs/${german[slug]}` })),
    { from: '/de/blog', to: '/blog' },
    { from: '/de/blog/rss.xml', to: '/blog/rss.xml' },
    ...Object.entries(germanPosts).flatMap(([slug, english]) => [
      { from: `/de/blog/${slug}`, to: `/blog/${english}` },
      { from: `/blog/${slug}`, to: `/blog/${english}` },
    ]),
    { from: '/de/changelog', to: '/changelog' },
  ],
  bricks: { home: docsHome(), docs: docsCollection(), ...blogCollections(), changelog: extend(changelogCollection(), { preview: 'changelog' }) },
})
