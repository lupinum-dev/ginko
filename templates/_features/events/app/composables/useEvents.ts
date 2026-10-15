import { formatMoney, safeHref, type ImageValue, type MarkdownTree, type Money } from '@lupinum/ginko'
import { eventJsonLd, type SessionJsonLdInput } from '@lupinum/ginko/basics'

/** What the events feature reads of an entry of the `events` brick (`events()` of `@lupinum/ginko/basics`). */
export interface EventFacts {
  title: string
  when: { from: string, to: string }
  start?: string | null
  end?: string | null
  location?: string | null
  online?: string | null
  price?: Money | null
  booking?: string | null
  /** The last day the booking link shows (ticket sales that close before the event). */
  bookingUntil?: string | null
  soldOut?: boolean | null
  image?: ImageValue | null
}

/** A price in the page's language, without minor units when the amount is whole ("€38", "€12.50"). */
export function wholeMoney(money: Money, language: string): string {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const value = money.amount / 10 ** digits
  if (!Number.isInteger(value)) return formatMoney(money, language)
  return new Intl.NumberFormat(language, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(value).replace(/\s/g, ' ')
}

/**
 * The booking link while booking is open: none when the event is fully booked or `bookingUntil` (a date in the site's
 * time zone, the last day it shows) has passed. `today`: YYYY-MM-DD in the site's time zone.
 */
export function bookingHref(event: Pick<EventFacts, 'booking' | 'bookingUntil' | 'soldOut'>, today: string): string | undefined {
  if (event.soldOut || (event.bookingUntil && today > event.bookingUntil)) return undefined
  return safeHref(event.booking ?? undefined)
}

/** bookingHref at today's date in the site's time zone (the server's day, carried to the browser). */
export function useEventBooking() {
  const today = useGinkoToday()
  return (event: Pick<EventFacts, 'booking' | 'bookingUntil' | 'soldOut'>) => bookingHref(event, today.value)
}

/** Booking has closed before the event (`bookingUntil` passed): say so instead of offering another way to book. */
export function useBookingClosed() {
  const today = useGinkoToday()
  return (event: Pick<EventFacts, 'booking' | 'bookingUntil' | 'soldOut'>) =>
    Boolean(!event.soldOut && safeHref(event.booking ?? undefined) && event.bookingUntil && today.value > event.bookingUntil)
}

/**
 * Texts of an event in the page's language: the date with its weekday (a range for several days) and the clock times
 * as the owner entered them, in the site's time zone; the price; "fully booked".
 */
export function useEventText() {
  const { t, format, language } = useI18n('events')
  const weekday = (date: string) => format.date(date, { weekday: 'short' })
  const long = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as const
  const short = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const
  const dates = (event: EventFacts, style: 'long' | 'short' = 'long') => {
    const options = style === 'long' ? long : short
    return event.when.from === event.when.to ? format.date(event.when.from, options) : format.range(event.when.from, event.when.to, options)
  }
  // `start` is the clock time of the first day and `end` of the last: over several days "Thu 09:00 – Fri 16:00", so
  // the range never reads as the hours of each day.
  const times = (event: EventFacts) => {
    if (!event.start || !event.end) return event.start ?? undefined
    if (event.when.from === event.when.to) return `${event.start}–${event.end}`
    return `${weekday(event.when.from)} ${event.start} – ${weekday(event.when.to)} ${event.end}`
  }
  /** "Fri, 29 Jan 2027 · 19:00" */
  const when = (event: EventFacts, style: 'long' | 'short' = 'long') => [dates(event, style), times(event)].filter(Boolean).join(' · ')
  /** "€38 per person": a whole amount without minor units, which read like a till receipt ("€38.00"). */
  const price = (event: EventFacts) => (event.price ? t('perPerson', { price: wholeMoney(event.price, language.value) }) : undefined)
  /** Price and "fully booked", for a list. */
  const status = (event: EventFacts) => [price(event), event.soldOut ? t('soldOut') : undefined].filter(Boolean).join(' · ') || undefined
  return { dates, times, when, price, status }
}

/** The events still to come (the brick hides an event after its last day), the next first. */
export function useUpcomingEvents(limit?: () => number | undefined) {
  const events = useGinko('events')
  const { when, status } = useEventText()
  return computed(() => events.value.items.slice(0, limit?.()).map((item) => ({
    key: item.id,
    title: item.data.title,
    to: item.url ?? '',
    // Date, time, price and "fully booked" in one line of tabular numbers above the title.
    meta: [when(item.data, 'short'), status(item.data)].filter(Boolean).join(' · '),
    image: item.data.image ?? undefined,
  })))
}

/**
 * A builder of schema.org Event: dates with the site's time zone offset, the place (the event's own, else the business
 * from content/site.md), price, booking link or "sold out"; `description` is the page's Markdown tree, `sessions` the
 * programme (each a `subEvent`). For pages that describe several events; one event page uses useEventJsonLd.
 */
export function useEventLd() {
  const site = useGinko('site')
  const { name, url, timeZone } = useGinkoSite()
  const country: string = useRuntimeConfig().public.ginko.country
  const booking = useEventBooking()
  const absolute = (path: string) => new URL(path, url).href
  return (e: EventFacts & { url: string }, extra: { description?: MarkdownTree | null, sessions?: SessionJsonLdInput[] } = {}) => {
    const own = site.value.data
    const location = e.location
      ? { name: e.location }
      : e.online ? undefined : { name, address: { street: own.street ?? '', postalCode: own.postalCode, city: own.city ?? '' } }
    return eventJsonLd({
      title: e.title,
      url: absolute(e.url),
      when: e.when,
      start: e.start ?? undefined,
      end: e.end ?? undefined,
      timeZone,
      location,
      online: safeHref(e.online ?? undefined),
      country: country || undefined,
      description: extra.description ?? undefined,
      image: e.image ? absolute(e.image.url) : undefined,
      price: e.price ?? undefined,
      booking: booking(e),
      soldOut: e.soldOut === true,
      sessions: extra.sessions,
    })
  }
}

/**
 * schema.org Event for an event page (useEventLd), with the page's Markdown tree as `description` and, when a feature
 * gives them, its sessions as `subEvent`.
 */
export function useEventJsonLd(event: () => EventFacts & { url: string }, description: () => MarkdownTree | null | undefined, sessions?: () => SessionJsonLdInput[] | undefined) {
  const build = useEventLd()
  return computed(() => build(event(), { description: description(), sessions: sessions?.() }))
}
