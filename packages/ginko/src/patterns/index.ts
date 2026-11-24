// @lupinum/ginko/patterns: ready-made bricks for the content most sites have. A pattern is a finished brick: put it
// into `bricks` as it is. Where it lives and the address of its entries are in the site file (`studio`, `entries`);
// `extend` of '@lupinum/ginko' changes its label, adds fields or replaces its tasks.
//
//   import { events, notices, site } from '@lupinum/ginko/patterns'
//   bricks: { site, notices, events },
//   entries: { events: '/events/[slug]' },
//
// Each pattern has the stored names, limits and tasks of its function in '@lupinum/ginko/basics', so a site that
// changes from `notices({ source: 'files' })` to `notices` keeps its model. The rules and the JSON-LD for these
// bricks (`hoursOn`, `eventJsonLd`, …) stay in '@lupinum/ginko/basics'.
// Every name here is documented on the docs site (page "Patterns").
import { extend } from '../authoring/bricks.ts'
import { defOf } from '../authoring/from-stored.ts'
import * as basics from '../basics/index.ts'
import { t } from '../basics/shared.ts'

/** Name, address, contact and social links of the organisation. A single. */
export const site = defOf(basics.site())

/** Legal texts (imprint, privacy, terms), each with its date. Give them pages with `entries: { legal: '/legal/[slug]' }`. */
export const legal = defOf(basics.legal(), { item: t('Rechtstext', 'legal text', 'un texto legal', 'un texte juridique') })

/** At most 5 short notices in the owner's order; a notice with a date leaves the site after that day and is then deleted. */
export const notices = defOf(basics.notices(), { item: t('Hinweis', 'notice', 'un aviso', 'un avis') })

/**
 * People in the owner's order. They have no page of their own; for one, add the address field:
 * `extend(people, { fields: { slug: f.slug('Address', { from: 'name' }) } })` and a line in `entries`.
 */
export const people = defOf(basics.people(), { item: t('Person', 'person', 'una persona', 'une personne') })

/** Posts, newest first. `authors` names entries of the brick `people`. */
export const posts = defOf(basics.posts({ authors: 'people' }), { item: t('Beitrag', 'post', 'un artículo', 'un article') })

/** Releases of a product, newest first. */
export const changelog = defOf(basics.changelog(), { item: t('Version', 'release', 'una versión', 'une version') })

/** Job ads that leave the site after their last day. Today shows how many end soon. */
export const jobs = extend(defOf(basics.jobs(), { item: t('Stelle', 'job', 'una oferta', 'une offre') }), { status: { show: 'ending' } })

/** Events with date, place and booking; past events leave the site. Today shows the next one. */
export const events = extend(defOf(basics.events({}), { item: t('Veranstaltung', 'event', 'un evento', 'un événement') }), { status: { show: 'next', field: 'when' } })

/** The programme of an event: sessions that name an entry of `events` and speakers of the brick `people`. */
export const sessions = defOf(basics.sessions({ people: 'people' }), { item: t('Programmpunkt', 'session', 'una sesión', 'une session') })

/** Files for download, in the owner's order. */
export const downloads = defOf(basics.downloads(), { item: t('Datei', 'file', 'un archivo', 'un fichier') })

/** Questions and answers in the owner's order. */
export const faq = defOf(basics.faq(), { item: t('Frage', 'question', 'una pregunta', 'une question') })

/** One list of photos, in the owner's order. A single. */
export const gallery = defOf(basics.gallery())

/**
 * Weekly opening hours, closures, a closed day and the choice for public holidays. A single. Today shows today's
 * hours and follows the brick `hourPlans`; a site without hour plans writes `extend(hours, { status: { show: 'opening-hours' } })`.
 */
export const hours = defOf(basics.hours({ plans: 'hourPlans' }))

/** Own weekly hours for a date range: a season, or new hours from a date. */
export const hourPlans = defOf(basics.hourPlans(), { item: t('Zeitraum', 'period', 'un periodo', 'une période') })
