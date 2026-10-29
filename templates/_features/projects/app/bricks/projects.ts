import { collection, f, type BrickSource, type RouteTemplate } from '@lupinum/ginko'

// Projects: what an organisation works on, one Markdown file each in content/projects/ (`1.my-project.md`,
// translations `1.my-project.de.md`). The number sets the order. A campaign has an end date (`ends`): it leaves the
// site after that day by itself, and the Studio's Today page lists campaigns that end within 7 days. A project may
// have one button below its title (`actionLabel` and `actionUrl`, both needed), for example "Donate now".
// `details: true` is for work that stays online: no end date and no button, but the facts of a commission (client,
// year, place, scope) and the project's photos, each with its description (the build and the Studio refuse a photo
// without one). A new project can wait as a draft (`draft: true` in its file), and Today lists the drafts. Without
// `details` the stored shape stays as it is.
type Options<R> = { route: R, source?: BrickSource }
export function projects<const R extends Record<string, RouteTemplate>>(o: Options<R> & { details?: false }): ReturnType<typeof plain<R>>
export function projects<const R extends Record<string, RouteTemplate>>(o: Options<R> & { details: true }): ReturnType<typeof detailed<R>>
export function projects<const R extends Record<string, RouteTemplate>>(o: Options<R> & { details?: boolean }) {
  return o.details ? detailed(o) : plain(o)
}

/** What both kinds share. */
const common = <R>(o: Options<R>) => ({
  label: { de: 'Projekte', en: 'Projects', fr: 'Projets' },
  ...(o.source ? { source: o.source } : {}),
  max: 50,
  order: 'manual',
  route: o.route,
} as const)

const editLabel = { de: 'Projekt bearbeiten', en: 'Edit a project', fr: 'Modifier un projet' }
const add = { id: 'add', kind: 'create', label: { de: 'Projekt hinzufügen', en: 'Add a project', fr: 'Ajouter un projet' } } as const

function plain<const R extends Record<string, RouteTemplate>>(o: Options<R>) {
  return collection({
    ...common(o),
    fields: { ...fields(), ...campaign(), body: body() },
    visible: { mode: 'until', field: 'ends' },
    status: { count: true },
    tasks: [
      { id: 'edit', kind: 'edit', pick: true, fields: ['title', 'summary', 'image', 'ends', 'actionLabel', 'actionUrl', 'body'], label: editLabel },
      add,
    ],
  })
}

function detailed<const R extends Record<string, RouteTemplate>>(o: Options<R>) {
  return collection({
    ...common(o),
    fields: { ...fields(), ...details(), body: body() },
    tasks: [
      { id: 'edit', kind: 'edit', pick: true, fields: ['title', 'summary', 'client', 'year', 'place', 'scope', 'image', 'photos', 'body'], label: editLabel },
      { id: 'photos', kind: 'edit', pick: true, fields: ['image', 'photos'], label: { de: 'Fotos hinzufügen', en: 'Add photos', fr: 'Ajouter des photos' } },
      add,
    ],
  })
}

function fields() {
  return {
    title: f.text({ de: 'Titel', en: 'Title', fr: 'Titre' }, { max: 80 }),
    slug: f.slug({ de: 'Adresse', en: 'Address', fr: 'Adresse' }, { from: 'title' }),
    summary: f.longtext({ de: 'Kurzbeschreibung', en: 'Summary', fr: 'Résumé' }, {
      max: 300,
      hint: { de: 'Steht auf der Karte, unter dem Titel und in Suchergebnissen.', en: 'Shown on the card, below the title and in search results.', fr: 'Affiché sur la carte, sous le titre et dans les résultats de recherche.' },
    }),
    image: f.image({ de: 'Bild', en: 'Image', fr: 'Image' }, { optional: true }),
  }
}

/** A campaign's last day and its button (without `details`). */
function campaign() {
  return {
    ends: f.date({ de: 'Endet am', en: 'Ends on', fr: 'Se termine le' }, {
      optional: true,
      hint: { de: 'Nur für Aktionen: Danach verschwindet das Projekt von der Website.', en: 'Campaigns only: the project leaves the site after this day.', fr: 'Pour les campagnes : le projet quitte le site après ce jour.' },
    }),
    actionLabel: f.text({ de: 'Button-Text', en: 'Button text', fr: 'Texte du bouton' }, {
      max: 40,
      optional: true,
      hint: { de: 'Ein Button unter dem Titel, zum Beispiel „Jetzt spenden“. Braucht auch die Adresse.', en: 'One button below the title, for example “Donate now”. Needs the address too.', fr: 'Un bouton sous le titre, par exemple « Faire un don ». Il faut aussi l’adresse.' },
    }),
    actionUrl: f.text({ de: 'Button-Adresse', en: 'Button address', fr: 'Adresse du bouton' }, { format: 'url', optional: true, translate: false }),
  }
}

const photo = { de: 'Foto', en: 'Photo', fr: 'Photo' }

/** The facts of a commission and its photos (`details: true`). Every one is optional. */
function details() {
  return {
    client: f.text({ de: 'Auftraggeber', en: 'Client', fr: 'Client' }, {
      max: 80,
      optional: true,
      hint: { de: 'Name des Kunden oder zum Beispiel „Privatkundin“.', en: 'The client’s name, or for example “Private client”.', fr: 'Le nom du client, ou par exemple « Client privé ».' },
    }),
    year: f.number({ de: 'Jahr', en: 'Year', fr: 'Année' }, { min: 1900, max: 2199, step: 1, optional: true }),
    place: f.text({ de: 'Ort', en: 'Place', fr: 'Lieu' }, { max: 80, optional: true }),
    scope: f.text({ de: 'Leistungen', en: 'Scope', fr: 'Prestations' }, {
      max: 160,
      optional: true,
      hint: { de: 'Kurz, zum Beispiel „Planung, Möbel, Licht“.', en: 'Briefly, for example “Planning, furniture, lighting”.', fr: 'En bref, par exemple « Plans, mobilier, éclairage ».' },
    }),
    // More photos after `image`, each with its description (required, so no photo goes online without one).
    photos: f.list({ de: 'Fotos', en: 'Photos', fr: 'Photos' }, {
      itemLabel: photo,
      fields: { image: f.image(photo, { hint: { de: 'Beschreibe, was das Foto zeigt: Der Text steht darunter und wird vorgelesen.', en: 'Describe what the photo shows: the text is shown below it and read out.', fr: 'Décrivez ce que montre la photo : le texte s’affiche dessous et est lu à voix haute.' } }) },
      max: 24,
      optional: true,
    }),
  }
}

function body() {
  return f.markdown({ de: 'Text', en: 'Text', fr: 'Texte' }, { profile: 'page' })
}
