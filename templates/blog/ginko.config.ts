// Blog template: "Field Notes", a personal blog of two writers about nature in and around the city, with posts, tags
// and the authors' pages, in English (main) and German. Every brick reads Markdown from content/ (source: 'files'),
// so the site runs without an account. To write in Ginko Studio later, remove `source: 'files'` from a brick (README,
// "Move to the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { legal, notices, people, posts, site } from '@lupinum/ginko/basics'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

export default defineSite({
  site: 'blog',
  name: 'Field Notes',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'Two friends write about the nature in and around their city: walks, birds, trees, the coast and the notebooks they keep.',
    color: '#4f46e5',
  },
  url: siteUrl('https://example.com'),
  // "Today" for the build: a post dated after it is not published yet (content/posts/, README "Write a post").
  timeZone: 'Europe/Berlin',
  locales,
  languages: { en: 'en-GB', de: 'de-DE' },
  // Required by Ginko; the blog shows no prices.
  currency: 'EUR',
  pages: {
    home: localized('/'),
    // The list of all posts (app/pages/news/index.vue, from the blog feature) and the authors (app/pages/team.vue,
    // from the people feature). A tag's page is under the posts: /posts/topics/<tag> (app/routes.ts, `tags`).
    news: localized('/posts'),
    team: localized('/about'),
  },
  bricks: {
    // The line at the top of the home page: what the blog is about (content/home.md).
    home: single({
      label: { en: 'Home page', de: 'Startseite', fr: 'Page d’accueil' },
      source: 'files',
      fields: {
        title: f.text({ en: 'Title', de: 'Titel', fr: 'Titre' }, { max: 80 }),
        lead: f.longtext({ en: 'Lead', de: 'Einleitung', fr: 'Introduction' }, { max: 300 }),
      },
    }),
    // The posts, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never
    // goes online, and a post dated after the day of the build waits for the first build on or after its date.
    // In the Studio, Today lists the drafts and the scheduled posts.
    posts: {
      ...posts({ source: 'files', authors: 'people', route: localized('/posts/[slug]') }),
      drafts: true,
      tasks: [{ id: 'write', kind: 'create', label: { en: 'Write a post', de: 'Beitrag schreiben', fr: 'Écrire un article' } }],
    },
    // The two writers, each with a page that lists their posts (content/people/). No photos: the site shows initials.
    people: people({ source: 'files', route: localized('/about/[slug]'), label: { en: 'Authors', de: 'Autorinnen und Autoren', fr: 'Auteurs' } }),
    // Name and email for the footer and the imprint (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy, terms and imprint at /legal/<slug> (content/legal/).
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Short lines above every page, each until a date (content/notices/).
    notices: notices({ source: 'files' }),
  },
})
