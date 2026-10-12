// A preset that fails the core's schema check breaks every site that declares it, and a wrong expiry rule shows closed jobs.
import { defineSite, f, type CollectionBrick, type SiteInput } from '@lupinum/ginko'
import { checkSchema, serializeSchema } from '@lupinum/ginko/internal'
import { describe, expect, it } from 'vitest'
import { authors, blog, caseStudies, faq, jobs, legal, openJobs, services, team } from '../src/index.ts'

const siteWith = (bricks: Record<string, any>, locales: SiteInput['locales'] = ['de', 'en']) =>
  defineSite({
    site: 'agency', name: 'Agency', url: 'https://agency.example', timezone: 'Europe/Vienna',
    locales, currency: 'EUR', pages: { home: locales.length === 1 ? '/' : { de: '/', en: '/en' } }, bricks,
  })

const problems = (bricks: Record<string, any>, locales?: SiteInput['locales']) => checkSchema(serializeSchema(siteWith(bricks, locales)))

describe('openJobs', () => {
  const job = (id: string, validUntil?: string | null) => ({ id, validUntil })
  it.each([
    ['no date stays open', [job('a')], '2026-10-11', ['a']],
    ['null date stays open', [job('a', null)], '2026-10-11', ['a']],
    ['open through the day of validUntil', [job('a', '2026-10-11')], '2026-10-11', ['a']],
    ['closed the day after', [job('a', '2026-10-10')], '2026-10-11', []],
    ['keeps order, drops only the expired', [job('a', '2026-12-01'), job('b', '2026-01-01'), job('c')], '2026-10-11', ['a', 'c']],
  ])('%s', (_name, items, today, expected) => {
    expect(openJobs(items, today).map((j) => j.id)).toEqual(expected)
  })
})

describe('every factory passes the core schema check', () => {
  const all = {
    default: () => ({ services: services(), caseStudies: caseStudies(), blog: blog(), authors: authors(), legal: legal(), faq: faq(), team: team(), jobs: jobs() }),
    'custom routes, keys and extra fields': () => ({
      leistungen: services({ route: { de: '/angebot/[slug]', en: '/en/offer/[slug]' }, extra: { color: f.text('Farbe', { optional: true }) } }),
      referenzen: caseStudies({ servicesBrick: 'leistungen', route: { de: '/projekte/[slug]', en: '/en/work/[slug]' } }),
      artikel: blog({ authorsBrick: 'autoren', route: { de: '/journal/[slug]', en: '/en/journal/[slug]' } }),
      autoren: authors({ route: { de: '/autoren/[slug]', en: '/en/authors/[slug]' } }),
      rechtliches: legal({ types: [{ value: 'imprint', label: 'Impressum' }], route: { de: '/recht/[slug]', en: '/en/legal/[slug]' } }),
      faq: faq({ source: 'platform', max: 10 }),
      team: team({ extra: { slug: f.slug('Adresse', { from: 'name' }) }, route: { de: '/team/[slug]', en: '/en/team/[slug]' } }),
      stellen: jobs({ route: { de: '/jobs/[slug]', en: '/en/jobs/[slug]' }, label: 'Offene Stellen' }),
    }),
    'without relations': () => ({ blog: blog({ authorsBrick: false }), caseStudies: caseStudies({ servicesBrick: false }) }),
  }
  it.each(Object.entries(all))('%s', (_name, bricks) => {
    expect(problems(bricks())).toEqual([])
  })

  it('a relation to a brick the site does not have is reported', () => {
    expect(problems({ blog: blog() }).join('\n')).toContain('blog.author')
  })

  it('a Spanish-only site passes too, with English as the label fallback', () => {
    const spanish = {
      services: services({ route: { es: '/servicios/[slug]' } }), caseStudies: caseStudies({ route: { es: '/casos/[slug]' } }),
      blog: blog({ route: { es: '/blog/[slug]' } }), authors: authors({ route: { es: '/autores/[slug]' } }), legal: legal({ route: { es: '/[slug]' } }),
      faq: faq(), team: team({ extra: { slug: f.slug('Adresse', { from: 'name' }) }, route: { es: '/equipo/[slug]' } }), jobs: jobs({ route: { es: '/empleo/[slug]' } }),
    }
    expect(problems(spanish, ['es'])).toEqual([])
  })

  it('extra fields join the preset fields, and field labels are replaced', () => {
    const brick = services({ extra: { color: f.text('Farbe') }, fieldLabels: { outcome: 'Wirkung' } })
    expect(Object.keys(brick.fields)).toEqual(['title', 'description', 'slug', 'icon', 'featured', 'outcome', 'body', 'color'])
    expect(brick.fields.outcome.label).toBe('Wirkung')
  })
})

