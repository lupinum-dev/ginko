// SaaS template: a small German software company with a web app for planning shifts in care homes and small clinics:
// what the product does on the home page, the plans with their prices, the changelog, questions and answers, a blog,
// customer logos and a quote, security and data facts, and legal texts, in English (main), German and French. Every
// brick reads Markdown from content/ (source: 'files'), so the site runs without an account and can be built as static
// files. To let the team change a brick in Ginko Studio later, remove `source: 'files'` from it (README, "Move to
// the Studio").
import { defineSite, f, single } from '@lupinum/ginko'
import { changelog, faq, legal, notices, people, posts, site } from '@lupinum/ginko/basics'
import { components, docsCollection } from '@lupinum/ginko-docs/config'
import { logos, quotes } from './app/bricks/logos-quotes.ts'
import { pages } from './app/bricks/pages.ts'
import { pricing } from './app/bricks/pricing.ts'
import { locales, localized } from './app/routes.ts'
import { siteUrl } from './site-url.ts'

/** A short title and one or two sentences, for the lists of the home page. */
const point = {
  title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 60 }),
  text: f.longtext({ de: 'Text', en: 'Text', fr: 'Texte' }, { max: 240 }),
}

export default defineSite({
  site: 'saas',
  name: 'Planwerk',
  // `color` fills the share cards: the light `--brand` of app/assets/css/main.css.
  seo: {
    description: 'Planwerk is a web app for planning shifts in care homes and small clinics: rota, rule checks, swaps and hours for payroll, hosted in Germany.',
    color: '#6d28d9',
  },
  url: siteUrl('https://example.com'),
  timeZone: 'Europe/Berlin',
  // `addressCountry` in the Organization JSON-LD.
  country: 'DE',
  locales,
  languages: { en: 'en-GB', de: 'de-DE', fr: 'fr-FR' },
  // The currency of the plans' prices.
  currency: 'EUR',
  pages: {
    home: localized('/'),
    pricing: localized('/pricing'),
    changelog: localized('/changelog'),
    news: localized('/news'),
    faq: localized('/faq'),
    help: localized('/help'),
  },
  // The order of the bricks is the order of the Studio's Today page: the weekly changelog entry first, then the
  // notice, the prices and the questions.
  components,
  bricks: {
    // The help center (content/docs/, pages from @lupinum/ginko-docs) at /help; app/pages/help/index.vue is its start page.
    docs: docsCollection({ locales, base: '/help' }),
    // One file per release (content/changelog/), newest first: version, date and the text, which starts with one
    // sentence (the summary on the home page and in the feed), then `<!-- more -->`, then the changes under the
    // headings New, Improved and Fixed. In the Studio, Today shows how old the newest entry is.
    changelog: {
      ...changelog({ source: 'files' }),
      status: { age: 'date' },
      tasks: [
        { id: 'add', kind: 'create', label: { de: 'Änderung eintragen', en: 'Add a release', fr: 'Ajouter une version' } },
        { id: 'edit', kind: 'edit', pick: true, fields: ['version', 'date', 'body'], label: { de: 'Eintrag bearbeiten', en: 'Edit a release', fr: 'Modifier une version' } },
      ],
    },
    // Short lines at the top of every page ("New in 4.6: …"), each until a date (content/notices/).
    notices: notices({ source: 'files' }),
    // The plans, each with a price per month and per year in `currency`, or "on request" (content/pricing/).
    pricing: pricing({ source: 'files' }),
    // Questions and answers: billing, cancellation, data export, data location (content/faq/).
    faq: faq({ source: 'files' }),
    // The first screen of the home page and its lists (content/home.md): what the product does and for whom, the link
    // to the free trial in the app, a picture of the product, its main features and the facts about security and data.
    home: single({
      label: { de: 'Startseite', en: 'Home page', fr: 'Page d’accueil' },
      source: 'files',
      fields: {
        title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 100, default: 'Welcome' }),
        lead: f.longtext({ de: 'Einleitung', en: 'Lead', fr: 'Introduction' }, { max: 300, default: 'A short introduction: who you are and what you offer.' }),
        image: f.image({ de: 'Bild des Produkts', en: 'Picture of the product', fr: 'Image du produit' }, { optional: true }),
        trialUrl: f.text({ de: 'Link zum kostenlosen Test', en: 'Link to the free trial', fr: 'Lien vers l’essai gratuit' }, {
          format: 'url',
          translate: false,
          default: 'https://app.planwerk.example/signup',
          hint: { de: 'Die Anmeldeseite der App.', en: 'The sign-up page of the app.', fr: 'La page d’inscription de l’application.' },
        }),
        features: f.list({ de: 'Funktionen', en: 'Features', fr: 'Fonctionnalités' }, { max: 6, itemLabel: { de: 'Funktion', en: 'Feature', fr: 'Fonctionnalité' }, fields: point, default: [] }),
        facts: f.list({ de: 'Sicherheit und Daten', en: 'Security and data', fr: 'Sécurité et données' }, { max: 4, itemLabel: { de: 'Punkt', en: 'Fact', fr: 'Point' }, fields: point, default: [] }),
      },
    }),
    // Legal name, address, register entry, VAT number, phone and email for the footer, the imprint, the email of the
    // plan on request and the Organization JSON-LD (content/site.md).
    site: site({ source: 'files' }),
    // Privacy policy, terms of service and imprint: one file per text in content/legal/.
    legal: legal({ source: 'files', route: localized('/legal/[slug]') }),
    // Product news, newest first (content/posts/). `authors` names entries of `people`. A file with `draft: true` never
    // goes online. In the Studio, "Write a post" on Today.
    posts: {
      ...posts({ source: 'files', authors: 'people', route: localized('/news/[slug]') }),
      drafts: true,
      tasks: [{ id: 'write', kind: 'create', label: { de: 'Beitrag schreiben', en: 'Write a post', fr: 'Écrire un article' } }],
    },
    // The people who write the posts (content/people/). No photos: the site shows initials.
    people: people({ source: 'files' }),
    // Customer logos on the home page (content/logos/, the files in public/logos/).
    logos: logos({ source: 'files' }),
    // What customers say, on the home page (content/quotes/), with their permission.
    quotes: quotes({ source: 'files' }),
    // Security, about us, contact and any other page (content/pages/).
    pages: pages({ route: localized('/[slug]'), source: 'files' }),
  },
})
