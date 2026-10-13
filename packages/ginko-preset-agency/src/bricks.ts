// Content types an agency or studio website needs. Labels come in German and English.
// Every factory returns a brick for `bricks: { <key>: services() }`. For file content the brick key is the folder name,
// so a site that keeps `content/leistungen/` writes `leistungen: services()`.
import { collection, f, type CollectionBrick, type Field, type Fields, type Label, type Locale, type RouteTemplate } from '@lupinum/ginko'

export type Routes = Record<Locale, RouteTemplate>

export interface BrickOptions<E extends Fields = {}> {
  /** Replaces the brick's label: a text for every site language, or `{ de, en }`. */
  label?: Label
  /** `files` (default): Markdown files in `content/<key>/`. `platform`: entries live on the Ginko platform. */
  source?: 'files' | 'platform'
  /** Most entries. */
  max?: number
  /** New labels by field name, e.g. `{ outcome: 'Wirkung' }` or `{ outcome: { de: 'Wirkung', en: 'Impact' } }`. */
  fieldLabels?: Record<string, Label>
  /** Site-specific fields, merged after the preset's own; a field with the same name wins over the preset's. */
  extra?: E
  /** Options for the main Markdown text, e.g. `{ profile: 'page', max: 100_000 }` for a site with its own components. */
  body?: MarkdownOptions
}
export interface RoutedOptions<E extends Fields = {}> extends BrickOptions<E> {
  /** Detail page per language; each needs `[slug]`. Languages you leave out keep the default. */
  route?: Routes
}

type MarkdownOptions = NonNullable<Parameters<typeof f.markdown>[1]>
/** The main Markdown text of an entry, with the site's body options. */
const bodyOf = (label: Label, o: BrickOptions<any>, preset: MarkdownOptions = {}) => f.markdown(label, { ...preset, ...o.body })

/** A schema label in both languages. The editor sees the one for their language, and a site in another language falls back to English. */
const both = (de: string, en: string) => ({ de, en })

/** Brick settings that every factory shares. */
function common(o: BrickOptions<any>, label: Label, max: number) {
  return { label: o.label ?? label, max: o.max ?? max, ...((o.source ?? 'files') === 'files' ? { source: 'files' as const } : {}) }
}

/**
 * The preset brick, its tasks and options checked against the preset's own fields, then the extra fields and label
 * overrides. The cast keeps the field names for the caller's types. `NoInfer`: inside `defineSite({ bricks })`
 * TypeScript would otherwise infer `E` from the expected brick type (loose `Fields`), and `Omit` would then drop every
 * preset field from the site's types.
 */
function withExtras<B extends Fields, R extends Routes | undefined, E extends Fields>(brick: CollectionBrick<B, R>, o: BrickOptions<E>): CollectionBrick<Omit<B, keyof NoInfer<E>> & NoInfer<E>, R> {
  const merged: Record<string, Field> = { ...brick.fields, ...o.extra }
  for (const [name, label] of Object.entries(o.fieldLabels ?? {})) if (merged[name]) merged[name] = { ...merged[name], label }
  return { ...brick, fields: merged as Omit<B, keyof NoInfer<E>> & NoInfer<E> }
}

const routeOf = (defaults: Routes, o: RoutedOptions<any>): Routes => ({ ...defaults, ...o.route })

export function services<const E extends Fields = {}>(o: RoutedOptions<E> = {}) {
  return withExtras(collection({
    ...common(o, both('Leistungen', 'Services'), 20),
    order: 'manual',
    route: routeOf({ de: '/leistungen/[slug]', en: '/en/services/[slug]' }, o),
    fields: {
      title: f.text(both('Titel', 'Title')),
      description: f.longtext(both('Beschreibung', 'Description')),
      slug: f.slug(both('Adresse', 'Address'), { from: 'title' }),
      icon: f.text(both('Icon', 'Icon'), { optional: true }),
      featured: f.boolean(both('Hervorgehoben', 'Featured'), { optional: true }),
      outcome: f.longtext(both('Ergebnis', 'Outcome'), { optional: true }),
      body: bodyOf(both('Text', 'Text'), o),
    },
  }), o)
}

