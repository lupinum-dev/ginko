// What content this site has. Bricks with `source: 'files'` read Markdown from content/.
// To let an owner edit a brick on the Ginko platform instead, remove `source`; f.markdown then stores the text on the platform.
import { defineSite, f, single } from '@lupinum/ginko'

export default defineSite({
  site: '{{SITE}}',
  name: '{{SITE}}',
  url: 'https://example.com',
  timezone: 'Europe/Vienna',
  locales: ['en'],
  currency: 'EUR',
  pages: { home: '/' },
  bricks: {
    start: single({
      label: 'Start page',
      source: 'files',
      fields: { title: f.text('Title'), body: f.markdown('Text', { profile: 'basic' }) },
    }),
  },
})
