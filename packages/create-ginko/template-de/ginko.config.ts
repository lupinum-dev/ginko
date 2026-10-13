// What content this site has. Bricks with `source: 'files'` read Markdown from content/.
// To let an owner edit a brick on the Ginko platform instead, remove `source`; f.markdown then stores the text on the platform.
import { defineSite, f, single } from '@lupinum/ginko'

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timezone: 'Europe/Vienna', // für dein Land ändern
  locales: ['de'],
  currency: 'EUR', // für dein Land ändern
  pages: { home: '/' },
  // Steht in Suchergebnissen und Link-Vorschauen. Ersetze es durch einen Satz über deine Website.
  seo: { description: 'Eine neue Website mit Ginko.' },
  bricks: {
    start: single({
      label: 'Startseite',
      source: 'files',
      fields: { title: f.text('Titel'), body: f.markdown('Text', { profile: 'basic' }) },
    }),
  },
})
