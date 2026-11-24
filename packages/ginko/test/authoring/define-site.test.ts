// The form a site is written in ('@lupinum/ginko': defineSite, single, collection, extend, f) and the stored form it
// produces. Wrong behaviour these tests catch is named on each test.
import { describe, expect, it } from 'vitest'
import { checkSite } from '../../src/core/index.ts'
import type { BrickValue } from '../../src/core/infer.ts'
import { collection, defineSite, extend, f, single } from '../../src/index.ts'
import * as stored from '../../src/internal.ts'

const base = { name: 'Halden Pumps', url: 'https://halden.example', timeZone: 'Europe/Vienna', currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] } } as const

const services = collection({ untranslated: 'fallback',
  listing: { title: 'title' },
  label: 'Leistungen',
  item: 'Leistung',
  fields: {
    title: f.text('Titel', { max: 80 }),
    slug: f.slug('Adresse', { from: 'title' }),
    until: f.date('Gilt bis', { optional: true }),
    price: f.money('Preis'),
    nextPrice: f.money('Geplanter Preis', { optional: true }),
    priceFrom: f.date('Gilt ab', { optional: true }),
  },
  planned: { field: 'price', next: 'nextPrice', from: 'priceFrom' },
  showUntil: { field: 'until', plusDays: 2, thenDelete: true },
  status: { show: 'ending' },
  tasks: ['add', 'edit', { id: 'price', label: 'Preis ändern', fields: ['price'] }, { id: 'editAll', label: 'Alles ändern', needsApproval: true }, 'remove'],
})

describe('defineSite writes the stored form', () => {
  const site = defineSite({
    ...base,
    locales: ['de', 'en', 'it'],
    bricks: { services, home: single({ label: 'Startseite', fields: { title: f.text('Titel') }, tasks: ['edit'] }) },
    pages: { home: '/', contact: { de: '/kontakt', en: '/contact' } },
    entries: { services: { de: '/leistungen/[slug]', en: '/services/[slug]', it: '/servizi/[slug]' } },
    studio: { id: 'halden', url: 'https://cms.example.com', bricks: ['services'] },
    texts: { en: { services: { label: 'Services', item: 'a service', tasks: { price: 'Change a price' } } } },
  })

  // Wrong: a brick outside `studio.bricks` is stored as a Studio brick, so the owner gets a form for content in files.
  it('stores where each brick lives, the id and the Studio address', () => {
    expect(site.site).toBe('halden')
    expect(site.platform).toBe('https://cms.example.com')
    expect(site.bricks.services.source).toBeUndefined()
    expect(site.bricks.home.source).toBe('files')
  })

  // Wrong: a path of another language is stored without its prefix, so two languages answer on one address.
  it('adds the language prefix to every path but the main language', () => {
    expect(site.pages).toEqual({ home: { de: '/', en: '/en', it: '/it' }, contact: { de: '/kontakt', en: '/en/contact' } })
    expect(site.bricks.services.route).toEqual({ de: '/leistungen/[slug]', en: '/en/services/[slug]', it: '/it/servizi/[slug]' })
    // The stored form wants the page of an entry in every language (`checkSite`); here it is a type error.
    // @ts-expect-error `it` has no path
    const missing = () => defineSite({ ...base, locales: ['de', 'it'], bricks: { services }, entries: { services: { de: '/leistungen/[slug]' } } })
    expect(typeof missing).toBe('function')
  })

  // Wrong: the standard edit form lets the owner change the address of an entry (links break), or an own task loses
  // the plan fields of a planned value, which the check then reports.
  it('makes the standard tasks, without the address in "edit" and with the plan next to a planned field', () => {
    expect(site.bricks.services.tasks).toEqual([
      { id: 'add', label: { de: 'Leistung hinzufügen', en: 'Add a service' }, kind: 'create' },
      { id: 'edit', label: { de: 'Leistung bearbeiten', en: 'Edit a service' }, kind: 'edit', pick: true, fields: ['title', 'until', 'price', 'nextPrice', 'priceFrom'] },
      { id: 'price', label: { de: 'Preis ändern', en: 'Change a price' }, kind: 'edit', pick: true, fields: ['price', 'nextPrice', 'priceFrom'] },
      { id: 'editAll', label: 'Alles ändern', kind: 'edit', pick: true, fields: ['title', 'until', 'price', 'nextPrice', 'priceFrom'], needsApproval: true },
      { id: 'remove', label: { de: 'Leistung entfernen', en: 'Remove a service' }, kind: 'remove' },
    ])
    expect(site.bricks.home.tasks).toEqual([{ id: 'edit', label: 'Startseite bearbeiten', kind: 'edit', fields: ['title'] }])
  })

  // Wrong: a default or a renamed key is stored under another name or value than the stored form reads.
  it('stores the defaults and the renamed keys in the stored form', () => {
    const { max, order, visible, status, label } = site.bricks.services
    expect({ max, order, visible, status, label }).toEqual({
      max: 500, order: 'manual', visible: { mode: 'until', field: 'until', days: 2, deleteExpired: true }, status: { count: true }, label: { de: 'Leistungen', en: 'Services' },
    })
    expect(checkSite(site)).toEqual([])
  })

  // Checked by `tsc`: an entry of a brick with a line in `entries` has `url`; one without has none.
  it('types the page of an entry', () => {
    const url = (value: BrickValue<(typeof site)['bricks']['services']>): string => value.items[0]!.url
    expect(typeof url).toBe('function')
  })
})

