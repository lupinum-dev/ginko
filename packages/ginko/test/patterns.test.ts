// @lupinum/ginko/patterns: each pattern in a site file gives the stored brick its function of '@lupinum/ginko/basics'
// gives. Wrong behaviour this catches: a pattern differs from its function in a name, a limit, a label or a task, so
// a site that takes the pattern in place of the function call gets a changed model, which a release reports or refuses.
import { describe, expect, it } from 'vitest'
import * as basics from '../src/basics/index.ts'
import { checkSite } from '../src/core/index.ts'
import type { Brick } from '../src/core/types.ts'
import { defineSite, extend, f, type BrickDef } from '../src/index.ts'
import * as patterns from '../src/patterns/index.ts'

const base = { name: 'Halden Pumps', url: 'https://halden.example', timeZone: 'Europe/Vienna', currency: 'EUR', locales: ['de', 'en'] } as const

const route = { de: '/team/[slug]', en: '/en/team/[slug]' } as const

/**
 * A pattern call, the stored brick it must give (the function's brick, plus the Today line a pattern brings) and, for
 * a brick with pages, its line in `entries`.
 */
const cases: [call: string, name: keyof typeof patterns, pattern: BrickDef, stored: Brick, entry?: string][] = [
  ['site()', 'site', patterns.site(), basics.site()],
  ['site({ label })', 'site', patterns.site({ label: 'Firma' }), basics.site({ label: 'Firma' })],
  ['legal()', 'legal', patterns.legal(), basics.legal()],
  ['notices()', 'notices', patterns.notices(), basics.notices()],
  ['people()', 'people', patterns.people(), basics.people()],
  ['people({ pages: true })', 'people', patterns.people({ pages: true }), basics.people({ route }), '/team/[slug]'],
  ['posts({ authors: \'people\' })', 'posts', patterns.posts({ authors: 'people' }), basics.posts({ authors: 'people' })],
  ['posts({ authors: \'team\', max: 50 })', 'posts', patterns.posts({ authors: 'team', max: 50 }), basics.posts({ authors: 'team', max: 50 })],
  ['changelog()', 'changelog', patterns.changelog(), basics.changelog()],
  ['jobs()', 'jobs', patterns.jobs(), { ...basics.jobs(), status: { count: true } }],
  ['events()', 'events', patterns.events(), { ...basics.events({}), status: { next: 'when' } }],
  ['sessions({ events, people })', 'sessions', patterns.sessions({ events: 'fairs', people: 'team' }), basics.sessions({ events: 'fairs', people: 'team' })],
  ['sessions({ events })', 'sessions', patterns.sessions({ events: 'events' }), basics.sessions({ events: 'events' })],
  ['downloads()', 'downloads', patterns.downloads(), basics.downloads()],
  ['faq()', 'faq', patterns.faq(), basics.faq()],
  ['gallery()', 'gallery', patterns.gallery(), basics.gallery()],
  ['hours()', 'hours', patterns.hours(), basics.hours()],
  ['hours({ plans })', 'hours', patterns.hours({ plans: 'seasons' }), basics.hours({ plans: 'seasons' })],
  ['hourPlans()', 'hourPlans', patterns.hourPlans(), basics.hourPlans()],
]

describe('patterns', () => {
  it('covers every pattern', () => {
    expect([...new Set(cases.map(([, name]) => name))].sort()).toEqual(Object.keys(patterns).sort())
  })

  it.each(cases)('%s is the brick of its function, in the Studio and in files', (_call, name, pattern, stored, entry) => {
    // A brick with an address field says where its pages are, or that it has none.
    const withAddress = Object.values(stored.fields).some((field) => field.type === 'slug')
    // The key is a variable here, so the types of `entries` (keys of bricks with an address field) cannot follow it.
    const entries = (withAddress ? { [name]: entry ?? null } : {}) as never
    const inStudio = defineSite({ ...base, bricks: { [name]: pattern }, entries, studio: { id: 'halden', bricks: 'all' } })
    expect(inStudio.bricks[name]).toEqual(stored)
    const inFiles = defineSite({ ...base, bricks: { [name]: pattern }, entries })
    expect(inFiles.bricks[name]).toEqual({ ...stored, source: 'files' })
  })

  // Wrong: a site that puts patterns together as the docs say fails the check (a related brick is not found under
  // the key the site gave), or a changed pattern makes labels that do not read as a person would write them.
  it('work together in one site under the site\'s own keys, with pages for entries and a changed brick', () => {
    const { site, legal, notices, people, posts, jobs, events, sessions, downloads, faq, gallery, hours, hourPlans, changelog } = patterns
    const config = defineSite({
      ...base,
      bricks: {
        site: site(), legal: legal(), notices: notices(), jobs: jobs(), downloads: downloads(), faq: faq(), gallery: gallery(), changelog: changelog(),
        news: posts({ authors: 'team' }),
        fairs: events(),
        programme: sessions({ events: 'fairs', people: 'team' }),
        hours: hours({ plans: 'seasons' }),
        seasons: hourPlans(),
        team: extend(people({ pages: true, label: 'Team' }), { tasks: ['add', 'edit', 'remove'] }),
      },
      entries: { legal: '/legal/[slug]', news: '/news/[slug]', jobs: null, fairs: '/fairs/[slug]', team: { de: '/team/[slug]', en: '/people/[slug]' } },
    })
    expect(checkSite(config)).toEqual([])
    expect(config.bricks.team.route).toEqual({ de: '/team/[slug]', en: '/en/people/[slug]' })
    expect(config.bricks.jobs.route).toBeUndefined()
    expect(config.bricks.team.tasks!.map((task) => task.label)).toEqual([
      { de: 'Person hinzufügen', en: 'Add a person', es: 'Añadir una persona', fr: 'Ajouter une personne' },
      { de: 'Person bearbeiten', en: 'Edit a person', es: 'Editar una persona', fr: 'Modifier une personne' },
      { de: 'Person entfernen', en: 'Remove a person', es: 'Eliminar una persona', fr: 'Retirer une personne' },
    ])
  })
})
