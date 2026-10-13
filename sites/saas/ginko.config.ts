// Taktwerk (Zeiterfassung für Handwerksbetriebe, Berlin/Zürich): demo 2 in DEMOS.md. All content is invented.
import { collection, defineSite, f, single } from '@lupinum/ginko'


export default defineSite({
  site: 'saas',
  name: 'Taktwerk',
  url: 'https://ginko-demo-saas.vercel.app',
  timezone: 'Europe/Berlin',
  locales: ['de', 'en', 'fr'],
  languages: { de: 'de-DE', en: 'en-GB', fr: 'fr-FR' },
  currency: 'EUR',
  pages: {
    home: { de: '/', en: '/en', fr: '/fr' },
    pricing: { de: '/preise', en: '/en/pricing', fr: '/fr/tarifs' },
    changelog: { de: '/changelog', en: '/en/changelog', fr: '/fr/changelog' },
    blog: { de: '/blog', en: '/en/blog', fr: '/fr/blog' },
    faq: { de: '/faq', en: '/en/faq', fr: '/fr/faq' },
    terms: { de: '/agb', en: '/en/terms', fr: '/fr/conditions' },
    dpa: { de: '/avv', en: '/en/dpa', fr: '/fr/sous-traitance' },
    privacy: { de: '/datenschutz', en: '/en/privacy', fr: '/fr/confidentialite' },
    imprint: { de: '/impressum', en: '/en/imprint', fr: '/fr/mentions-legales' },
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
      label: 'Preise',
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
      max: 6,
      order: 'manual',
      tasks: [
        { id: 'add', label: 'Plan hinzufügen', kind: 'create' },
        { id: 'price', label: 'Preis ändern', kind: 'edit', pick: true, fields: ['priceEur', 'priceChf', 'yearEur', 'yearChf', 'note'] },
        { id: 'remove', label: 'Plan entfernen', kind: 'remove' },
      ],
    }),
    changelog: collection({
      label: 'Changelog',
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
      max: 300,
      order: { field: 'date', dir: 'desc' },
      tasks: [
        { id: 'add', label: 'Eintrag hinzufügen', kind: 'create' },
        { id: 'edit', label: 'Eintrag bearbeiten', kind: 'edit', pick: true, fields: ['version', 'date', 'tags', 'body'] },
        { id: 'remove', label: 'Eintrag entfernen', kind: 'remove' },
      ],
    }),
    blog: collection({
      label: 'Blog',
      fields: {
        title: f.text('Titel', { max: 120 }),
        slug: f.slug('Adresse', { from: 'title' }),
        date: f.date('Datum'),
        author: f.text('Autorin oder Autor', { max: 80, translate: false }),
        description: f.text('Kurzbeschreibung für Suchmaschinen', { max: 160 }),
        image: f.image('Bild', { optional: true }),
        body: f.markdown('Text', { profile: 'basic', max: 20000 }),
      },
      max: 200,
      order: { field: 'date', dir: 'desc' },
      route: { de: '/blog/[slug]', en: '/en/blog/[slug]', fr: '/fr/blog/[slug]' },
      tasks: [
        { id: 'add', label: 'Artikel schreiben', kind: 'create' },
        { id: 'edit', label: 'Artikel bearbeiten', kind: 'edit', pick: true, fields: ['title', 'slug', 'date', 'author', 'description', 'image', 'body'] },
        { id: 'remove', label: 'Artikel entfernen', kind: 'remove' },
      ],
    }),
    testimonials: collection({
      label: 'Kundenstimmen',
      fields: {
        quote: f.longtext('Zitat', { max: 400 }),
        name: f.text('Name', { max: 80, translate: false }),
        company: f.text('Firma', { max: 80, translate: false }),
        logo: f.image('Logo', { optional: true }),
      },
      max: 30,
      order: 'manual',
      tasks: [
        { id: 'add', label: 'Stimme hinzufügen', kind: 'create' },
        { id: 'edit', label: 'Stimme bearbeiten', kind: 'edit', pick: true, fields: ['quote', 'name', 'company', 'logo'] },
        { id: 'remove', label: 'Stimme entfernen', kind: 'remove' },
      ],
    }),
    faq: collection({
      label: 'Fragen und Antworten',
      fields: {
        question: f.text('Frage', { max: 200 }),
        answer: f.markdown('Antwort', { profile: 'basic', max: 2000 }),
      },
      max: 60,
      order: 'manual',
      tasks: [
        { id: 'add', label: 'Frage hinzufügen', kind: 'create' },
        { id: 'edit', label: 'Frage bearbeiten', kind: 'edit', pick: true, fields: ['question', 'answer'] },
        { id: 'remove', label: 'Frage entfernen', kind: 'remove' },
      ],
    }),
    notices: collection({
      label: 'Ankündigungen',
      fields: {
        text: f.text('Text', { max: 160 }),
        link: f.text('Link', { format: 'url', optional: true }),
        until: f.date('Gilt bis', { optional: true }),
      },
      max: 5,
      order: 'manual',
      visible: { mode: 'until', field: 'until', deleteExpired: true },
      tasks: [
        { id: 'add', label: 'Ankündigung hinzufügen', kind: 'create' },
        { id: 'remove', label: 'Ankündigung entfernen', kind: 'remove' },
      ],
    }),
    // Address of the company for the footer and the imprint page; rare to change, found in Alles bearbeiten.
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
      fields: {
        terms: f.markdown('AGB', { profile: 'basic', translate: 'manual', optional: true }),
        avv: f.markdown('AVV', { profile: 'basic', translate: 'manual', optional: true }),
        privacy: f.markdown('Datenschutz', { profile: 'basic', translate: 'manual', optional: true }),
        // Required on a German site (DDG §5); like the other legal texts never machine-translated.
        imprint: f.markdown('Impressum', { profile: 'basic', translate: 'manual', optional: true }),
      },
      tasks: [{ id: 'terms', label: 'AGB ändern', kind: 'edit', fields: ['terms'] }],
    }),
  },
})
