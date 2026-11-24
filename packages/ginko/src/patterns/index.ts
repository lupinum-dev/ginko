// @lupinum/ginko/patterns: ready-made bricks for the content most sites have. A pattern is a function that returns a
// finished brick. What a site can choose is an option, and a brick that points to another brick takes that brick's
// key as an option: nothing is named for you.
//
//   import { events, notices, people, posts, site } from '@lupinum/ginko/patterns'
//   bricks: { site: site(), notices: notices(), team: people(), posts: posts({ authors: 'team' }), events: events() },
//   entries: { posts: '/news/[slug]', events: '/events/[slug]' },
//
// Where a brick lives and the address of its entries are in the site file (`studio`, `entries`). `extend` of
// '@lupinum/ginko' adds fields to a pattern, replaces its tasks or changes its line on Today.
//
// Each pattern has the stored names, limits and tasks of its function in '@lupinum/ginko/basics', so a site that
// changes from `notices({ source: 'files' })` to `notices()` keeps its model. The rules and the JSON-LD for these
// bricks (`hoursOn`, `eventJsonLd`, …) stay in '@lupinum/ginko/basics'.
// Every name here is documented on the docs site (page "Patterns").
import { extend } from '../authoring/bricks.ts'
import { defOf } from '../authoring/from-stored.ts'
import * as basics from '../basics/index.ts'
import { t } from '../basics/shared.ts'
import type { Label } from '../core/types.ts'

/** What every pattern takes. */
export interface PatternOptions {
  /** Replaces the brick's name in the Studio: a text, or one text per language. */
  label?: Label
}

/** Name, address, contact and social links of the organisation. A single. */
export const site = (o: PatternOptions = {}) => defOf(basics.site(o))

/** Legal texts (imprint, privacy, terms), each with its date. Their pages: `entries: { legal: '/legal/[slug]' }`. */
export const legal = (o: PatternOptions = {}) => defOf(basics.legal(o), { item: t('Rechtstext', 'a legal text', 'un texto legal', 'un texte juridique') })

/** At most 5 short notices in the owner's order; a notice with a date leaves the site after that day and is then deleted. */
export const notices = (o: PatternOptions = {}) => defOf(basics.notices(o), { item: t('Hinweis', 'a notice', 'un aviso', 'un avis') })

const person = t('Person', 'a person', 'una persona', 'une personne')
/**
 * People in the owner's order. `pages: true` gives each person an address field (made from the name); the address
 * itself is a line in the site's `entries`: `people: '/team/[slug]'`.
 */
export function people(o: PatternOptions & { pages: true }): ReturnType<typeof peopleWithPages>
export function people(o?: PatternOptions & { pages?: false }): ReturnType<typeof peopleOnly>
export function people(o: PatternOptions & { pages?: boolean } = {}) {
  return o.pages ? peopleWithPages(o) : peopleOnly(o)
}
const peopleOnly = (o: PatternOptions) => defOf(basics.people({ label: o.label }), { item: person })
const peopleWithPages = (o: PatternOptions) => defOf(basics.people({ label: o.label, pages: true }), { item: person })

/**
 * Posts, newest first. `authors` is the key of the brick whose entries write the posts, such as a `people()` brick.
 * `max`: most posts (default 500).
 */
export const posts = (o: PatternOptions & { authors: string; max?: number }) => defOf(basics.posts(o), { item: t('Beitrag', 'a post', 'un artículo', 'un article') })

/** The people who write posts, without a page of their own: name, role, picture and a link. `posts({ authors: 'authors' })` names it. */
export const authors = (o: PatternOptions = {}) => defOf(basics.authors(o), { item: t('Autorin oder Autor', 'an author', 'un autor', 'un auteur') })

/** Releases of a product, newest first. `max`: most releases. */
export const changelog = (o: PatternOptions & { max?: number } = {}) => defOf(basics.changelog(o), { item: t('Version', 'a release', 'una versión', 'une version') })

/** Job ads that leave the site after their last day. Today shows how many end soon. */
export const jobs = (o: PatternOptions = {}) => extend(defOf(basics.jobs(o), { item: t('Stelle', 'a job', 'una oferta', 'une offre') }), { status: { show: 'ending' } })

/** Events with date, place and booking; past events leave the site. Today shows the next one. */
export const events = (o: PatternOptions = {}) => extend(defOf(basics.events(o), { item: t('Veranstaltung', 'an event', 'un evento', 'un événement') }), { status: { show: 'next', field: 'when' } })

const session = t('Programmpunkt', 'a session', 'una sesión', 'une session')
/**
 * The programme of an event: one entry per session. `events` is the key of the events brick a session belongs to.
 * `people` is the key of the brick with the speakers; without it the speakers are a text.
 */
export function sessions(o: PatternOptions & { events: string; people: string }): ReturnType<typeof sessionsWithPeople>
export function sessions(o: PatternOptions & { events: string; people?: undefined }): ReturnType<typeof sessionsWithText>
export function sessions(o: PatternOptions & { events: string; people?: string }) {
  return o.people !== undefined ? sessionsWithPeople({ ...o, people: o.people }) : sessionsWithText(o)
}
const sessionsWithPeople = (o: PatternOptions & { events: string; people: string }) => defOf(basics.sessions(o), { item: session })
const sessionsWithText = (o: PatternOptions & { events: string }) => defOf(basics.sessions({ label: o.label, events: o.events }), { item: session })

/** Files for download, in the owner's order. */
export const downloads = (o: PatternOptions = {}) => defOf(basics.downloads(o), { item: t('Datei', 'a file', 'un archivo', 'un fichier') })

/** Questions and answers in the owner's order. */
export const faq = (o: PatternOptions = {}) => defOf(basics.faq(o), { item: t('Frage', 'a question', 'una pregunta', 'une question') })

/** One list of photos, in the owner's order. A single. */
export const gallery = (o: PatternOptions = {}) => defOf(basics.gallery(o))

/**
 * Weekly opening hours, closures, a closed day and the choice for public holidays. A single. Today shows today's
 * hours. `plans` is the key of an `hourPlans()` brick: its entries then replace the week for their dates.
 */
export const hours = (o: PatternOptions & { plans?: string } = {}) => defOf(basics.hours(o))

/** Own weekly hours for a date range: a season, or new hours from a date. The `hours()` brick names this brick in `plans`. */
export const hourPlans = (o: PatternOptions = {}) => defOf(basics.hourPlans(o), { item: t('Zeitraum', 'a period', 'un periodo', 'une période') })
