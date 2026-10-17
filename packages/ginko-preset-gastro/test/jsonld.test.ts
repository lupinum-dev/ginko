// Search engines show the hours from this JSON. Wrong output makes Google say "open" on a closure day or lists a day twice.
import { describe, expect, it } from 'vitest'
import { eventJsonLd, restaurantJsonLd, type EventJsonLdInput } from '../src/jsonld.ts'
import type { DayHours, Exception } from '../src/hours.ts'

const full = (day: string, t: object = {}): DayHours => ({ day, closed: false, from1: '11:30', to1: '14:00', from2: '17:30', to2: '22:00', ...t })
const week: DayHours[] = [
  { day: 'mo', closed: true }, full('tu'), full('we'), full('th'), full('fr'), full('sa'),
  { day: 'su', closed: false, from1: '11:30', to1: '15:00' },
]
const exceptions: Exception[] = [
  { _id: 'e1', when: { from: '2026-11-04', to: '2026-11-05' }, reason: 'Betriebsausflug', closed: true },
  { _id: 'e2', when: { from: '2026-11-06', to: '2026-11-06' }, reason: 'Feier', closed: false, from1: '11:00', to1: '14:00' },
]

const base = { name: 'Gasthaus zur Linde', url: 'https://linde.example/', today: '2026-10-20', days: 30, currency: 'EUR' }
const weekly = [
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '11:30', closes: '14:00' },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '17:30', closes: '22:00' },
  { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday'], opens: '11:30', closes: '15:00' },
]

describe('restaurantJsonLd', () => {
  it('lists the weekly rule and only the days that differ: a closure range, special times, a holiday set to closed', () => {
    expect(restaurantJsonLd({
      ...base,
      hours: { hours: { week, exceptions, holidays: 'closed' } },
      address: { street: 'Dorfstraße 12', postalCode: '5020', city: 'Salzburg', country: 'AT' },
      telephone: '+43 662 000 000',
    })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Gasthaus zur Linde',
      url: 'https://linde.example/',
      address: { '@type': 'PostalAddress', streetAddress: 'Dorfstraße 12', postalCode: '5020', addressLocality: 'Salzburg', addressCountry: 'AT' },
      telephone: '+43 662 000 000',
      openingHoursSpecification: weekly,
      specialOpeningHoursSpecification: [
        // Allerheiligen (Sunday, 1 Nov): the holiday setting is "closed"
        { '@type': 'OpeningHoursSpecification', validFrom: '2026-11-01', validThrough: '2026-11-01', opens: '00:00', closes: '00:00' },
        { '@type': 'OpeningHoursSpecification', validFrom: '2026-11-04', validThrough: '2026-11-05', opens: '00:00', closes: '00:00' },
        { '@type': 'OpeningHoursSpecification', validFrom: '2026-11-06', validThrough: '2026-11-06', opens: '11:00', closes: '14:00' },
      ],
    })
  })

  it.each([
    ['SG', { street: '1 Raffles Place', postalCode: '018956', city: 'Singapore', country: 'SG' }, { '@type': 'PostalAddress', streetAddress: '1 Raffles Place', postalCode: '018956', addressLocality: 'Singapore', addressCountry: 'SG' }],
  ])('writes the postal code from its own field for %s', (_country, address, expected) => {
    expect(restaurantJsonLd({ ...base, hours: { hours: { week, exceptions: [], holidays: 'normal' } }, address })).toMatchObject({ address: expected })
  })

  it('has no special entries when nothing differs, and no cuisine, menu, address or phone when there is no data', () => {
    expect(restaurantJsonLd({ ...base, hours: { hours: { week, exceptions: [], holidays: 'normal' } } })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Gasthaus zur Linde',
      url: 'https://linde.example/',
      openingHoursSpecification: weekly,
    })
  })

  it('takes the week of a running season and adds cuisine and menu with the price given', () => {
    const winter = { from: '2026-10-01', week: week.map((d) => (d.day === 'tu' ? { day: 'tu', closed: true } : d)) }
    expect(restaurantJsonLd({
      ...base,
      hours: { hours: { week, exceptions: [], holidays: 'normal' }, plans: [winter] },
      servesCuisine: ['Austrian'],
      menu: { url: 'https://linde.example/speisekarte', sections: [{ name: 'Suppen', items: [{ name: 'Frittatensuppe', description: 'Hausgemacht', price: { amount: 690 } }] }] },
    })).toMatchObject({
      servesCuisine: ['Austrian'],
      hasMenu: {
        '@type': 'Menu',
        url: 'https://linde.example/speisekarte',
        hasMenuSection: [{ '@type': 'MenuSection', name: 'Suppen', hasMenuItem: [{ '@type': 'MenuItem', name: 'Frittatensuppe', description: 'Hausgemacht', offers: { '@type': 'Offer', price: '6.90', priceCurrency: 'EUR' } }] }],
      },
      openingHoursSpecification: [
        { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '11:30', closes: '14:00' },
        { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '17:30', closes: '22:00' },
        weekly[2],
      ],
    })
  })
})

