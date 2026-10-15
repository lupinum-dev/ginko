// @lupinum/ginko/basics: the stored names a site's data depends on, `source` only when asked, labels in every Studio
// language, the JSON-LD per type, and a files site with every brick that builds and moves to the platform unchanged.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFileBundles, publicBundle } from '@lupinum/ginko-content'
import { defineSite, type Brick, type Field, type Label } from '@lupinum/ginko'
import { authors, changelog, downloads, faq, faqJsonLd, jobJsonLd, jobs, legal, people, personJsonLd, postJsonLd, posts, site, siteJsonLd, withoutFiles } from '@lupinum/ginko/basics'
import { checkSite, serializeSchema } from '@lupinum/ginko/internal'

const route = (path: string) => ({ en: `/${path}/[slug]`, de: `/de/${path}/[slug]` }) as const

const factories: Record<string, (o: { source?: 'files' }) => Brick> = {
  site, legal, people, posts, authors, changelog, jobs, faq, downloads,
}

/** `field name: type` of each stored field, with `?` for optional ones: the data of every site that uses the brick. */
const shape = (brick: Brick) => Object.entries(brick.fields).map(([name, field]) => `${name}${field.optional ? '?' : ''}: ${field.type}`)

describe('basics factories', () => {
  it.each([
    ['site', ['legalName?: text', 'street?: text', 'postalCode?: text', 'city?: text', 'email?: text', 'phone?: text', 'registryNumber?: text', 'registryCourt?: text', 'vatId?: text']],
    ['legal', ['title: text', 'description?: longtext', 'slug: slug', 'legalType: choice', 'updatedAt: date', 'body: markdown']],
    ['people', ['name: text', 'role?: text', 'bio?: longtext', 'email?: text', 'phone?: text', 'photo?: image']],
    ['posts', ['title: text', 'description?: longtext', 'date: date', 'authors?: ref', 'image?: image', 'tags?: list', 'slug: slug', 'body: markdown']],
    ['authors', ['name: text', 'role?: text', 'avatar?: image', 'url?: text']],
    ['changelog', ['version: text', 'date: date', 'body: markdown']],
    ['jobs', ['title: text', 'description: longtext', 'slug: slug', 'location: text', 'employmentType: choice', 'remote: choice', 'applyUrl?: text', 'applyEmail?: text', 'validUntil: date', 'body: markdown']],
    ['faq', ['question: text', 'answer: longtext']],
    ['downloads', ['title: text', 'summary?: longtext', 'date: date', 'file: file']],
  ])('%s keeps its stored field names and types', (name, expected) => {
    expect(shape(factories[name]!({}))).toEqual(expected)
  })

  it('keeps the stored choice values of legal texts and jobs', () => {
    const values = (field: Field) => (field.type === 'choice' ? field.options.map((o) => o.value) : [])
    expect(values(legal().fields.legalType)).toEqual(['privacy', 'customer-privacy', 'imprint', 'terms', 'cookies', 'accessibility'])
    expect(values(jobs().fields.employmentType)).toEqual(['fullTime', 'partTime', 'freelance', 'internship', 'apprenticeship'])
    expect(values(jobs().fields.remote)).toEqual(['onsite', 'hybrid', 'remote'])
    expect(posts().fields.authors).toMatchObject({ to: 'authors', multiple: true })
  })

  it('emits `source` only when it is passed', () => {
    for (const [name, make] of Object.entries(factories)) {
      expect(Object.hasOwn(make({}), 'source'), name).toBe(false)
      expect(make({ source: 'files' }).source, name).toBe('files')
    }
  })

  it('takes a route only when one is passed, and a job leaves the site after `validUntil`', () => {
    expect(legal().route).toBeUndefined()
    expect(legal({ route: route('legal') }).route).toEqual({ en: '/legal/[slug]', de: '/de/legal/[slug]' })
    expect(jobs().visible).toEqual({ mode: 'until', field: 'validUntil' })
  })

  it('labels every brick, field, option and task in German, English, Spanish and French', () => {
    const missing: string[] = []
    const check = (path: string, label: Label | undefined) => {
      if (label === undefined) return
      if (typeof label === 'string' || Object.keys(label).sort().join() !== 'de,en,es,fr') missing.push(path)
    }
    const field = (path: string, input: Field) => {
      check(path, input.label)
      check(`${path}.hint`, input.hint)
      if (input.type === 'choice' || input.type === 'choices') for (const o of input.options) check(`${path}.${o.value}`, o.label)
      if (input.type === 'list') {
        check(`${path}.itemLabel`, input.itemLabel)
        for (const [name, column] of Object.entries(input.of)) field(`${path}.${name}`, column)
      }
    }
    for (const [name, make] of Object.entries(factories)) {
      const brick = make({})
      check(name, brick.label)
      check(`${name}.describe`, brick.describe)
      for (const [key, input] of Object.entries(brick.fields)) field(`${name}.${key}`, input)
      for (const task of brick.tasks ?? []) check(`${name}.task.${task.id}`, task.label)
    }
    expect(missing).toEqual([])
  })
})

