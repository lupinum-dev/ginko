import { collection, f, type BrickSource, type RouteTemplate } from '@lupinum/ginko'

// Free pages such as About and Contact: one Markdown file each in content/pages/ (`1.about.md`, translations
// `1.about.de.md`). The number sets the order; the summary is the page's lead and its search description. A page may
// have one button below its title (`actionLabel` and `actionUrl`, both needed), for example "Donate online" leading
// to a donation service: the page's one primary action.
// With @lupinum/ginko-components installed (`components` in ginko.config.ts), the body may use its components.
export function pages<const R extends Record<string, RouteTemplate>>(o: { route: R, source?: BrickSource }) {
  return collection({
    label: { de: 'Seiten', en: 'Pages', fr: 'Pages' },
    ...(o.source ? { source: o.source } : {}),
    max: 50,
    order: 'manual',
    // On the platform, Speichern on a live page keeps the change unpublished until Veröffentlichen.
    drafts: true,
    route: o.route,
    fields: {
      title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80 }),
      slug: f.slug({ de: 'Adresse', en: 'Address', fr: 'Adresse' }, { from: 'title' }),
      summary: f.longtext({ de: 'Kurzbeschreibung', en: 'Summary', fr: 'Résumé' }, {
        max: 300,
        optional: true,
        hint: { de: 'Steht unter dem Titel und in Suchergebnissen.', en: 'Shown below the title and in search results.', fr: 'Affiché sous le titre et dans les résultats de recherche.' },
      }),
      image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
      actionLabel: f.text({ de: 'Button-Text', en: 'Button text', fr: 'Texte du bouton' }, {
        max: 40,
        optional: true,
        hint: { de: 'Ein Button unter dem Titel, zum Beispiel „Online spenden“. Braucht auch die Adresse.', en: 'One button below the title, for example “Donate online”. Needs the address too.', fr: 'Un bouton sous le titre, par exemple « Faire un don en ligne ». Il faut aussi l’adresse.' },
      }),
      actionUrl: f.text({ de: 'Button-Adresse', en: 'Button address', fr: 'Adresse du bouton' }, { format: 'url', optional: true, translate: false }),
      body: f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page' }),
    },
    tasks: [
      { id: 'edit', kind: 'edit', pick: true, fields: ['title', 'summary', 'image', 'actionLabel', 'actionUrl', 'body'], label: { de: 'Seite bearbeiten', en: 'Edit a page', fr: 'Modifier une page' } },
      { id: 'add', kind: 'create', label: { de: 'Seite hinzufügen', en: 'Add a page', fr: 'Ajouter une page' } },
    ],
  })
}
