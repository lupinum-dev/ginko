// What content this site has. Every brick reads Markdown from content/.
// To let an owner edit a brick on the Ginko platform instead, name it in `studio.bricks` (`bricks: ['start']`); f.markdown then stores the text on the platform.
// Then give the single's required fields a `default` or make them optional (`f.markdown`, `f.image` and `f.file` cannot have a default, so set `optional: true` on them).
import { defineSite, f, single } from '@lupinum/ginko'

export default defineSite({
  name: '{{SITE}}',
  studio: { id: '{{SITE}}', bricks: [] }, // die Kennung der Website auf einer Ginko-Plattform; noch kein Baustein wird dort bearbeitet
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // für dein Land ändern
  locales: ['de'],
  currency: 'EUR', // für dein Land ändern
  pages: { home: '/' },
  // Steht in Suchergebnissen und Link-Vorschauen. Ersetze es durch einen Satz über deine Website.
  seo: { description: 'Eine neue Website mit Ginko.' },
  bricks: {
    start: single({
      label: 'Startseite',
      body: 'body',
      fields: { title: f.text('Titel'), body: f.markdown('Text', { profile: 'basic' }) },
    }),
  },
})
