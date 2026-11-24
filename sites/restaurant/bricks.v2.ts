// POC T2: this house's bricks written in v2. The lunch menu is the hard case of the v2 spec (appendix A.3): a table
// with one row per weekday (`f.rows`), weekly upkeep (`repeats`) and approval on its task. v1: `lunch()` of the gastro
// preset, changed in ginko.config.ts with a spread. English labels are in i18n/studio/en.json.
import { f, single } from '@lupinum/ginko/v2'
import { allergensEU, weekdayNames } from '@lupinum/ginko-preset-gastro'

// Monday to Friday with their names. (Finding of the POC: the list of weekdays with labels is not a public export.)
const workdays = (['mo', 'tu', 'we', 'th', 'fr'] as const).map((value) => ({ value, label: { de: weekdayNames.de[value], en: weekdayNames.en[value] } }))

// The start value of a day. `_id` keeps the row ids the v1 brick wrote: a release refuses a changed start value.
const toBeAnnounced = (day: string) => ({ _id: `ld${day}000000`, dish: { de: 'Wird noch bekannt gegeben', en: 'To be announced' }, allergens: [] })

export const lunch = single({
  label: 'Mittagsmenü',
  // Due again every week; at the weekend the coming week already counts.
  repeats: { every: 'week', start: 'weekOf', workWeek: true },
  fields: {
    weekOf: f.date('Woche ab', { default: '2026-10-05' }),
    days: f.rows('Tage', {
      rows: workdays,
      key: 'day',
      item: 'Tag',
      fields: {
        dish: f.text('Gericht', { max: 200 }),
        price: f.money('Preis', { optional: true }),
        allergens: f.choices('Allergene', { options: allergensEU, askAgainWhen: 'dish' }),
      },
      default: { mo: toBeAnnounced('mo'), tu: toBeAnnounced('tu'), we: toBeAnnounced('we'), th: toBeAnnounced('th'), fr: toBeAnnounced('fr') },
    }),
    note: f.text('Hinweis', { max: 200, optional: true }),
    // Many houses also hand out the week as a PDF.
    pdf: f.file('Mittagsmenü als PDF', { maxBytes: 5 * 1024 * 1024, optional: true }),
  },
  // The cook enters the week's lunch menu; it goes live once the owner approves it.
  tasks: [{ id: 'lunchWeek', label: 'Mittagsmenü dieser Woche', fields: ['weekOf', 'days', 'note'], needsApproval: true }],
})

// A rare job (moving, new number): no task, found under this label in the content list.
export const contact = single({
  label: 'Adresse und Kontakt',
  fields: {
    street: f.text('Straße und Hausnummer', { group: 'Adresse', max: 80, translate: false, default: 'Dorfstraße 12' }),
    postalCode: f.text('PLZ', { group: 'Adresse', max: 10, translate: false, optional: true, default: '5020' }),
    city: f.text('Ort', { group: 'Adresse', max: 80, translate: false, default: 'Salzburg' }),
    phone: f.text('Telefon', { group: 'Erreichbarkeit', format: 'tel', default: '+43 662 000 000' }),
    email: f.text('E-Mail', { group: 'Erreichbarkeit', format: 'email', optional: true, default: 'office@gasthaus-linde.example' }),
  },
})

export const legal = single({
  label: 'Rechtliches',
  // Two long texts: one tab each on wide screens, one below the other on phones.
  layout: 'tabs',
  fields: {
    imprint: f.markdown('Impressum', { group: 'Impressum', profile: 'basic', translate: 'manual', optional: true }),
    privacy: f.markdown('Datenschutz', { group: 'Datenschutz', profile: 'basic', translate: 'manual', optional: true }),
  },
})

export const seo = single({
  label: 'Suchmaschinen',
  fields: {
    title: f.text('Titel', { max: 70, default: { de: 'Gasthaus zur Linde, Salzburg' } }),
    description: f.text('Beschreibung', { max: 160, default: { de: 'Wirtshausküche in Salzburg: Mittagsmenü, Speisekarte und Veranstaltungen.' } }),
    image: f.image('Vorschaubild', { optional: true }),
  },
})
