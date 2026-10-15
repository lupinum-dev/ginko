// Events and sessions of the basics. Wrong behaviour caught: search engines show an event an hour off (no offset, or
// the winter offset in summer), a cancelled session still looks scheduled, a session that ends before it starts is
// saved, and the sessions brick does not pass the platform's schema check.
import { describe, expect, it } from 'vitest'
import { collection, defineSite, f, serializeSchema, checkSchema, validate, type Issue } from '../../src/core/index.ts'
import { eventJsonLd, events, sessions, sessionsInOrder, type EventJsonLdInput } from '../../src/basics/index.ts'

const event = (over: Partial<EventJsonLdInput> = {}): EventJsonLdInput => ({
  title: 'Open Data Days', url: 'https://odd.example/en/events/odd', when: { from: '2026-12-03', to: '2026-12-04' }, timeZone: 'Europe/Vienna', ...over,
})

describe('eventJsonLd', () => {
  it.each([
    ['a winter date (CET)', { when: { from: '2026-12-03', to: '2026-12-04' }, start: '09:00', end: '17:30' }, '2026-12-03T09:00:00+01:00', '2026-12-04T17:30:00+01:00'],
    ['a summer date (CEST)', { when: { from: '2026-07-02', to: '2026-07-02' }, start: '19:00', end: '22:00' }, '2026-07-02T19:00:00+02:00', '2026-07-02T22:00:00+02:00'],
    ['across the change to winter time', { when: { from: '2026-10-24', to: '2026-10-25' }, start: '10:00', end: '16:00' }, '2026-10-24T10:00:00+02:00', '2026-10-25T16:00:00+01:00'],
    ['dates only', { when: { from: '2026-12-03', to: '2026-12-04' } }, '2026-12-03', '2026-12-04'],
  ])('%s', (_, over, startDate, endDate) => {
    expect(eventJsonLd(event(over))).toMatchObject({ startDate, endDate })
  })

  it('a place, an online address or both set the attendance mode; the site country fills the address', () => {
    const place = { name: 'Volkshalle', address: { street: 'Rathausplatz 1', city: 'Wien' } }
    expect(eventJsonLd(event({ location: place, country: 'AT' }))).toMatchObject({
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Volkshalle', address: { '@type': 'PostalAddress', streetAddress: 'Rathausplatz 1', addressLocality: 'Wien', addressCountry: 'AT' } },
    })
    expect(eventJsonLd(event({ online: 'https://meet.example/odd' }))).toMatchObject({
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', location: { '@type': 'VirtualLocation', url: 'https://meet.example/odd' },
    })
    expect(eventJsonLd(event({ location: { name: 'Volkshalle' }, online: 'https://meet.example/odd' }))).toMatchObject({
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
      location: [{ '@type': 'Place', name: 'Volkshalle' }, { '@type': 'VirtualLocation', url: 'https://meet.example/odd' }],
    })
  })

  it('sessions become sub-events with their offset, room, speakers and status', () => {
    const ld = eventJsonLd(event({
      sessions: [
        { title: 'Keynote', date: '2026-12-03', from: '09:30', to: '10:15', room: 'Saal 1', speakers: ['Ada Lind'] },
        { title: 'Workshop', date: '2026-12-03', from: '11:00', to: '12:30', status: 'soldOut' },
        { title: 'Panel', date: '2026-12-04', from: '14:00', to: '15:00', status: 'cancelled' },
      ],
    }))
    expect(ld.subEvent).toEqual([
      {
        '@type': 'Event', name: 'Keynote', startDate: '2026-12-03T09:30:00+01:00', endDate: '2026-12-03T10:15:00+01:00', eventStatus: 'https://schema.org/EventScheduled',
        location: { '@type': 'Place', name: 'Saal 1' }, performer: [{ '@type': 'Person', name: 'Ada Lind' }],
      },
      {
        '@type': 'Event', name: 'Workshop', startDate: '2026-12-03T11:00:00+01:00', endDate: '2026-12-03T12:30:00+01:00', eventStatus: 'https://schema.org/EventScheduled',
        offers: { '@type': 'Offer', availability: 'https://schema.org/SoldOut' },
      },
      { '@type': 'Event', name: 'Panel', startDate: '2026-12-04T14:00:00+01:00', endDate: '2026-12-04T15:00:00+01:00', eventStatus: 'https://schema.org/EventCancelled' },
    ])
  })
})

const site = (withPeople: boolean) => defineSite({
  site: 'odd', name: 'Open Data Days', url: 'https://odd.example', timeZone: 'Europe/Vienna', locales: ['en', 'de'], currency: 'EUR', pages: { home: '/' },
  bricks: {
    events: events({ route: { en: '/events/[slug]', de: '/de/veranstaltungen/[slug]' } }),
    ...(withPeople ? { people: collection({ label: 'People', max: 100, order: 'manual', fields: { name: f.text('Name') } }), sessions: sessions({ people: 'people' }) } : { sessions: sessions() }),
  },
})
const pairs = (issues: Issue[]) => issues.map((i) => [i.path, i.code])

describe('sessions', () => {
  it.each([['with a people collection', true], ['with speakers as text', false]])('passes the schema check %s', (_, withPeople) => {
    const schema = serializeSchema(site(withPeople))
    expect(checkSchema(schema)).toEqual([])
    expect(schema.bricks.sessions!.fields.speakers).toMatchObject(withPeople ? { type: 'ref', to: 'people', multiple: true } : { type: 'text' })
  })

  const session = (from: string, to: string) => ({ event: 'ev1', date: '2026-12-03', from, to, title: { en: 'Keynote' }, status: 'open' })
  it.each([
    ['ends after it starts', '09:30', '10:15', []],
    ['ends when it starts', '09:30', '09:30', [['to', 'TIME_ORDER']]],
    ['ends before it starts', '10:15', '09:30', [['to', 'TIME_ORDER']]],
  ])('a session that %s', async (_, from, to, errors) => {
    const result = await validate(serializeSchema(site(false)), 'sessions', session(from, to), { mode: 'create' })
    expect(pairs(result.errors)).toEqual(errors)
  })

  it('a time order needs another time field of the brick', () => {
    const schema = serializeSchema(defineSite({
      ...site(false),
      bricks: { slots: collection({ label: 'Slots', max: 5, order: 'manual', fields: { day: f.date('Day'), to: f.time('To', { after: 'day' }) } }) },
    }))
    expect(checkSchema(schema)).toEqual(['slots.to.after: “day” is not another time field of the brick.'])
  })

  it('sessionsInOrder sorts by date, then start time', () => {
    const rows = [['2026-12-04', '09:00', 'C'], ['2026-12-03', '14:00', 'B'], ['2026-12-03', '09:30', 'A']].map(([date, from, title]) => ({ data: { date: date!, from: from!, title } }))
    expect(sessionsInOrder(rows).map((r) => r.data.title)).toEqual(['A', 'B', 'C'])
  })
})