describe('basics JSON-LD', () => {
  it.each([
    ['Organization', undefined],
    ['NGO', 'NGO'],
    ['LocalBusiness', 'LocalBusiness'],
  ] as const)('site as %s, with the address and the country of the config', (type, option) => {
    expect(siteJsonLd(
      { legalName: 'River Commons e.V.', street: 'Uferweg 3', postalCode: '10115', city: 'Berlin', email: 'hello@example.org', phone: '+49 30 1234567', vatId: 'DE123456789' },
      { name: 'River Commons', url: 'https://river.example', country: 'DE', ...(option ? { type: option } : {}) },
    )).toEqual({
      '@context': 'https://schema.org',
      '@type': type,
      name: 'River Commons',
      legalName: 'River Commons e.V.',
      url: 'https://river.example',
      email: 'hello@example.org',
      telephone: '+49 30 1234567',
      address: { '@type': 'PostalAddress', streetAddress: 'Uferweg 3', postalCode: '10115', addressLocality: 'Berlin', addressCountry: 'DE' },
      vatID: 'DE123456789',
    })
  })

  it('site without an address has no address, not one with only a country', () => {
    expect(siteJsonLd({}, { name: 'My site', url: 'https://my.example', country: 'AT' })).toEqual({
      '@context': 'https://schema.org', '@type': 'Organization', name: 'My site', url: 'https://my.example',
    })
  })

  it('person', () => {
    expect(personJsonLd({ name: 'Mara Lind', role: 'Physiotherapist', bio: 'Treats runners.', image: 'https://p.example/mara.webp', worksFor: { name: 'Hofer Physio', url: 'https://p.example' } })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Mara Lind',
      jobTitle: 'Physiotherapist',
      description: 'Treats runners.',
      image: 'https://p.example/mara.webp',
      worksFor: { '@type': 'Organization', name: 'Hofer Physio', url: 'https://p.example' },
    })
  })

  it('blog post', () => {
    expect(postJsonLd({
      title: 'River clean-up', url: 'https://river.example/news/clean-up', date: '2026-09-01', modified: '2026-09-03T10:00:00.000Z',
      description: 'Forty people, one afternoon.', authors: [{ name: 'Lea', url: 'https://lea.example' }, { name: 'Tom' }], tags: ['River', 'Volunteers'], lang: 'en',
    })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'River clean-up',
      url: 'https://river.example/news/clean-up',
      mainEntityOfPage: 'https://river.example/news/clean-up',
      description: 'Forty people, one afternoon.',
      datePublished: '2026-09-01',
      dateModified: '2026-09-03T10:00:00.000Z',
      author: [{ '@type': 'Person', name: 'Lea', url: 'https://lea.example' }, { '@type': 'Person', name: 'Tom' }],
      keywords: 'River, Volunteers',
      inLanguage: 'en',
    })
  })

  it.each([
    ['an on-site job', { employmentType: 'fullTime', remote: 'onsite' }, {
      employmentType: 'FULL_TIME',
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Linz', addressCountry: 'AT' } },
    }],
    ['a remote job', { employmentType: 'apprenticeship', remote: 'remote' }, {
      employmentType: 'OTHER',
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Linz', addressCountry: 'AT' } },
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: { '@type': 'Country', name: 'AT' },
    }],
  ] as const)('job posting: %s, valid through its last day', (_, input, expected) => {
    expect(jobJsonLd({
      title: 'Service technician', url: 'https://halden.example/jobs/technician', description: 'You keep pumps running.',
      datePosted: '2026-10-01', validUntil: '2026-11-30', location: 'Linz', country: 'AT',
      organization: { name: 'Halden Pumps', url: 'https://halden.example' }, ...input,
    })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Service technician',
      url: 'https://halden.example/jobs/technician',
      description: 'You keep pumps running.',
      datePosted: '2026-10-01',
      validThrough: '2026-11-30',
      hiringOrganization: { '@type': 'Organization', name: 'Halden Pumps', sameAs: 'https://halden.example' },
      ...expected,
    })
  })

  it('FAQ page', () => {
    expect(faqJsonLd([{ question: 'Do I need a referral?', answer: 'No.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Do I need a referral?', acceptedAnswer: { '@type': 'Answer', text: 'No.' } }],
    })
  })
})

