// Events (a date range with start and end time in the site's time zone, a place or an online address) and their
// sessions (a programme: one row per talk or slot), with schema.org Event JSON-LD.
import { f } from '../core/fields.ts'
import { plainText, type MarkdownTree } from '../core/markdown.ts'
import { collection, type RouteTemplate } from '../core/site.ts'
import { zonedDateTime } from '../core/time.ts'
import type { Field, Fields, Label, Locale, Task } from '../core/types.ts'
import { both, sourceOf, type BasicsOptions } from './hours-bricks.ts'
import { offerPrice, postalAddress, type Money, type PostalAddressInput } from './offer.ts'

/** Options of `events()`: the detail page per locale is required. */
export interface EventsOptions extends BasicsOptions { route: Record<Locale, RouteTemplate> }

/**
 * @internal The events collection with a preset's booking label and the fields it adds after `start`; sites use
 * `events()`. The gastro preset adds none, so its stored schema stays as it was.
 */
export function eventsBrick<const E extends Fields>(opts: EventsOptions, booking: Label, extra: E) {
  const fields = {
    title: f.text(both('Titel', 'Title'), { max: 120 }),
    slug: f.slug(both('Adresse', 'Web address'), { from: 'title' }),
    when: f.daterange(both('Wann', 'When')),
    // The clock time of the first day. `when` stays the order and visibility field.
    start: f.time(both('Beginn', 'Starts at'), { optional: true }),
    ...extra,
    description: f.markdown(both('Beschreibung', 'Description'), { profile: 'basic', max: 5000 }),
    price: f.money(both('Preis', 'Price'), { optional: true }),
    booking: f.text(booking, { format: 'url', optional: true }),
    image: f.image(both('Bild', 'Image'), { optional: true }),
    // The site shows "fully booked" instead of the booking link. Optional: a missing value means bookable.
    soldOut: f.boolean(both('Ausgebucht', 'Fully booked'), { optional: true }),
  }
  // `extra` keeps the fields generic, so the type cannot check the tasks against them; they name only the fixed fields.
  const tasks = [
    { id: 'add', label: both('Veranstaltung hinzufügen', 'Add an event'), kind: 'create' },
    { id: 'soldOut', label: both('Veranstaltung ausgebucht', 'Event fully booked'), kind: 'edit', pick: true, fields: ['soldOut'] },
    { id: 'remove', label: both('Veranstaltung entfernen', 'Remove an event'), kind: 'remove' },
  ] as const satisfies readonly Task<{ soldOut: Field }>[]
  return collection({
    label: both('Veranstaltungen', 'Events'),
    ...sourceOf(opts),
    fields,
    max: 30,
    order: { field: 'when', dir: 'asc' },
    // `extra` keeps the fields generic, so the type cannot see that `when` is still the daterange.
    visible: { mode: 'until', field: 'when' as never },
    route: opts.route,
    tasks: tasks as unknown as readonly Task<typeof fields>[],
  })
}

/**
 * Events with a detail page: dates, start and end time (site time zone), a place and/or an online address, price,
 * booking link and "fully booked". An event leaves the site after its last day.
 */
export function events(opts: EventsOptions) {
  return eventsBrick(opts, both('Buchungs-Link', 'Booking link'), {
    // The clock time of the last day.
    end: f.time(both('Ende', 'Ends at'), { optional: true }),
    location: f.text(both('Ort', 'Location'), { max: 200, optional: true }),
    online: f.text(both('Online-Link', 'Online link'), { format: 'url', optional: true }),
  })
}

/** A session's state: it takes place, it is fully booked, or it is cancelled. */
export type SessionStatus = 'open' | 'soldOut' | 'cancelled'

function sessionsBrick<S extends Field>(opts: BasicsOptions & { events?: string }, speakers: S) {
  return collection({
    label: both('Programmpunkte', 'Sessions'),
    ...sourceOf(opts),
    fields: {
      event: f.ref(both('Veranstaltung', 'Event'), { to: opts.events ?? 'events' }),
      date: f.date(both('Datum', 'Date')),
      from: f.time(both('Beginn', 'Starts at')),
      to: f.time(both('Ende', 'Ends at'), { after: 'from' }),
      title: f.text(both('Titel', 'Title'), { max: 120 }),
      room: f.text(both('Raum', 'Room'), { max: 80, optional: true }),
      speakers,
      status: f.choice(both('Status', 'Status'), {
        options: [
          { value: 'open', label: both('Findet statt', 'Open') }, { value: 'soldOut', label: both('Ausgebucht', 'Sold out') },
          { value: 'cancelled', label: both('Abgesagt', 'Cancelled') },
        ],
        default: 'open',
      }),
    },
    max: 300,
    // Sessions of one day share a date; sort with `sessionsInOrder` for the start time.
    order: { field: 'date', dir: 'asc' },
    visible: { mode: 'until', field: 'date' },
    tasks: [
      // The job during the event: a session moves, changes its room, fills up or is cancelled.
      { id: 'change', label: both('Programmpunkt ändern', 'Change a session'), kind: 'edit', pick: true, fields: ['from', 'to', 'room', 'status'] },
      { id: 'soldOut', label: both('Ausgebucht', 'Sold out'), kind: 'edit', pick: true, fields: ['status'], prefill: { status: 'soldOut' } },
    ],
  })
}

