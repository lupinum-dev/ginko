// Brunner Präzisionstechnik GmbH (Steyr, AT): demo 1 in DEMOS.md. All content is invented.
import { collection, defineSite, f, single } from '@lupinum/ginko'

const weekdays = [
  { value: 'mo', label: 'Montag' }, { value: 'tu', label: 'Dienstag' }, { value: 'we', label: 'Mittwoch' },
  { value: 'th', label: 'Donnerstag' }, { value: 'fr', label: 'Freitag' }, { value: 'sa', label: 'Samstag' },
  { value: 'su', label: 'Sonntag' },
] as const


// Row IDs in defaults are fixed so every fresh site starts with the same, stable rows.
const weekDefault = weekdays.map((d) => ({
  _id: `wk${d.value}000000`,
  day: d.value,
  closed: d.value === 'sa' || d.value === 'su',
  ...(d.value === 'sa' || d.value === 'su' ? {} : { from1: '07:00', to1: '12:00', from2: '12:30', to2: '16:00' }),
}))

export default defineSite({
  site: 'industrie',
  name: 'Brunner Präzisionstechnik GmbH',
  url: 'https://ginko-demo-industrie.vercel.app',
  timeZone: 'Europe/Vienna',
  locales: ['de', 'en'],
  languages: { de: 'de-AT', en: 'en-GB' },
  currency: 'EUR',
  pages: {
    home: { de: '/', en: '/en' },
    news: { de: '/aktuelles', en: '/en/news' },
    products: { de: '/produkte', en: '/en/products' },
    careers: { de: '/karriere', en: '/en/careers' },
    events: { de: '/messen', en: '/en/events' },
    contact: { de: '/kontakt', en: '/en/contact' },
    certificates: { de: '/zertifikate', en: '/en/certificates' },
    imprint: { de: '/impressum', en: '/en/imprint' },
    privacy: { de: '/datenschutz', en: '/en/privacy' },
  },
  bricks: {
    hours: single({
      label: 'Empfang und Erreichbarkeit',
      fields: {
        week: f.list('Wochenplan', {
          itemLabel: 'Tag',
          fields: {
            day: f.choice('Tag', { options: weekdays }),
            closed: f.boolean('Geschlossen'),
            from1: f.time('Vormittag von', { optional: true }),
            to1: f.time('Vormittag bis', { optional: true }),
            from2: f.time('Nachmittag von', { optional: true }),
            to2: f.time('Nachmittag bis', { optional: true }),
          },
          min: 7, max: 7, unique: 'day', default: weekDefault,
        }),
        exceptions: f.list('Betriebsferien und Ausnahmen', {
          itemLabel: 'Ausnahme',
          fields: {
            when: f.daterange('Zeitraum'),
            reason: f.text('Grund', { max: 140 }),
            closed: f.boolean('Geschlossen'),
          },
          max: 20, default: [],
        }),
        closedOn: f.date('Heute geschlossen am', { optional: true }),
        closedNote: f.text('Hinweis zur Schließung', { max: 140, optional: true }),
      },
      tasks: [
        { id: 'closedToday', label: 'Heute geschlossen', kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } },
        { id: 'holiday', label: 'Betriebsferien eintragen', kind: 'edit', fields: ['exceptions'] },
      ],
    }),
    notices: collection({
      label: 'Hinweise',
      fields: {
        text: f.text('Text', { max: 140 }),
        until: f.date('Gilt bis', { optional: true }),
      },
      max: 5,
      order: 'manual',
      visible: { mode: 'until', field: 'until', deleteExpired: true },
      tasks: [
        { id: 'add', label: 'Hinweis hinzufügen', kind: 'create' },
        { id: 'remove', label: 'Hinweis entfernen', kind: 'remove' },
      ],
    }),
    news: collection({
      label: 'Aktuelles und Presse',
      fields: {
        title: f.text('Titel', { max: 120 }),
        slug: f.slug('Adresse', { from: 'title' }),
        date: f.date('Datum'),
        image: f.image('Bild', { optional: true }),
        body: f.markdown('Text', { profile: 'basic', max: 5000 }),
        pressPdf: f.file('Presse-PDF', { accept: ['pdf'], maxBytes: 5 * 1024 * 1024, optional: true }),
      },
      max: 60,
      order: { field: 'date', dir: 'desc' },
      route: { de: '/aktuelles/[slug]', en: '/en/news/[slug]' },
      tasks: [
        { id: 'add', label: 'Beitrag hinzufügen', kind: 'create' },
        { id: 'edit', label: 'Beitrag bearbeiten', kind: 'edit', pick: true, fields: ['title', 'slug', 'date', 'image', 'body', 'pressPdf'] },
        { id: 'remove', label: 'Beitrag entfernen', kind: 'remove' },
      ],
    }),
    jobs: collection({
      label: 'Stellen',
      fields: {
        title: f.text('Titel', { max: 120 }),
        kind: f.choice('Art', {
          options: [
            { value: 'fulltime', label: 'Vollzeit' }, { value: 'parttime', label: 'Teilzeit' }, { value: 'apprenticeship', label: 'Lehre' },
          ],
        }),
        location: f.text('Ort', { max: 80, translate: false }),
        salary: f.money('Gehalt ab (brutto)'),
        salaryPeriod: f.choice('Gehalt pro', { options: [{ value: 'month', label: 'Monat' }, { value: 'year', label: 'Jahr' }] }),
        start: f.date('Eintritt ab', { optional: true }),
        until: f.date('Ausschreibung endet', { optional: true }),
        description: f.markdown('Beschreibung', { profile: 'basic', max: 5000 }),
        applyUrl: f.text('Bewerben-Link', { format: 'url', optional: true }),
        applyEmail: f.text('Bewerben per E-Mail', { format: 'email', optional: true }),
      },
      max: 40,
      order: 'manual',
      visible: { mode: 'until', field: 'until' },
      tasks: [
        { id: 'add', label: 'Stelle ausschreiben', kind: 'create' },
        { id: 'edit', label: 'Stelle bearbeiten', kind: 'edit', pick: true, fields: ['title', 'kind', 'location', 'salary', 'salaryPeriod', 'start', 'until', 'description', 'applyUrl', 'applyEmail'] },
        { id: 'remove', label: 'Stelle entfernen', kind: 'remove' },
      ],
    }),
    events: collection({
      label: 'Messen und Termine',
      fields: {
        title: f.text('Titel', { max: 120 }),
        when: f.daterange('Zeitraum'),
        location: f.text('Ort', { max: 120, translate: false }),
        booth: f.text('Stand-Nr.', { max: 20, optional: true, translate: false }),
      },
      max: 40,
      order: { field: 'when', dir: 'asc' },
      visible: { mode: 'until', field: 'when' },
      tasks: [
        { id: 'add', label: 'Messe eintragen', kind: 'create' },
        { id: 'edit', label: 'Messe bearbeiten', kind: 'edit', pick: true, fields: ['title', 'when', 'location', 'booth'] },
        { id: 'remove', label: 'Messe entfernen', kind: 'remove' },
      ],
    }),
    products: collection({
      label: 'Produkte',
      fields: {
        name: f.text('Name', { max: 120 }),
        slug: f.slug('Adresse', { from: 'name' }),
        summary: f.longtext('Kurztext', { max: 500 }),
        images: f.list('Bilder', { itemLabel: 'Bild', fields: { image: f.image('Bild') }, max: 6 }),
        specs: f.list('Technische Daten', {
          itemLabel: 'Merkmal',
          fields: {
            name: f.text('Merkmal', { max: 80 }),
            value: f.text('Wert', { max: 80 }),
            unit: f.text('Einheit', { max: 20, optional: true }),
          },
          max: 30,
        }),
        datasheet: f.file('Datenblatt (PDF)', { accept: ['pdf'], maxBytes: 10 * 1024 * 1024, optional: true }),
      },
      max: 80,
      order: 'manual',
      route: { de: '/produkte/[slug]', en: '/en/products/[slug]' },
      tasks: [
        { id: 'add', label: 'Produkt hinzufügen', kind: 'create' },
        { id: 'edit', label: 'Produkt bearbeiten', kind: 'edit', pick: true, fields: ['name', 'slug', 'summary', 'images', 'specs', 'datasheet'] },
        { id: 'remove', label: 'Produkt entfernen', kind: 'remove' },
      ],
    }),
    contacts: collection({
      label: 'Ansprechpartner',
      fields: {
        name: f.text('Name', { max: 80, translate: false }),
        role: f.text('Rolle', { max: 120 }),
        phone: f.text('Telefon', { format: 'tel' }),
        email: f.text('E-Mail', { format: 'email' }),
        photo: f.image('Foto', { optional: true }),
      },
      max: 30,
      order: 'manual',
      tasks: [
        { id: 'add', label: 'Ansprechpartner hinzufügen', kind: 'create' },
        { id: 'edit', label: 'Ansprechpartner bearbeiten', kind: 'edit', pick: true, fields: ['name', 'role', 'phone', 'email', 'photo'] },
        { id: 'remove', label: 'Ansprechpartner entfernen', kind: 'remove' },
      ],
    }),
    certificates: collection({
      label: 'Zertifikate',
      fields: {
        title: f.text('Bezeichnung', { max: 120, translate: false }),
        validUntil: f.date('Gültig bis'),
        certificate: f.file('Zertifikat (PDF)', { accept: ['pdf'], maxBytes: 5 * 1024 * 1024 }),
      },
      max: 20,
      order: { field: 'validUntil', dir: 'asc' },
      tasks: [
        { id: 'add', label: 'Zertifikat hinzufügen', kind: 'create' },
        { id: 'renew', label: 'Zertifikat erneuern', kind: 'edit', pick: true, fields: ['validUntil', 'certificate'] },
        { id: 'remove', label: 'Zertifikat entfernen', kind: 'remove' },
      ],
    }),
    // Address and phone of the company: rare to change (a move, a new number), found in Alles bearbeiten.
    company: single({
      label: 'Firma und Adresse',
      fields: {
        street: f.text('Straße und Hausnummer', { max: 80, translate: false, default: 'Industriestraße 14' }),
        city: f.text('PLZ und Ort', { max: 80, translate: false, default: '4400 Steyr' }),
        phone: f.text('Telefon', { format: 'tel', default: '+43 7252 123 0' }),
        email: f.text('E-Mail', { format: 'email', default: 'office@brunner-praezision.example' }),
        vatId: f.text('UID-Nummer', { max: 20, translate: false, optional: true, default: 'ATU00000000' }),
      },
    }),
    legal: single({
      label: 'Rechtliches',
      fields: {
        imprint: f.markdown('Impressum', { profile: 'basic', translate: 'manual', optional: true }),
        privacy: f.markdown('Datenschutz', { profile: 'basic', translate: 'manual', optional: true }),
      },
    }),
  },
})
