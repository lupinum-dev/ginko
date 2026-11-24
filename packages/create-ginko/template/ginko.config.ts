// What content this site has. Every brick reads Markdown from content/.
// To let an owner edit a brick on the Ginko platform instead, name it in `studio.bricks` (`bricks: ['start']`); f.markdown then stores the text on the platform.
// Then give the single's required fields a `default` or make them optional (`f.markdown`, `f.image` and `f.file` cannot have a default, so set `optional: true` on them).
import { defineSite, f, single } from '@lupinum/ginko'

export default defineSite({
  name: '{{SITE}}',
  studio: { id: '{{SITE}}', bricks: [] }, // the site's id on a Ginko platform; no brick is edited there yet
  url: 'https://example.com',
  timeZone: 'Europe/Vienna', // change for your country
  locales: ['en'],
  currency: 'EUR', // change for your country
  pages: { home: '/' },
  // Shown in search results and link previews. Replace it with one sentence about your site.
  // `color`: the brand colour of the generated share cards.
  seo: { description: 'A new website built with Ginko.', color: '#1f2937' },
  bricks: {
    start: single({
      label: 'Start page',
      body: 'body',
      fields: { title: f.text('Title'), body: f.markdown('Text', { profile: 'basic' }) },
    }),
  },
})