/**
 * The programme of events: one entry per session, with its event (`events`: the key of the events brick, default
 * `events`), date, start and end time (site time zone; the end after the start), room, speakers and status. Speakers
 * are entries of the people collection named by `people`, or a text without it. A session leaves the site after its day.
 */
export function sessions(opts: BasicsOptions & { events?: string; people: string }): ReturnType<typeof sessionsBrick<ReturnType<typeof speakerRefs>>>
export function sessions(opts?: BasicsOptions & { events?: string; people?: undefined }): ReturnType<typeof sessionsBrick<ReturnType<typeof speakerText>>>
export function sessions(opts: BasicsOptions & { events?: string; people?: string } = {}) {
  return opts.people ? sessionsBrick(opts, speakerRefs(opts.people)) : sessionsBrick(opts, speakerText())
}

const speakerRefs = (people: string) => f.refs(both('Vortragende', 'Speakers'), { to: people, max: 10, optional: true })
const speakerText = () => f.text(both('Vortragende', 'Speakers'), { max: 200, optional: true })

/** Sessions by date, then start time, then title: the order of a programme. */
export function sessionsInOrder<S extends { data: { date: string; from: string; title?: unknown } }>(items: readonly S[]): S[] {
  return [...items].sort((a, b) => a.data.date.localeCompare(b.data.date) || a.data.from.localeCompare(b.data.from)
    || String(a.data.title ?? '').localeCompare(String(b.data.title ?? '')))
}

/** One session for `eventJsonLd`. */
export interface SessionJsonLdInput {
  title: string
  date: string
  from: string
  to: string
  room?: string
  /** Names of the speakers. */
  speakers?: string[]
  status?: SessionStatus
}

export interface EventJsonLdInput {
  title: string
  /** Absolute URL of the event page. */
  url: string
  /** The days of the event (YYYY-MM-DD). */
  when: { from: string; to: string }
  /** Start time of the first day (`HH:MM`, site time zone). */
  start?: string
  /** End time of the last day (`HH:MM`, site time zone). */
  end?: string
  /** The site's IANA time zone: times are written with its offset on that day (`+01:00` in winter in Vienna). */
  timeZone: string
  /** Where it takes place. With `online` too, the event is mixed. */
  location?: { name: string; address?: PostalAddressInput }
  /** Address where people join online. */
  online?: string
  /** The site's country, the address's country when it has none. */
  country?: string
  description?: MarkdownTree
  /** Absolute URL of the image. */
  image?: string
  price?: Money
  /** The site’s currency (ISO 4217), used for a price that carries none. There is no default. */
  currency?: string
  /** Absolute URL where visitors book. Left out when the event is fully booked. */
  booking?: string
  /** Fully booked: the offer says `SoldOut` and has no booking link. */
  soldOut?: boolean
  /** The programme: each session becomes a `subEvent`. */
  sessions?: SessionJsonLdInput[]
}

const SCHEDULED = 'https://schema.org/EventScheduled'
const SOLD_OUT = 'https://schema.org/SoldOut'

function attendanceOf(input: Pick<EventJsonLdInput, 'location' | 'online'>): string {
  const mode = input.online ? (input.location ? 'Mixed' : 'Online') : 'Offline'
  return `https://schema.org/${mode}EventAttendanceMode`
}

function locationOf(input: EventJsonLdInput) {
  const place = input.location
    ? { '@type': 'Place', name: input.location.name, ...(input.location.address ? { address: postalAddress(input.location.address, input.country) } : {}) }
    : undefined
  const virtual = input.online ? { '@type': 'VirtualLocation', url: input.online } : undefined
  return place && virtual ? [place, virtual] : place ?? virtual
}

function subEvent(s: SessionJsonLdInput, input: EventJsonLdInput) {
  return {
    '@type': 'Event',
    name: s.title,
    startDate: zonedDateTime(s.date, s.from, input.timeZone),
    endDate: zonedDateTime(s.date, s.to, input.timeZone),
    eventStatus: s.status === 'cancelled' ? 'https://schema.org/EventCancelled' : SCHEDULED,
    ...(s.room ? { location: { '@type': 'Place', name: s.room } } : {}),
    ...(s.speakers?.length ? { performer: s.speakers.map((name) => ({ '@type': 'Person', name })) } : {}),
    ...(s.status === 'soldOut' ? { offers: { '@type': 'Offer', availability: SOLD_OUT } } : {}),
  }
}

/** schema.org Event for one event. Offers are given with a price, or to say it is fully booked. */
export function eventJsonLd(input: EventJsonLdInput): Record<string, unknown> {
  const description = input.description ? plainText(input.description) : ''
  const offers = input.soldOut
    ? { '@type': 'Offer', ...(input.price ? offerPrice(input.price, input.currency) : {}), availability: SOLD_OUT }
    : input.price ? { '@type': 'Offer', ...offerPrice(input.price, input.currency), ...(input.booking ? { url: input.booking } : {}) } : undefined
  const location = locationOf(input)
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.title,
    startDate: input.start ? zonedDateTime(input.when.from, input.start, input.timeZone) : input.when.from,
    endDate: input.end ? zonedDateTime(input.when.to, input.end, input.timeZone) : input.when.to,
    eventStatus: SCHEDULED,
    eventAttendanceMode: attendanceOf(input),
    ...(location ? { location } : {}),
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(description ? { description } : {}),
    ...(offers ? { offers } : {}),
    ...(input.sessions?.length ? { subEvent: input.sessions.map((s) => subEvent(s, input)) } : {}),
  }
}