describe('the labels of the standard tasks', () => {
  const labelsOf = (locales: readonly [string, ...string[]], item: Parameters<typeof collection>[0]['item'], texts = {}) =>
    defineSite({ ...base, locales, texts, bricks: { faq: collection({ untranslated: 'fallback', listing: { title: 'question' }, label: 'FAQ', item, fields: { question: f.text('Frage') }, tasks: ['add', 'edit', 'remove'] }) } })
      .bricks.faq.tasks!.map((task) => task.label)

  // Wrong: Ginko changes the words the developer wrote (an added article, a lowered letter), so a label reads
  // "Add a the menu" or "Add faq", and the rule differs by language.
  it.each([
    [['en'], 'an event', {}, ['Add an event', 'Edit an event', 'Remove an event']],
    [['en'], 'the FAQ', {}, ['Add the FAQ', 'Edit the FAQ', 'Remove the FAQ']],
    [['en'], undefined, {}, ['Add an entry', 'Edit an entry', 'Remove an entry']],
    [['de'], undefined, {}, ['Eintrag hinzufügen', 'Eintrag bearbeiten', 'Eintrag entfernen']],
    [['de', 'fr', 'es'], 'Frage', { fr: { faq: { item: 'une question' } }, es: { faq: { item: 'una pregunta' } } }, [
      { de: 'Frage hinzufügen', fr: 'Ajouter une question', es: 'Añadir una pregunta' },
      { de: 'Frage bearbeiten', fr: 'Modifier une question', es: 'Editar una pregunta' },
      { de: 'Frage entfernen', fr: 'Retirer une question', es: 'Eliminar una pregunta' },
    ]],
    // A text for the task in the label file replaces the made label.
    [['de', 'fr'], 'Frage', { fr: { faq: { item: 'une question', tasks: { add: 'Poser une question' } } } }, [
      { de: 'Frage hinzufügen', fr: 'Poser une question' }, { de: 'Frage bearbeiten', fr: 'Modifier une question' }, { de: 'Frage entfernen', fr: 'Retirer une question' },
    ]],
    // A language Ginko has no words for gets no made text: the Studio shows the main language, not a mix of two.
    [['de', 'it'], 'Frage', { it: { faq: { item: 'domanda' } } }, [{ de: 'Frage hinzufügen' }, { de: 'Frage bearbeiten' }, { de: 'Frage entfernen' }]],
  ] as const)('%j with item %j', (locales, item, texts, expected) => {
    expect(labelsOf(locales, item, texts)).toEqual(expected)
  })

  // Wrong: a single has no way to say its words, so English reads "Edit Home page".
  it('names the task of a single with its `item`, else with its label', () => {
    const home = (item?: string) => defineSite({ ...base, locales: ['en'], bricks: { home: single({ label: 'Home page', item, fields: { title: f.text('Title') }, tasks: ['edit'] }) } }).bricks.home.tasks![0]!.label
    expect(home('the home page')).toBe('Edit the home page')
    expect(home()).toBe('Edit Home page')
  })
})

