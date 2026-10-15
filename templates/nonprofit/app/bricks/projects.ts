// Synced from templates/_features/projects/app/bricks/projects.ts by `pnpm templates sync`. Edit the source, not this copy.
import { collection, f, type BrickSource, type RouteTemplate } from '@lupinum/ginko'

// Projects: what an organisation works on, one Markdown file each in content/projects/ (`1.clean-banks.md`,
// translations `1.clean-banks.de.md`). The number sets the order. A campaign has an end date (`ends`): it leaves the
// site after that day by itself, and the Studio's Today page lists campaigns that end within 7 days.
// `gallery` (optional) names the site's gallery brick: a project can then point to photos of it.
export function projects<const R extends Record<string, RouteTemplate>>(o: { route: R, source?: BrickSource, gallery?: string }) {
  const fields = {
    title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80 }),
    slug: f.slug({ de: 'Adresse', en: 'Address', fr: 'Adresse' }, { from: 'title' }),
    summary: f.longtext({ de: 'Kurzbeschreibung', en: 'Summary', fr: 'Résumé' }, {
      max: 300,
      hint: { de: 'Steht auf der Karte, unter dem Titel und in Suchergebnissen.', en: 'Shown on the card, below the title and in search results.', fr: 'Affiché sur la carte, sous le titre et dans les résultats de recherche.' },
    }),
    image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
    ends: f.date({ de: 'Endet am', en: 'Ends on', fr: 'Se termine le' }, {
      optional: true,
      hint: { de: 'Nur für Aktionen: Danach verschwindet das Projekt von der Website.', en: 'Campaigns only: the project leaves the site after this day.', fr: 'Pour les campagnes : le projet quitte le site après ce jour.' },
    }),
    ...(o.gallery ? { gallery: f.ref({ de: 'Galerie', en: 'Gallery', fr: 'Galerie' }, { to: o.gallery, optional: true }) } : {}),
    body: f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page' }),
  }
  return collection({
    label: { de: 'Projekte', en: 'Projects', fr: 'Projets' },
    ...(o.source ? { source: o.source } : {}),
    max: 50,
    order: 'manual',
    route: o.route,
    visible: { mode: 'until', field: 'ends' },
    status: { count: true },
    fields,
    tasks: [
      { id: 'edit', kind: 'edit', pick: true, fields: ['title', 'summary', 'image', 'ends', 'body'], label: { de: 'Projekt bearbeiten', en: 'Edit a project', fr: 'Modifier un projet' } },
      { id: 'add', kind: 'create', label: { de: 'Projekt hinzufügen', en: 'Add a project', fr: 'Ajouter un projet' } },
    ],
  })
}