export interface CaseStudyOptions<E extends Fields = {}> extends RoutedOptions<E> {
  /** Key of the services brick that "related services" points to. `false`: no such field. Default `services`. */
  servicesBrick?: string | false
  /** Work areas to tick on a case study. */
  categories?: readonly { value: string; label: Label }[]
}

export function caseStudies<const E extends Fields = {}>(o: CaseStudyOptions<E> = {}) {
  const categories = o.categories ?? [
    { value: 'websites', label: both('Websites', 'Websites') }, { value: 'video', label: both('Video', 'Video') },
    { value: 'branding', label: both('Branding', 'Branding') }, { value: 'tools', label: both('Tools', 'Tools') },
  ]
  // Display only: the Studio shows these fields under four headings, as tabs on wide screens.
  const [project, result, work, home] = [both('Projekt', 'Project'), both('Ergebnis', 'Result'), both('Leistungen', 'Work'), both('Startseite', 'Homepage')]
  const related: Fields = o.servicesBrick === false ? {} : {
    relatedServices: f.refs(both('Passende Leistungen', 'Related services'), { to: o.servicesBrick ?? 'services', max: 6, optional: true, group: work }),
  }
  return withExtras(collection({
    ...common(o, both('Referenzen', 'Case studies'), 200),
    layout: 'tabs',
    order: { field: 'date', dir: 'desc' },
    route: routeOf({ de: '/referenzen/[slug]', en: '/en/case-studies/[slug]' }, o),
    fields: {
      title: f.text(both('Titel', 'Title')),
      description: f.longtext(both('Beschreibung', 'Description')),
      slug: f.slug(both('Adresse', 'Address'), { from: 'title' }),
      client: f.text(both('Kunde', 'Client'), { group: project }),
      industry: f.text(both('Branche', 'Industry'), { group: project }),
      outcome: f.longtext(both('Ergebnis', 'Outcome'), { group: result }),
      // Completion date, or the latest milestone for ongoing work.
      date: f.date(both('Datum', 'Date'), { group: project }),
      summary: f.longtext(both('Zusammenfassung', 'Summary')),
      services: f.list(both('Leistungen', 'Work done'), { itemLabel: both('Leistung', 'Item'), fields: { name: f.text(both('Leistung', 'Item')) }, max: 20, group: work }),
      serviceCategories: f.choices(both('Bereiche', 'Areas'), { options: categories, group: work }),
      ...related,
      // Position on the homepage (1 = first). Unset = not on the homepage.
      homeOrder: f.number(both('Position auf der Startseite', 'Position on the homepage'), { min: 1, max: 99, step: 1, optional: true, group: home }),
      featured: f.boolean(both('Hervorgehoben', 'Featured'), { optional: true, group: home }),
      period: f.text(both('Zeitraum', 'Period'), { optional: true, group: project }),
      measurable: f.text(both('Messbares Ergebnis', 'Measurable result'), { optional: true, group: result }),
      body: bodyOf(both('Text', 'Text'), o),
    },
  }), o)
}

export interface BlogOptions<E extends Fields = {}> extends RoutedOptions<E> {
  /** Key of the authors brick that `author` points to. `false`: no author field. Default `authors`. */
  authorsBrick?: string | false
}

