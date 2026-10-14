// Eine Doku-Seite: Layout, Seitennavigation und Suche kommen aus @lupinum/ginko-docs.
// Jede Seite ist eine Markdown-Datei in content/docs/.
import { defineSite } from '@lupinum/ginko'
import { components, docsCollection } from '@lupinum/ginko-docs/config'

const locales = ['de'] as const

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // für dein Land ändern
  locales,
  currency: 'EUR', // für dein Land ändern
  pages: { home: '/' },
  // Steht in Suchergebnissen und Link-Vorschauen. Ersetze es durch einen Satz über deine Website.
  seo: { description: 'Dokumentation zu unserem Produkt.' },
  components, // die Markdown-Komponenten (::callout, ::tabs …) und ihre geprüften Props
  bricks: { docs: docsCollection({ locales }) },
})
