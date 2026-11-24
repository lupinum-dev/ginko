// Taktwerk (Zeiterfassung für Handwerksbetriebe, Berlin/Zürich): demo 2 in DEMOS.md. All content is invented.
import { collection, defineSite, f, single } from '@lupinum/ginko'

export default defineSite({
  name: 'Taktwerk',
  url: 'https://ginko-demo-saas.vercel.app',
  timeZone: 'Europe/Berlin',
  locales: ['de', 'en', 'fr'],
  languages: { de: 'de-DE', en: 'en-GB', fr: 'fr-FR' },
  currency: 'EUR',
  studio: { id: 'saas', bricks: 'all' },
  pages: {
    home: '/',
    pricing: { de: '/preise', en: '/pricing', fr: '/tarifs' },
    changelog: '/changelog',
    blog: '/blog',
    faq: '/faq',
    terms: { de: '/agb', en: '/terms', fr: '/conditions' },
    dpa: { de: '/avv', en: '/dpa', fr: '/sous-traitance' },
    privacy: { de: '/datenschutz', en: '/privacy', fr: '/confidentialite' },
    imprint: { de: '/impressum', en: '/imprint', fr: '/mentions-legales' },
  },
  entries: {
    blog: '/blog/[slug]',
  },
  bricks: {
    hero: single({
      label: 'Startseite',
      fields: {
        headline: f.text('Überschrift', { max: 120, default: { de: 'Zeiterfassung für Handwerksbetriebe' } }),
        text: f.longtext('Text', { max: 400, default: { de: 'Taktwerk erfasst Arbeitszeiten auf der Baustelle, auch ohne Netz.' } }),
        buttonText: f.text('Knopf-Text', { max: 40, default: { de: 'Kostenlos testen' } }),
        buttonUrl: f.text('Knopf-Link', { format: 'url', default: 'https://app.taktwerk.example/start' }),
      },
    }),
    features: single({
      label: 'Funktionen',
      fields: {
        headline: f.text('Überschrift', { max: 120, optional: true }),
        items: f.list('Funktionen', {
          itemLabel: 'Funktion',
          fields: {
            title: f.text('Titel', { max: 80 }),
            text: f.longtext('Text', { max: 300 }),
          },
          max: 12, default: [],
        }),
      },
    }),
    pricing: collection({
      preview: 'pricing',
      listing: { title: 'name' },
      untranslated: 'fallback',
      label: 'Preise',
      item: 'Plan',
      max: 6,
      fields: {
        name: f.text('Plan', { max: 40, translate: false }),
        priceEur: f.money('Preis je Monat (EUR)', { currency: 'EUR' }),
        priceChf: f.money('Preis je Monat (CHF)', { currency: 'CHF' }),
        yearEur: f.money('Preis je Jahr (EUR)', { currency: 'EUR', optional: true }),
        yearChf: f.money('Preis je Jahr (CHF)', { currency: 'CHF', optional: true }),
        featured: f.boolean('Als beliebt markieren'),
        features: f.list('Funktionen', { itemLabel: 'Funktion', fields: { text: f.text('Funktion', { max: 120 }) }, max: 20 }),
        note: f.text('Hinweis zum Preis', { max: 120, optional: true }),
      },
      tasks: ['add', { id: 'price', label: 'Preis ändern', fields: ['priceEur', 'priceChf', 'yearEur', 'yearChf', 'note'] }, 'remove'],
    }),
    changelog: collection({
      preview: 'changelog',
      listing: { title: 'version', detail: 'date' },
      untranslated: 'fallback',
      label: 'Changelog',
      max: 300,
      fields: {
        version: f.text('Version', { max: 20, translate: false }),
        date: f.date('Datum'),
        tags: f.choices('Art', {
          options: [
            { value: 'new', label: 'Neu' }, { value: 'improved', label: 'Verbessert' }, { value: 'fixed', label: 'Behoben' },
          ],
          max: 3,
        }),
        body: f.markdown('Text', { profile: 'basic', max: 5000 }),
      },
      order: { field: 'date', dir: 'desc' },
      tasks: ['add', 'edit', 'remove'],
    }),
    blog: collection({
      listing: { title: 'title', detail: 'date' },
      untranslated: 'hide',
      label: 'Blog',
      item: 'Artikel',
      max: 200,
      fields: {
        title: f.text('Titel', { max: 120 }),
        slug: f.slug('Adresse', { from: 'title' }),
        date: f.date('Datum'),
        author: f.text('Autorin oder Autor', { max: 80, translate: false }),
        description: f.text('Kurzbeschreibung für Suchmaschinen', { max: 160 }),
        image: f.image('Bild', { optional: true }),
        body: f.markdown('Text', { profile: 'basic', max: 20000 }),
      },
      order: { field: 'date', dir: 'desc' },
      // This blog lets the owner change the address of an article, so its edit task names the fields.
      tasks: [
        { id: 'add', label: 'Artikel schreiben' },
        { id: 'edit', fields: ['title', 'slug', 'date', 'author', 'description', 'image', 'body'] },
        'remove',
      ],
    }),
    testimonials: collection({
      listing: { title: 'quote' },
      untranslated: 'fallback',
      label: 'Kundenstimmen',
      item: 'Stimme',
      max: 30,
      fields: {
        quote: f.longtext('Zitat', { max: 400 }),
        name: f.text('Name', { max: 80, translate: false }),
        company: f.text('Firma', { max: 80, translate: false }),
        logo: f.image('Logo', { optional: true }),
      },
      tasks: ['add', 'edit', 'remove'],
    }),
    faq: collection({
      preview: 'faq',
      listing: { title: 'question' },
      untranslated: 'fallback',
      label: 'Fragen und Antworten',
      item: 'Frage',
      max: 60,
      fields: {
        question: f.text('Frage', { max: 200 }),
        answer: f.markdown('Antwort', { profile: 'basic', max: 2000 }),
      },
      tasks: ['add', 'edit', 'remove'],
    }),
    notices: collection({
      listing: { title: 'text', detail: 'until' },
      untranslated: 'fallback',
      label: 'Ankündigungen',
      item: 'Ankündigung',
      max: 5,
      fields: {
        text: f.text('Text', { max: 160 }),
        link: f.text('Link', { format: 'url', optional: true }),
        until: f.date('Gilt bis', { optional: true }),
      },
      showUntil: { field: 'until', thenDelete: true },
      tasks: ['add', 'remove'],
    }),
    // Address of the company for the footer and the imprint page; rare to change, so it has no task.
    company: single({
      label: 'Firma und Adresse',
      fields: {
        name: f.text('Firmenname', { max: 80, translate: false, default: 'Taktwerk GmbH' }),
        street: f.text('Straße und Hausnummer', { max: 80, translate: false, default: 'Wiener Straße 18' }),
        city: f.text('PLZ und Ort', { max: 80, translate: false, default: '10999 Berlin' }),
        email: f.text('E-Mail', { format: 'email', default: 'hallo@taktwerk.example' }),
        phone: f.text('Telefon', { format: 'tel', optional: true }),
      },
    }),
    legal: single({
      label: 'Rechtliches',
      // 30,000 characters each: four texts in three languages at the default max (50,000) would not fit the entry limit.
      fields: {
        terms: f.markdown('AGB', { profile: 'basic', translate: 'manual', optional: true, max: 30_000 }),
        avv: f.markdown('AVV', { profile: 'basic', translate: 'manual', optional: true, max: 30_000 }),
        privacy: f.markdown('Datenschutz', { profile: 'basic', translate: 'manual', optional: true, max: 30_000 }),
        // Required on a German site (DDG §5); like the other legal texts never machine-translated.
        imprint: f.markdown('Impressum', { profile: 'basic', translate: 'manual', optional: true, max: 30_000 }),
      },
      tasks: [{ id: 'terms', label: 'AGB ändern', fields: ['terms'] }],
    }),
  },
})