export function blog<const E extends Fields = {}>(o: BlogOptions<E> = {}) {
  const author: Fields = o.authorsBrick === false ? {} : { author: f.ref(both('Autor', 'Author'), { to: o.authorsBrick ?? 'authors' }) }
  return withExtras(collection({
    ...common(o, both('Blog', 'Blog'), 500),
    order: { field: 'date', dir: 'desc' },
    route: routeOf({ de: '/blog/[slug]', en: '/en/blog/[slug]' }, o),
    tasks: [{ id: 'write', label: both('Beitrag schreiben', 'Write a post'), kind: 'create' }],
    fields: {
      title: f.text(both('Titel', 'Title')),
      description: f.longtext(both('Beschreibung', 'Description')),
      slug: f.slug(both('Adresse', 'Address'), { from: 'title' }),
      badge: f.text(both('Kennzeichen', 'Badge'), { optional: true }),
      date: f.date(both('Datum', 'Date')),
      readingTime: f.text(both('Lesezeit', 'Reading time'), { optional: true }),
      ...author,
      body: bodyOf(both('Text', 'Text'), o),
    },
  }), o)
}

export function authors<const E extends Fields = {}>(o: RoutedOptions<E> = {}) {
  return withExtras(collection({
    ...common(o, both('Autoren', 'Authors'), 50),
    order: 'manual',
    // No author pages unless the site gives a route.
    ...(o.route ? { route: o.route } : {}),
    fields: {
      name: f.text(both('Name', 'Name')),
      slug: f.slug(both('Adresse', 'Address'), { from: 'name' }),
      role: f.text(both('Rolle', 'Role')),
      bio: f.longtext(both('Kurzbiografie', 'Short bio')),
      avatar: f.image(both('Bild', 'Picture'), { optional: true }),
      links: f.list(both('Links', 'Links'), {
        itemLabel: both('Link', 'Link'),
        fields: {
          label: f.text(both('Text', 'Text')),
          href: f.text(both('Adresse', 'Address'), { format: 'url' }),
        },
        max: 10, optional: true,
      }),
    },
  }), o)
}

export interface LegalOptions<E extends Fields = {}> extends RoutedOptions<E> {
  /** Kinds of legal page to choose from. Default: privacy, privacy for customers, imprint, terms. */
  types?: readonly { value: string; label: Label }[]
}

export function legal<const E extends Fields = {}>(o: LegalOptions<E> = {}) {
  const types = o.types ?? [
    { value: 'privacy', label: both('Datenschutz', 'Privacy policy') },
    { value: 'customer-privacy', label: both('Datenschutz für Kunden', 'Privacy policy for customers') },
    { value: 'imprint', label: both('Impressum', 'Imprint') },
    { value: 'terms', label: both('AGB', 'Terms and conditions') },
  ]
  return withExtras(collection({
    ...common(o, both('Rechtliches', 'Legal'), 20),
    order: 'manual',
    route: routeOf({ de: '/[slug]', en: '/en/[slug]' }, o),
    tasks: [{ id: 'update', label: both('Rechtstext aktualisieren', 'Update a legal text'), kind: 'edit', pick: true, fields: ['body', 'updatedAt'], prefill: { updatedAt: '@today' } }],
    fields: {
      title: f.text(both('Titel', 'Title')),
      description: f.longtext(both('Beschreibung', 'Description')),
      slug: f.slug(both('Adresse', 'Address'), { from: 'title' }),
      legalType: f.choice(both('Art', 'Kind'), { options: types }),
      updatedAt: f.date(both('Stand', 'Last updated')),
      body: bodyOf(both('Text', 'Text'), o, { translate: 'manual' }),
    },
  }), o)
}

export function faq<const E extends Fields = {}>(o: BrickOptions<E> = {}) {
  return withExtras(collection({
    ...common(o, both('Häufige Fragen', 'FAQ'), 100),
    order: 'manual',
    tasks: [
      { id: 'add', label: both('Frage hinzufügen', 'Add a question'), kind: 'create' },
      { id: 'edit', label: both('Frage bearbeiten', 'Edit a question'), kind: 'edit', pick: true, fields: ['question', 'answer', 'category'] },
      { id: 'remove', label: both('Frage entfernen', 'Remove a question'), kind: 'remove' },
    ],
    fields: {
      question: f.text(both('Frage', 'Question')),
      answer: f.longtext(both('Antwort', 'Answer')),
      category: f.text(both('Kategorie', 'Category'), { optional: true }),
    },
  }), o)
}

