// Garden demo: a neutral English site with pages, posts, events and a notice banner, on the generic Ginko API.
// Every brick reads Markdown from content/ (source: 'files'), so the site runs without an account.
// To let editors change a brick in Ginko Studio instead, remove `source: 'files'` from it.
import { collection, defineSite, f, single } from '@lupinum/ginko'

export default defineSite({
  site: 'garden',
  name: 'Greenfield Community Garden',
  seo: { description: 'A neighbourhood garden where anyone can grow food, learn and meet.' },
  url: 'https://example.com',
  timezone: 'Europe/London',
  locales: ['en'],
  languages: { en: 'en-GB' },
  currency: 'GBP',
  pages: {
    home: '/',
    posts: '/posts',
    events: '/events',
  },
  bricks: {
    // Name, contact details and links. One entry, used in the header and footer.
    settings: single({
      label: 'Site settings',
      source: 'files',
      fields: {
        siteName: f.text('Site name', { max: 60 }),
        tagline: f.text('Tagline', { max: 120 }),
        email: f.text('Contact email', { format: 'email', optional: true }),
        address: f.longtext('Address', { max: 300, optional: true }),
        social: f.list('Social links', {
          itemLabel: 'Link',
          fields: {
            label: f.text('Label', { max: 40 }),
            url: f.text('Address of the link', { format: 'url' }),
          },
          max: 8, default: [],
        }),
      },
    }),
    // A short banner on the home page. Leave the text empty to show nothing.
    notice: single({
      label: 'Notice',
      source: 'files',
      fields: {
        text: f.text('Text', { max: 140, optional: true }),
        until: f.date('Show until', { optional: true }),
      },
    }),
    // Static pages such as About and Contact. Address: /<slug>.
    pages: collection({
      label: 'Pages',
      source: 'files',
      fields: {
        title: f.text('Title', { max: 80 }),
        slug: f.slug('Web address', { from: 'title' }),
        intro: f.longtext('Introduction', { max: 300, optional: true }),
        image: f.image('Image', { optional: true }),
        body: f.markdown('Text', { profile: 'page' }),
      },
      max: 50,
      order: 'manual',
      route: { en: '/[slug]' },
    }),
    posts: collection({
      label: 'Posts',
      source: 'files',
      drafts: true,
      fields: {
        title: f.text('Title', { max: 120 }),
        slug: f.slug('Web address', { from: 'title' }),
        date: f.date('Date'),
        summary: f.longtext('Summary', { max: 300 }),
        cover: f.image('Cover image', { optional: true }),
        tags: f.list('Tags', { itemLabel: 'Tag', fields: { name: f.text('Tag', { max: 30 }) }, max: 10, default: [] }),
        body: f.markdown('Text', { profile: 'rich' }),
      },
      max: 500,
      order: { field: 'date', dir: 'desc' },
      route: { en: '/posts/[slug]' },
    }),
    // Past events drop out of the list by themselves.
    events: collection({
      label: 'Events',
      source: 'files',
      fields: {
        title: f.text('Title', { max: 120 }),
        slug: f.slug('Web address', { from: 'title' }),
        when: f.daterange('When'),
        place: f.text('Place', { max: 120 }),
        description: f.markdown('Description', { profile: 'basic' }),
      },
      max: 100,
      order: { field: 'when', dir: 'asc' },
      visible: { mode: 'until', field: 'when' },
      route: { en: '/events/[slug]' },
    }),
  },
})
