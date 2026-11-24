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

/** The pattern and the stored brick it must give: the function's brick, plus the Today line a pattern brings. */
const cases: [keyof typeof patterns, Brick][] = [
  ['site', basics.site()],
  ['legal', basics.legal()],
  ['notices', basics.notices()],
  ['people', basics.people()],
  ['posts', basics.posts({ authors: 'people' })],
  ['changelog', basics.changelog()],
  ['jobs', { ...basics.jobs(), status: { count: true } }],
  ['events', { ...basics.events({}), status: { next: 'when' } }],
  ['sessions', basics.sessions({ people: 'people' })],
  ['downloads', basics.downloads()],
  ['faq', basics.faq()],
  ['gallery', basics.gallery()],
  ['hours', basics.hours({ plans: 'hourPlans' })],
  ['hourPlans', basics.hourPlans()],
]

describe('patterns', () => {
  it('covers every pattern', () => {
    expect(cases.map(([name]) => name).sort()).toEqual(Object.keys(patterns).sort())
  })

  it.each(cases)('%s is the brick of its function, in the Studio and in files', (name, stored) => {
    const pattern: BrickDef = patterns[name]
    const inStudio = defineSite({ ...base, bricks: { [name]: pattern }, studio: { id: 'halden', bricks: 'all' } })
    expect(inStudio.bricks[name]).toEqual(stored)
    const inFiles = defineSite({ ...base, bricks: { [name]: pattern } })
    expect(inFiles.bricks[name]).toEqual({ ...stored, source: 'files' })
  })

  // Wrong: a site that puts patterns together as the docs say fails the check (a related brick is named by another
  // key than the pattern expects), or a changed pattern makes labels that do not read as a person would write them.
  it('work together in one site, with pages for entries and a changed brick', () => {
    const { site, legal, notices, people, posts, jobs, events, sessions, downloads, faq, gallery, hours, hourPlans, changelog } = patterns
    const config = defineSite({
      ...base,
      bricks: {
        site, legal, notices, posts, jobs, events, sessions, downloads, faq, gallery, hours, hourPlans, changelog,
        people: extend(people, { label: 'Team', fields: { slug: f.slug('Adresse', { from: 'name' }) }, tasks: ['add', 'edit', 'remove'] }),
      },
      entries: { legal: '/legal/[slug]', posts: '/news/[slug]', jobs: '/jobs/[slug]', events: '/events/[slug]', people: { de: '/team/[slug]', en: '/people/[slug]' } },
    })
    expect(checkSite(config)).toEqual([])
    expect(config.bricks.people.route).toEqual({ de: '/team/[slug]', en: '/en/people/[slug]' })
    expect(config.bricks.people.tasks!.map((task) => task.label)).toEqual([
      { de: 'Person hinzufügen', en: 'Add a person', es: 'Añadir una persona', fr: 'Ajouter une personne' },
      { de: 'Person bearbeiten', en: 'Edit a person', es: 'Editar una persona', fr: 'Modifier une personne' },
      { de: 'Person entfernen', en: 'Remove a person', es: 'Eliminar una persona', fr: 'Retirer une personne' },
    ])
  })
})
