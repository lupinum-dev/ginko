import { collection, f } from '@lupinum/ginko'

// Services or products: what a business offers, one Markdown file each in content/services/ (`1.my-service.md`,
// translations `1.my-service.de.md`). The number sets the order. Every entry says how it is priced, as an explicit
// choice: a fixed price (`pricing: price` and `price`, in the site's currency from ginko.config.ts) or on request
// (`pricing: onRequest`, no price shown); the build and the Studio refuse a fixed price without its amount.
// `duration` (minutes) is for a service that takes a set time. `specs` are short facts as label and value
// ("Warranty", "two years"). `contact` names the person in the site's `people` brick who answers enquiries about the
// entry (the service desk for a repair, sales for a product). A site with a `downloads` brick takes
// `servicesWithSheets`: an entry can then point to its product sheet.
const sheet = f.ref({ de: 'Produktblatt', en: 'Product sheet', fr: 'Fiche produit' }, { to: 'downloads', optional: true })

/** The fields before the text; `servicesWithSheets` puts the product sheet between them and the text. */
const head = {
  title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80 }),
  slug: f.slug({ de: 'Adresse', en: 'Address', fr: 'Adresse' }, { from: 'title' }),
  summary: f.longtext({ de: 'Kurzbeschreibung', en: 'Summary', fr: 'Résumé' }, {
    max: 300,
    hint: { de: 'Steht auf der Karte, unter dem Titel und in Suchergebnissen.', en: 'Shown on the card, below the title and in search results.', fr: 'Affiché sur la carte, sous le titre et dans les résultats de recherche.' },
  }),
  // An explicit choice, no default: a price is never left out by accident.
  pricing: f.choice({ de: 'Preis', en: 'Pricing', fr: 'Prix' }, {
    options: [
      { value: 'price', label: { de: 'Fester Preis', en: 'A fixed price', fr: 'Un prix fixe' } },
      { value: 'onRequest', label: { de: 'Auf Anfrage', en: 'On request', fr: 'Sur demande' } },
    ],
    hint: { de: 'Ein fester Preis braucht auch den Betrag.', en: 'A fixed price needs the amount too.', fr: 'Un prix fixe a aussi besoin du montant.' },
  }),
  // Required while shown: a fixed price needs its amount; an entry on request has none.
  price: f.money({ de: 'Betrag', en: 'Amount', fr: 'Montant' }, { showWhen: { field: 'pricing', is: 'price' } }),
  duration: f.number({ de: 'Dauer in Minuten', en: 'Duration in minutes', fr: 'Durée en minutes' }, { min: 5, max: 1440, step: 5, unit: 'min', optional: true }),
  specs: f.list({ de: 'Eckdaten', en: 'Key facts', fr: 'Caractéristiques' }, {
    optional: true,
    max: 12,
    item: { de: 'Angabe', en: 'Fact', fr: 'Donnée' },
    hint: { de: 'Kurz, zum Beispiel „Garantie“ und „zwei Jahre“.', en: 'Short, for example “Warranty” and “two years”.', fr: 'Bref, par exemple « Garantie » et « deux ans ».' },
    fields: {
      label: f.text({ de: 'Bezeichnung', en: 'Label', fr: 'Libellé' }, { max: 40 }),
      value: f.text({ de: 'Wert', en: 'Value', fr: 'Valeur' }, { max: 80 }),
    },
  }),
  contact: f.ref({ de: 'Ansprechperson', en: 'Contact person', fr: 'Personne de contact' }, {
    to: 'people',
    optional: true,
    hint: { de: 'Bekommt die Anfragen zu diesem Eintrag. Leer: die E-Mail-Adresse und Telefonnummer der Website.', en: 'Receives the enquiries about this entry. Empty: the website’s email address and phone number.', fr: 'Reçoit les demandes sur cette entrée. Vide : l’adresse e-mail et le numéro du site.' },
  }),
  image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
}

const body =f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page' })

const common = {
  label: { de: 'Leistungen', en: 'Services', fr: 'Prestations' },
  item: { de: 'Leistung', en: 'service', fr: 'une prestation' },
  max: 50,
  tasks: [
    { id: 'price', label: { de: 'Preis ändern', en: 'Change a price', fr: 'Modifier un prix' }, fields: ['pricing', 'price'] },
    'edit',
    'add',
  ],
} as const

/** The address of a service is a line in `entries` of ginko.config.ts: `services: '/services/[slug]'`. */
export const services = collection({ ...common, fields: { ...head, body } })

/** For a site with a `downloads` brick: an entry can point to its product sheet there. */
export const servicesWithSheets = collection({ ...common, fields: { ...head, sheet, body } })