export function team<const E extends Fields = {}>(o: RoutedOptions<E> = {}) {
  return withExtras(collection({
    ...common(o, both('Team', 'Team'), 50),
    order: { field: 'order', dir: 'asc' },
    // Team members have no page unless the site gives a route (it then adds a `slug` field through `extra`).
    ...(o.route ? { route: o.route } : {}),
    tasks: [
      { id: 'add', label: both('Person hinzufügen', 'Add a person'), kind: 'create' },
      { id: 'edit', label: both('Person bearbeiten', 'Edit a person'), kind: 'edit', pick: true, fields: ['name', 'role', 'photo', 'bio', 'order'] },
      { id: 'remove', label: both('Person entfernen', 'Remove a person'), kind: 'remove' },
    ],
    fields: {
      name: f.text(both('Name', 'Name')),
      role: f.text(both('Rolle', 'Role')),
      photo: f.image(both('Foto', 'Photo'), { optional: true }),
      bio: f.longtext(both('Kurzbiografie', 'Short bio'), { optional: true }),
      order: f.number(both('Reihenfolge (1 = zuerst)', 'Order (1 = first)'), { min: 1, max: 999, step: 1, default: 100 }),
    },
  }), o)
}

export function jobs<const E extends Fields = {}>(o: RoutedOptions<E> = {}) {
  return withExtras(collection({
    ...common(o, both('Stellen', 'Jobs'), 30),
    order: { field: 'title', dir: 'asc' },
    route: routeOf({ de: '/karriere/[slug]', en: '/en/careers/[slug]' }, o),
    // Expired jobs drop out of lists by themselves (open through `validUntil`; `openJobs` is the same rule for your own code).
    visible: { mode: 'until', field: 'validUntil' },
    tasks: [
      { id: 'add', label: both('Stelle ausschreiben', 'Post a job'), kind: 'create' },
      { id: 'extend', label: both('Bewerbungsfrist ändern', 'Change the deadline'), kind: 'edit', pick: true, fields: ['validUntil'] },
      { id: 'remove', label: both('Stelle entfernen', 'Remove a job'), kind: 'remove' },
    ],
    fields: {
      title: f.text(both('Titel', 'Title')),
      description: f.longtext(both('Kurzbeschreibung', 'Short description')),
      slug: f.slug(both('Adresse', 'Address'), { from: 'title' }),
      location: f.text(both('Ort', 'Location')),
      employmentType: f.choice(both('Anstellung', 'Employment'), {
        options: [
          { value: 'fullTime', label: both('Vollzeit', 'Full time') }, { value: 'partTime', label: both('Teilzeit', 'Part time') },
          { value: 'freelance', label: both('Freie Mitarbeit', 'Freelance') }, { value: 'internship', label: both('Praktikum', 'Internship') },
          { value: 'apprenticeship', label: both('Lehre', 'Apprenticeship') },
        ],
      }),
      remote: f.choice(both('Arbeitsort', 'Work place'), {
        options: [
          { value: 'onsite', label: both('vor Ort', 'On site') }, { value: 'hybrid', label: both('hybrid', 'Hybrid') },
          { value: 'remote', label: both('remote', 'Remote') },
        ],
        default: 'onsite',
      }),
      applyUrl: f.text(both('Bewerbungs-Link', 'Application link'), { format: 'url', optional: true }),
      applyEmail: f.text(both('Bewerbungs-E-Mail', 'Application email'), { format: 'email', optional: true }),
      validUntil: f.date(both('Ausgeschrieben bis', 'Open until'), { optional: true }),
      body: bodyOf(both('Beschreibung', 'Description'), o),
    },
  }), o)
}
