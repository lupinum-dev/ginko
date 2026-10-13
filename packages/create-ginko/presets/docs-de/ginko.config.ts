// Eine Doku-Seite: Layout, Seitennavigation und Suche kommen aus @lupinum/ginko-docs.
// Jede Seite ist eine Markdown-Datei in content/docs/.
import { defineSite } from '@lupinum/ginko'
import { docsCollection } from '@lupinum/ginko-docs/config'
import { components } from '@lupinum/ginko-components/registry'

const locales = ['de'] as const

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales,
  currency: 'EUR',
  pages: { home: '/' },
  components, // die Markdown-Komponenten (::callout, ::tabs …) und ihre geprüften Props
  bricks: { docs: docsCollection({ locales }) },
})
