// Synced from templates/_features/pricing/app/bricks/pricing.ts by `pnpm templates sync`. Edit the source, not this copy.
import { collection, f, type BrickSource } from '@lupinum/ginko'

// The plans of a product with a subscription, one Markdown file each in content/pricing/ (`1.small.md`, translations
// `1.small.de.md`); the number sets the order on the pricing page. Every plan says how it is priced, as an explicit
// choice: a price (`pricing: price`, with `monthly` and `yearly`, each in the site's currency from ginko.config.ts) or
// on request (`pricing: onRequest`, no price shown); the build and the Studio refuse a priced plan without both
// amounts. `included` is the short list of what the plan contains. `recommended` marks one plan with the word
// "Recommended" (the first plan that has it). The action is a link (the sign-up page of the app, with the plan) or,
// without `actionUrl`, an email to the address of content/site.md with the plan's name in the subject.
export function pricing(o: { source?: BrickSource } = {}) {
  const fields = {
    name: f.text({ de: 'Name', en: 'Name', fr: 'Nom' }, { max: 40 }),
    summary: f.text({ de: 'Für wen', en: 'For whom', fr: 'Pour qui' }, {
      max: 160,
      hint: { de: 'Ein Satz unter dem Namen, zum Beispiel „Für ein Haus mit bis zu 30 Beschäftigten.“', en: 'One sentence below the name, for example “For one home with up to 30 staff.”', fr: 'Une phrase sous le nom, par exemple « Pour un établissement de 30 salariés au plus. »' },
    }),
    // An explicit choice, no default: a price is never left out by accident.
    pricing: f.choice({ de: 'Preis', en: 'Pricing', fr: 'Prix' }, {
      options: [
        { value: 'price', label: { de: 'Feste Preise', en: 'Fixed prices', fr: 'Prix fixes' } },
        { value: 'onRequest', label: { de: 'Auf Anfrage', en: 'On request', fr: 'Sur demande' } },
      ],
      hint: { de: 'Feste Preise brauchen beide Beträge: pro Monat und pro Jahr.', en: 'Fixed prices need both amounts: per month and per year.', fr: 'Les prix fixes demandent les deux montants : par mois et par an.' },
    }),
    // Required while shown: a priced plan needs both amounts; a plan on request has none.
    monthly: f.money({ de: 'Preis pro Monat', en: 'Price per month', fr: 'Prix par mois' }, { showWhen: { field: 'pricing', is: 'price' } }),
    yearly: f.money({ de: 'Preis pro Jahr', en: 'Price per year', fr: 'Prix par an' }, {
      showWhen: { field: 'pricing', is: 'price' },
      hint: { de: 'Der Betrag für ein ganzes Jahr bei jährlicher Zahlung.', en: 'The amount for a whole year, paid yearly.', fr: 'Le montant pour une année entière, payée annuellement.' },
    }),
    included: f.list({ de: 'Enthalten', en: 'Included', fr: 'Inclus' }, {
      max: 12,
      itemLabel: { de: 'Punkt', en: 'Item', fr: 'Élément' },
      hint: { de: 'Kurz, ein Punkt pro Zeile.', en: 'Short, one item per row.', fr: 'Bref, un élément par ligne.' },
      fields: { item: f.text({ de: 'Punkt', en: 'Item', fr: 'Élément' }, { max: 100 }) },
    }),
    recommended: f.boolean({ de: 'Als Empfehlung markieren', en: 'Mark as recommended', fr: 'Marquer comme recommandé' }, { optional: true }),
    actionLabel: f.text({ de: 'Text des Knopfs', en: 'Button text', fr: 'Texte du bouton' }, { max: 40 }),
    actionUrl: f.text({ de: 'Link des Knopfs', en: 'Button link', fr: 'Lien du bouton' }, {
      format: 'url',
      optional: true,
      translate: false,
      hint: { de: 'Leer: eine E-Mail an die Adresse der Website mit dem Namen des Tarifs im Betreff.', en: 'Empty: an email to the website’s address with the plan’s name in the subject.', fr: 'Vide : un e-mail à l’adresse du site, avec le nom de l’offre en objet.' },
    }),
  }
  return collection({
    label: { de: 'Preise', en: 'Pricing', fr: 'Tarifs' },
    ...(o.source ? { source: o.source } : {}),
    max: 6,
    order: 'manual',
    fields,
    tasks: [
      { id: 'price', kind: 'edit', pick: true, fields: ['pricing', 'monthly', 'yearly'], label: { de: 'Preis ändern', en: 'Change a price', fr: 'Modifier un prix' } },
      { id: 'edit', kind: 'edit', pick: true, fields: ['name', 'summary', 'included', 'recommended', 'actionLabel', 'actionUrl'], label: { de: 'Tarif bearbeiten', en: 'Edit a plan', fr: 'Modifier une offre' } },
      { id: 'add', kind: 'create', label: { de: 'Tarif hinzufügen', en: 'Add a plan', fr: 'Ajouter une offre' } },
    ],
  })
}