describe('label files', () => {
  const contact = single({
    label: 'Kontakt',
    fields: {
      street: f.text('Straße', { group: 'Adresse' }),
      city: f.text('Ort', { group: 'Adresse', hint: 'Mit Postleitzahl.' }),
      kind: f.choice('Art', { options: [{ value: 'shop', label: 'Laden' }, { value: 'office', label: 'Büro' }] }),
      facts: f.list('Fakten', { itemLabel: 'Fakt', fields: { text: f.text('Text') } }),
    },
  })

  // Wrong: a group heading must be translated once per field, or a translated text lands on the wrong part of a field.
  it('gives every text its other languages, a group heading once per brick', () => {
    const site = defineSite({
      ...base, locales: ['de', 'en'], bricks: { contact },
      texts: { en: { contact: { label: 'Contact', groups: { Adresse: 'Address' }, fields: {
        street: 'Street', city: { label: 'City', hint: 'With postcode.' }, kind: { label: 'Kind', options: { shop: 'Shop', office: 'Office' } },
        facts: { label: 'Facts', itemLabel: 'Fact', fields: { text: 'Text' } },
      } } } },
    })
    const { street, city, kind, facts } = site.bricks.contact.fields
    expect(street).toMatchObject({ label: { de: 'Straße', en: 'Street' }, group: { de: 'Adresse', en: 'Address' } })
    expect(city).toMatchObject({ label: { de: 'Ort', en: 'City' }, group: { de: 'Adresse', en: 'Address' }, hint: { de: 'Mit Postleitzahl.', en: 'With postcode.' } })
    expect(kind.options).toEqual([{ value: 'shop', label: { de: 'Laden', en: 'Shop' } }, { value: 'office', label: { de: 'Büro', en: 'Office' } }])
    expect(facts).toMatchObject({ label: { de: 'Fakten', en: 'Facts' }, itemLabel: { de: 'Fakt', en: 'Fact' }, of: { text: { label: { de: 'Text', en: 'Text' } } }, max: 50 })
  })

  // Wrong: a renamed field leaves its old translation behind without a word, and the Studio shows German to an
  // English editor.
  it('stops on a key that names nothing', () => {
    expect(() => defineSite({
      ...base, locales: ['de', 'en'], bricks: { contact },
      texts: { en: { contact: { groups: { Anschrift: 'Address' }, fields: { zip: 'Postcode', kind: { options: { cafe: 'Café' } } }, tasks: { edit: 'Edit' } }, team: { label: 'Team' } } },
    })).toThrow([
      'ginko.config.ts:',
      '- i18n/studio/en.json: team names no brick.',
      '- i18n/studio/en.json: contact.tasks.edit names no task.',
      '- i18n/studio/en.json: contact.zip names no field.',
      '- i18n/studio/en.json: contact.kind.options.cafe names no option.',
      '- i18n/studio/en.json: contact.groups.Anschrift names no group heading.',
    ].join('\n'))
  })
})

describe('a config or a brick in the form of 0.18', () => {
  // Wrong: a site of 0.18 gets a type error wall or a silent wrong model instead of what to change.
  it('stops and names the new keys', () => {
    const old = { ...base, site: 'halden', locales: ['de'], pages: {}, bricks: {} }
    expect(() => defineSite(old as never)).toThrow(/form of Ginko 0\.18[\s\S]*`studio: \{ id, url, bricks \}`/)
  })

  it('names the new place of a moved key', () => {
    const brick = collection({ untranslated: 'hide', listing: { title: 'title' }, label: 'News', fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) }, ...({ source: 'files', route: { de: '/news/[slug]' }, status: { age: 'date' }, tasks: [{ id: 'write', label: 'Schreiben', kind: 'create' }] } as object) })
    expect(() => defineSite({ ...base, locales: ['de', 'en'], bricks: { news: brick }, entries: { news: '/news/[slug]' }, pages: { news: { de: '/news', en: '/en/news' } } })).toThrow([
      'ginko.config.ts:',
      '- news.source: where a brick lives is `studio.bricks` in the site file.',
      '- news.route: the address of an entry is `entries` in the site file.',
      '- news.tasks.write: write `kind: \'add\'`.',
      '- news.status: write `{ show: … }`, such as `{ show: \'next\', field: \'when\' }`.',
      '- pages.news.en: write the path without the language prefix (“/news”). Ginko adds “/en”.',
    ].join('\n'))
  })

  // Wrong: a brick of the stored form (Ginko 0.18, an old preset) passes without the checks of the written form, or
  // stops without saying what to write instead.
  it('refuses a brick made with the stored-form builders and names the way', () => {
    const news = stored.collection({ untranslated: 'fallback', label: 'News', listing: { title: 'title' }, max: 20, order: 'manual', fields: { title: stored.f.text('Titel'), slug: stored.f.slug('Adresse', { from: 'title' }) } })
    expect(() => defineSite({ ...base, locales: ['de'], bricks: { news } as never, entries: { news: '/news/[slug]' } as never })).toThrow(
      "- bricks.news is a brick of the stored form (Ginko 0.18). Take its pattern from '@lupinum/ginko/patterns' or from the preset, or write it with `single` or `collection` of '@lupinum/ginko'.",
    )
  })
})