describe('eventJsonLd', () => {
  const place = { '@type': 'Place', name: 'Gasthaus zur Linde', address: { '@type': 'PostalAddress', streetAddress: 'Dorfstraße 12', postalCode: '5020', addressLocality: 'Salzburg', addressCountry: 'AT' } }
  it.each<[string, EventJsonLdInput, Record<string, unknown>]>([
    ['a full event: plain text description, price and booking', {
      title: 'Weinabend', url: 'https://linde.example/veranstaltungen/weinabend', when: { from: '2026-11-06', to: '2026-11-07' },
      location: { name: 'Gasthaus zur Linde', address: { street: 'Dorfstraße 12', postalCode: '5020', city: 'Salzburg', country: 'AT' } },
      description: { nodes: [['p', {}, 'Ein Abend mit ', ['strong', {}, 'Wein'], '.']] },
      image: 'https://linde.example/img/weinabend.jpg', price: { amount: 2500 }, currency: 'EUR', booking: 'https://linde.example/reservierung',
    }, {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Weinabend',
      startDate: '2026-11-06',
      endDate: '2026-11-07',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: place,
      url: 'https://linde.example/veranstaltungen/weinabend',
      image: 'https://linde.example/img/weinabend.jpg',
      description: 'Ein Abend mit Wein.',
      offers: { '@type': 'Offer', price: '25.00', priceCurrency: 'EUR', url: 'https://linde.example/reservierung' },
    }],
    // Wrong behaviour caught: every price was divided by 100, so a JPY price came out 100 times too small.
    ['a price in a currency without minor units (JPY)', {
      title: 'Sake', url: 'https://linde.example/veranstaltungen/sake', when: { from: '2026-11-06', to: '2026-11-06' },
      location: { name: 'Gasthaus zur Linde' }, price: { amount: 3500, currency: 'JPY' },
    }, {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Sake',
      startDate: '2026-11-06',
      endDate: '2026-11-06',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Gasthaus zur Linde' },
      url: 'https://linde.example/veranstaltungen/sake',
      offers: { '@type': 'Offer', price: '3500', priceCurrency: 'JPY' },
    }],
    // Wrong behaviour caught: a fully booked event still offered its booking link to search engines.
    ['fully booked: the offer says SoldOut and drops the booking link', {
      title: 'Weinabend', url: 'https://linde.example/veranstaltungen/weinabend', when: { from: '2026-11-06', to: '2026-11-06' },
      location: { name: 'Gasthaus zur Linde' }, price: { amount: 2500 }, currency: 'EUR', booking: 'https://linde.example/reservierung', soldOut: true,
    }, {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Weinabend',
      startDate: '2026-11-06',
      endDate: '2026-11-06',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Gasthaus zur Linde' },
      url: 'https://linde.example/veranstaltungen/weinabend',
      offers: { '@type': 'Offer', price: '25.00', priceCurrency: 'EUR', availability: 'https://schema.org/SoldOut' },
    }],
    ['fully booked without a price: an offer with only the availability', {
      title: 'Frühschoppen', url: 'https://linde.example/veranstaltungen/fruehschoppen', when: { from: '2026-11-08', to: '2026-11-08' },
      location: { name: 'Gasthaus zur Linde' }, soldOut: true,
    }, {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Frühschoppen',
      startDate: '2026-11-08',
      endDate: '2026-11-08',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Gasthaus zur Linde' },
      url: 'https://linde.example/veranstaltungen/fruehschoppen',
      offers: { '@type': 'Offer', availability: 'https://schema.org/SoldOut' },
    }],
    ['a start time: added to startDate without an offset', {
      title: 'Weinabend', url: 'https://linde.example/veranstaltungen/weinabend', when: { from: '2026-11-06', to: '2026-11-06' }, start: '19:00',
      location: { name: 'Gasthaus zur Linde' },
    }, {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Weinabend',
      startDate: '2026-11-06T19:00',
      endDate: '2026-11-06',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Gasthaus zur Linde' },
      url: 'https://linde.example/veranstaltungen/weinabend',
    }],
    ['a minimal event: no image, description, offers or address', {
      title: 'Frühschoppen', url: 'https://linde.example/veranstaltungen/fruehschoppen', when: { from: '2026-11-08', to: '2026-11-08' },
      location: { name: 'Gasthaus zur Linde' },
    }, {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Frühschoppen',
      startDate: '2026-11-08',
      endDate: '2026-11-08',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Gasthaus zur Linde' },
      url: 'https://linde.example/veranstaltungen/fruehschoppen',
    }],
  ])('writes the event for %s', (_name, input, expected) => {
    expect(eventJsonLd(input)).toEqual(expected)
  })
})
