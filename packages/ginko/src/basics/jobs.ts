// Job ads. Each ad needs `validUntil` and leaves lists, pages, the sitemap and the JSON-LD after that day by itself
// (`visible until validUntil`), so an expired job cannot stay online. The stored names are the agency preset's.
import { f } from '../core/fields.ts'
import { collection, type RouteTemplate } from '../core/site.ts'
import type { Locale } from '../core/types.ts'
import { compact, postalAddress, sourceOf, t, type BasicsOptions } from './shared.ts'

const employmentTypes = [
  { value: 'fullTime', label: t('Vollzeit', 'Full time', 'Jornada completa', 'Temps plein') },
  { value: 'partTime', label: t('Teilzeit', 'Part time', 'Media jornada', 'Temps partiel') },
  { value: 'freelance', label: t('Freie Mitarbeit', 'Freelance', 'Autónomo', 'Indépendant') },
  { value: 'internship', label: t('Praktikum', 'Internship', 'Prácticas', 'Stage') },
  { value: 'apprenticeship', label: t('Lehre', 'Apprenticeship', 'Formación profesional', 'Apprentissage') },
] as const

const workPlaces = [
  { value: 'onsite', label: t('Vor Ort', 'On site', 'Presencial', 'Sur place') },
  { value: 'hybrid', label: t('Hybrid', 'Hybrid', 'Híbrido', 'Hybride') },
  { value: 'remote', label: t('Remote', 'Remote', 'Remoto', 'À distance') },
] as const

export interface JobsOptions<R extends Record<Locale, RouteTemplate> | undefined> extends BasicsOptions {
  /** A page per job, e.g. `{ en: '/jobs/[slug]', de: '/de/jobs/[slug]' }`. */
  route?: R
}

export function jobs<const R extends Record<Locale, RouteTemplate> | undefined = undefined>(o: JobsOptions<R> = {}) {
  return collection({
    label: o.label ?? t('Stellen', 'Jobs', 'Empleos', 'Offres d’emploi'),
    ...sourceOf(o),
    max: 30,
    order: { field: 'title', dir: 'asc' },
    ...(o.route ? { route: o.route as R } : {}),
    visible: { mode: 'until', field: 'validUntil' },
    tasks: [
      { id: 'add', kind: 'create', label: t('Stelle ausschreiben', 'Post a job', 'Publicar una oferta', 'Publier une offre') },
      { id: 'extend', kind: 'edit', pick: true, fields: ['validUntil'], label: t('Bewerbungsfrist ändern', 'Change the deadline', 'Cambiar el plazo', 'Modifier la date limite') },
      { id: 'remove', kind: 'remove', label: t('Stelle entfernen', 'Remove a job', 'Eliminar una oferta', 'Retirer une offre') },
    ],
    fields: {
      title: f.text(t('Titel', 'Title', 'Título', 'Titre')),
      description: f.longtext(t('Kurzbeschreibung', 'Short description', 'Descripción breve', 'Description courte')),
      slug: f.slug(t('Adresse', 'Address', 'Dirección', 'Adresse'), { from: 'title' }),
      location: f.text(t('Ort', 'Location', 'Ubicación', 'Lieu')),
      employmentType: f.choice(t('Anstellung', 'Employment', 'Tipo de contrato', 'Type de contrat'), { options: employmentTypes }),
      remote: f.choice(t('Arbeitsort', 'Work place', 'Lugar de trabajo', 'Lieu de travail'), { options: workPlaces, default: 'onsite' }),
      applyUrl: f.text(t('Bewerbungs-Link', 'Application link', 'Enlace de solicitud', 'Lien de candidature'), { format: 'url', optional: true }),
      applyEmail: f.text(t('Bewerbungs-E-Mail', 'Application email', 'Correo de solicitud', 'E-mail de candidature'), { format: 'email', optional: true }),
      validUntil: f.date(t('Ausgeschrieben bis', 'Open until', 'Abierta hasta', 'Ouverte jusqu’au'), {
        hint: t('Am Tag danach verschwindet die Stelle von der Website.', 'The job leaves the website the day after.', 'La oferta desaparece del sitio web al día siguiente.', 'L’offre disparaît du site le lendemain.'),
      }),
      body: f.markdown(t('Beschreibung', 'Description', 'Descripción', 'Description')),
    },
  })
}

const SCHEMA_EMPLOYMENT: Record<(typeof employmentTypes)[number]['value'], string> = {
  fullTime: 'FULL_TIME', partTime: 'PART_TIME', freelance: 'CONTRACTOR', internship: 'INTERN', apprenticeship: 'OTHER',
}

export interface JobJsonLdInput {
  title: string
  /** Absolute URL of the job's page. */
  url: string
  /** The full description as plain text or HTML (for example the plain text of `body`). */
  description: string
  /** The day the ad went online (`YYYY-MM-DD`). */
  datePosted: string
  /** The last day of the ad (`validUntil`), written as `validThrough`. */
  validUntil: string
  employmentType?: string
  /** `remote` marks the job as remote work (`TELECOMMUTE`). */
  remote?: string
  /** The town or city (`location`). */
  location?: string
  /** The employer: the site's name and address. */
  organization: { name: string; url: string; logo?: string }
  /** The site's country (ISO 3166 code such as `DE`): `addressCountry`, and where remote applicants must live. */
  country?: string
}

/** schema.org JobPosting for one job. */
export function jobJsonLd(j: JobJsonLdInput): Record<string, unknown> {
  const remote = j.remote === 'remote'
  return compact({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    url: j.url,
    description: j.description,
    datePosted: j.datePosted,
    validThrough: j.validUntil,
    employmentType: j.employmentType && Object.hasOwn(SCHEMA_EMPLOYMENT, j.employmentType) ? SCHEMA_EMPLOYMENT[j.employmentType as keyof typeof SCHEMA_EMPLOYMENT] : undefined,
    hiringOrganization: compact({ '@type': 'Organization', name: j.organization.name, sameAs: j.organization.url, logo: j.organization.logo }),
    jobLocation: j.location ? { '@type': 'Place', address: postalAddress({ city: j.location, country: j.country }) } : undefined,
    jobLocationType: remote ? 'TELECOMMUTE' : undefined,
    applicantLocationRequirements: remote && j.country ? { '@type': 'Country', name: j.country } : undefined,
  })
}