describe('what the site file must say', () => {
  const news = collection({ untranslated: 'fallback', listing: { title: 'title' }, label: 'News', fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }) }, tasks: [{ id: 'write', label: 'Schreiben', kind: 'add' }] })

  // Wrong: a forgotten line in `entries` gives a site without the pages of its entries, and no message.
  it('asks for the page of a brick with an address field, or `null` for none', () => {
    expect(() => defineSite({ ...base, locales: ['de'], bricks: { news } })).toThrow('- entries: “news” has an address field but no line here. Write `news: \'/news/[slug]\'` for a page per entry, or `news: null` for none.')
    const site = defineSite({ ...base, locales: ['de'], bricks: { news }, entries: { news: null } })
    expect(site.bricks.news.route).toBeUndefined()
    expect(site.bricks.news.tasks).toEqual([{ id: 'write', label: 'Schreiben', kind: 'create' }])
  })

  // Wrong: a ready-made brick given without its call stops with "Cannot convert undefined or null to object".
  it('names a brick function that was not called', () => {
    const notices = () => news
    expect(() => defineSite({ ...base, locales: ['de'], bricks: { notices } as never })).toThrow('- bricks.notices is a function. Call it: `notices: notices()`.')
    expect(() => extend(notices as never, {})).toThrow(/is a function\. Call it/)
  })
})

describe('extend', () => {
  const jobs = collection({ untranslated: 'fallback',
    listing: { title: 'title' },
    label: 'Stellen', item: 'Stelle',
    fields: { title: f.text('Titel'), slug: f.slug('Adresse', { from: 'title' }), until: f.date('Bewerbung bis', { optional: true }) },
    showUntil: 'until', status: { show: 'ending' }, tasks: ['add', 'edit', 'remove'],
  })

  // Wrong: a changed ready-made brick loses a stored name of the original (a release refuses that), or a new task
  // cannot name the added field.
  it('adds fields and replaces label, tasks and the Today line', () => {
    const own = extend(jobs, {
      label: 'Jobs',
      fields: { team: f.text('Team', { optional: true }) },
      tasks: ['add', { id: 'team', label: 'Team ändern', fields: ['team'] }],
      status: { show: 'missing', field: 'team' },
    })
    const site = defineSite({ ...base, locales: ['de'], bricks: { jobs: own }, entries: { jobs: '/jobs/[slug]' } })
    expect(Object.keys(site.bricks.jobs.fields)).toEqual(['title', 'slug', 'until', 'team'])
    expect(site.bricks.jobs).toMatchObject({ label: 'Jobs', status: { missing: 'team' }, visible: { mode: 'until', field: 'until' } })
    expect(site.bricks.jobs.tasks!.map((task) => task.id)).toEqual(['add', 'team'])
    // The original is not changed.
    expect(Object.keys(jobs.fields)).toEqual(['title', 'slug', 'until'])
    // @ts-expect-error a task of the changed brick names a field that neither the brick nor the change has
    extend(jobs, { tasks: [{ id: 'x', label: 'X', fields: ['salary'] }] })
  })

  // Wrong: a site cannot change what a pattern states about its list rows or a missing translation (basics `people`
  // sets `untranslated` from `route`), so it keeps the pattern's choice or has to copy the whole brick.
  it('replaces listing and untranslated of a collection', () => {
    const own = extend(jobs, { listing: { title: 'title', detail: 'until' }, untranslated: 'hide' })
    const site = defineSite({ ...base, locales: ['de', 'en'], bricks: { jobs: own }, entries: { jobs: '/jobs/[slug]' } })
    expect(site.bricks.jobs).toMatchObject({ listing: { title: 'title', detail: 'until' }, untranslated: 'hide' })
    // @ts-expect-error listing.title names a field the brick does not have
    extend(jobs, { listing: { title: 'salary' } })
  })

  it('refuses to replace a field, and a brick that was not made with this entry', () => {
    expect(() => extend(jobs, { fields: { title: f.longtext('Titel') } })).toThrow('extend: the brick already has the field title.')
    const old = stored.single({ label: 'Alt', fields: { title: stored.f.text('Titel') } })
    expect(() => extend(old as never, {})).toThrow(/made with `single` or `collection`/)
  })
})