describe('a files site with every basic', () => {
  const config = defineSite({
    site: 'basics', name: 'Basics', url: 'https://basics.example', timeZone: 'Europe/Berlin',
    locales: ['en', 'de'], currency: 'EUR', pages: { home: { en: '/', de: '/de' } },
    bricks: {
      site: site({ source: 'files' }),
      legal: legal({ source: 'files', route: route('legal') }),
      people: people({ source: 'files' }),
      posts: posts({ source: 'files', route: route('blog') }),
      authors: authors({ source: 'files' }),
      changelog: changelog({ source: 'files' }),
      jobs: jobs({ source: 'files', route: route('jobs') }),
      faq: faq({ source: 'files' }),
      downloads: downloads({ source: 'files' }),
    },
  })

  /** A site folder with `content/` and `public/` from a map of relative paths to file contents. */
  function folder(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'ginko-basics-'))
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    return { contentDir: join(root, 'content'), publicDir: join(root, 'public') }
  }
  const md = (front: string, body = 'Text.') => `---\n${front}\n---\n\n${body}\n`

  it('builds every brick from files, and an expired job is not served', async () => {
    const { bundles, errors } = await buildFileBundles({
      ...folder({
        'content/site.yml': 'legalName: Basics GmbH\nstreet: Hauptstraße 1\npostalCode: "10115"\ncity: Berlin\nemail: hi@basics.example\nvatId: DE123456789\n',
        'content/legal/imprint.md': md('title: Imprint\nlegalType: imprint\nupdatedAt: 2026-10-01', 'Basics GmbH, Berlin.'),
        'content/people/mara.yml': 'name: Mara Lind\nrole: Founder\n',
        'content/authors/mara.yml': 'name: Mara Lind\nurl: https://mara.example\n',
        'content/posts/1.hello.md': md('title: Hello\ndate: 2026-10-10\nauthors: [authors/mara]\ntags: [News]'),
        'content/changelog/v1-0-0.md': md('version: 1.0.0\ndate: 2026-10-12'),
        'content/jobs/technician.md': md('title: Technician\ndescription: Pumps.\nlocation: Berlin\nemploymentType: fullTime\nremote: onsite\nvalidUntil: 2026-11-30'),
        'content/jobs/old.md': md('title: Old job\ndescription: Gone.\nlocation: Berlin\nemploymentType: partTime\nremote: hybrid\nvalidUntil: 2026-09-30'),
        'content/faq/referral.yml': 'question: Do I need a referral?\nanswer: "No."\n',
        'content/downloads/report.yml': 'title: Annual report\ndate: 2026-03-01\nfile: /reports/2025.pdf\n',
        'public/reports/2025.pdf': '%PDF-1.4\n%%EOF\n',
      }),
      schema: serializeSchema(config),
      now: new Date('2026-10-15T10:00:00Z'),
    })
    expect(errors).toEqual([])
    const served = publicBundle(bundles.en!, serializeSchema(config), new Date('2026-10-15T10:00:00Z'))
    const ids = (key: string) => { const b = served.bricks[key]; return b?.kind === 'collection' ? b.items.map((i) => i.id) : [] }
    expect(served.bricks.site).toMatchObject({ kind: 'single', data: { legalName: 'Basics GmbH', city: 'Berlin' } })
    expect(Object.fromEntries(['legal', 'people', 'posts', 'authors', 'changelog', 'jobs', 'faq', 'downloads'].map((k) => [k, ids(k)]))).toEqual({
      legal: ['legal/imprint'], people: ['people/mara'], posts: ['posts/hello'], authors: ['authors/mara'], changelog: ['changelog/v1-0-0'],
      jobs: ['jobs/technician'], faq: ['faq/referral'], downloads: ['downloads/report'],
    })
  })

  it('passes checkSite, and so does its platform twin without any `source`', () => {
    const twin = withoutFiles(config)
    expect(checkSite(config)).toEqual([])
    expect(checkSite(twin)).toEqual([])
    // @ts-expect-error The twin's type has no `source` either: a tool that reads it must not see 'files'.
    expect(twin.bricks.site.source).toBeUndefined()
    expect(Object.values(twin.bricks).filter((b) => Object.hasOwn(b, 'source'))).toEqual([])
    expect(Object.values(config.bricks).every((b) => b.source === 'files')).toBe(true)
  })
})
