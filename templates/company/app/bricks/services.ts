// Synced from templates/_features/services/app/bricks/services.ts by `pnpm templates sync`. Edit the source, not this copy.
import { collection, f, type BrickSource, type RouteTemplate } from '@lupinum/ginko'

// Services or products: what a business offers, one Markdown file each in content/services/ (`1.my-service.md`,
// translations `1.my-service.de.md`). The number sets the order. Every entry says how it is priced, as an explicit
// choice: a fixed price (`pricing: price` and `price`, in the site's currency from ginko.config.ts) or on request
// (`pricing: onRequest`, no price shown). `duration` (minutes) is for a service that takes a set time. `specs` are
// short facts as label and value ("Flow rate", "up to 400 m³/h"). `downloads` (optional) names the site's downloads
// brick: an entry can then point to its product sheet.
export function services<const R extends Record<string, RouteTemplate>>(o: { route: R, source?: BrickSource, downloads?: string }) {
  const fields = {
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
    price: f.money({ de: 'Betrag', en: 'Amount', fr: 'Montant' }, { optional: true, showWhen: { field: 'pricing', is: 'price' } }),
    duration: f.number({ de: 'Dauer in Minuten', en: 'Duration in minutes', fr: 'Durée en minutes' }, { min: 5, max: 1440, step: 5, unit: 'min', optional: true }),
    specs: f.list({ de: 'Eckdaten', en: 'Key facts', fr: 'Caractéristiques' }, {
      optional: true,
      max: 12,
      itemLabel: { de: 'Angabe', en: 'Fact', fr: 'Donnée' },
      hint: { de: 'Kurz, zum Beispiel „Fördermenge“ und „bis 400 m³/h“.', en: 'Short, for example “Flow rate” and “up to 400 m³/h”.', fr: 'Bref, par exemple « Débit » et « jusqu’à 400 m³/h ».' },
      fields: {
        label: f.text({ de: 'Bezeichnung', en: 'Label', fr: 'Libellé' }, { max: 40 }),
        value: f.text({ de: 'Wert', en: 'Value', fr: 'Valeur' }, { max: 80 }),
      },
    }),
    image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
    ...(o.downloads ? { sheet: f.ref({ de: 'Produktblatt', en: 'Product sheet', fr: 'Fiche produit' }, { to: o.downloads, optional: true }) } : {}),
    body: f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page' }),
  }
  const editable = ['title', 'summary', 'pricing', 'price', 'duration', 'specs', 'image', ...(o.downloads ? ['sheet'] as const : []), 'body'] as const
  return collection({
    label: { de: 'Leistungen', en: 'Services', fr: 'Prestations' },
    ...(o.source ? { source: o.source } : {}),
    max: 50,
    order: 'manual',
    route: o.route,
    fields,
    tasks: [
      { id: 'price', kind: 'edit', pick: true, fields: ['pricing', 'price'], label: { de: 'Preis ändern', en: 'Change a price', fr: 'Modifier un prix' } },
      { id: 'edit', kind: 'edit', pick: true, fields: editable, label: { de: 'Leistung bearbeiten', en: 'Edit a service', fr: 'Modifier une prestation' } },
      { id: 'add', kind: 'create', label: { de: 'Leistung hinzufügen', en: 'Add a service', fr: 'Ajouter une prestation' } },
    ],
  })
}