describe('labels', () => {
  it('come in German and English', () => {
    expect(services().label).toEqual({ de: 'Leistungen', en: 'Services' })
    expect(services().fields.title!.label).toEqual({ de: 'Titel', en: 'Title' })
  })

  it('a label or field label override may be a text or a { de, en } record', () => {
    expect(jobs({ label: { de: 'Stellen', en: 'Careers' } }).label).toEqual({ de: 'Stellen', en: 'Careers' })
    expect(services({ fieldLabels: { outcome: { de: 'Wirkung', en: 'Impact' } } }).fields.outcome!.label).toEqual({ de: 'Wirkung', en: 'Impact' })
  })
})

// Lupinum's own site (v7) keeps German folders and routes; this mirrors its collections and lists every field it uses.
describe('a config like lupinum-v7 can be expressed', () => {
  const v7 = siteWith({
    leistungen: services({ route: { de: '/leistungen/[slug]' } }),
    referenzen: caseStudies({ servicesBrick: 'leistungen', route: { de: '/referenzen/[slug]' } }),
    blog: blog({ route: { de: '/blog/[slug]' } }),
    rechtliches: legal({ route: { de: '/[slug]' } }),
    authors: authors(),
    faq: faq(),
  }, ['de'])
  const schema = serializeSchema(v7)

  it('passes the schema check', () => {
    expect(checkSchema(schema)).toEqual([])
  })

  it('keeps v7 routes and the order rules', () => {
    const route = (key: string) => (schema.bricks[key] as CollectionBrick).route?.de
    expect(['leistungen', 'referenzen', 'blog', 'rechtliches', 'authors', 'faq'].map(route)).toEqual(
      ['/leistungen/[slug]', '/referenzen/[slug]', '/blog/[slug]', '/[slug]', undefined, undefined],
    )
  })

  // Field names from v7's ginko.config.ts. `updated` is `updatedAt` in the preset.
  it.each([
    ['leistungen', ['title', 'description', 'slug', 'icon', 'featured', 'outcome', 'body']],
    ['referenzen', ['title', 'description', 'slug', 'client', 'industry', 'outcome', 'date', 'summary', 'services', 'serviceCategories', 'homeOrder', 'featured', 'period', 'measurable', 'body']],
    ['blog', ['title', 'description', 'slug', 'badge', 'date', 'readingTime', 'author', 'body']],
    ['rechtliches', ['title', 'description', 'slug', 'legalType', 'updatedAt', 'body']],
    ['authors', ['name', 'slug', 'role', 'bio', 'avatar', 'links']],
    ['faq', ['question', 'answer', 'category']],
  ])('%s has the fields v7 uses', (key, names) => {
    expect(names.filter((name) => !(name in schema.bricks[key]!.fields))).toEqual([])
  })

  it('points blog.author at authors and referenzen at leistungen', () => {
    expect(schema.bricks.blog!.fields.author).toMatchObject({ type: 'ref', to: 'authors' })
    expect(schema.bricks.referenzen!.fields.relatedServices).toMatchObject({ type: 'ref', to: 'leistungen', multiple: true })
  })
})
