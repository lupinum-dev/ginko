// Synced from templates/_features/events/app/composables/useEvents.ts by `pnpm templates sync`. Edit the source, not this copy.
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

/** `events` in app/app.config.ts. */
export interface EventsAppConfig {
  /** True when the events happen at the business itself (a restaurant's evenings): an event without a location and
   *  without an online link then takes place at the site's name and address (content/site.md). Default false: such
   *  an event shows no place, since content/site.md is the organiser's address, not necessarily the venue. */
  atTheBusiness?: boolean
}

declare module 'nuxt/schema' {
  interface CustomAppConfig {
    events?: EventsAppConfig
  }
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
  const { t, format, language, locale, locales } = useI18n('events')
  // On a right-to-left page a clock range and a phone number keep their left-to-right order ("10:00–13:00", as the
  // next date of the nonprofit shows it): an isolate, since the text also goes into cards, titles and buttons where
  // no <bdi> fits.
  const rtl = computed(() => locales.find((l) => l.code === locale.value)?.dir === 'rtl')
  const ltr = (text: string) => (rtl.value ? `\u2066${text}\u2069` : text)
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
    if (event.when.from === event.when.to) return ltr(`${event.start}–${event.end}`)
    return `${weekday(event.when.from)} ${ltr(event.start)} – ${weekday(event.when.to)} ${ltr(event.end)}`
  }
  /**
   * One line for a card: "Fri, 29 Jan 2027 · 19:00". Over several days the dates only: the model has no daily hours,
   * and first-day and last-day times next to a weekday range read as a repeat; the event page has the Time row.
   */
  const when = (event: EventFacts, style: 'long' | 'short' = 'long') =>
    [dates(event, style), event.when.from === event.when.to ? times(event) : undefined].filter(Boolean).join(' · ')
  /** "€38 per person": a whole amount without minor units, which read like a till receipt ("€38.00"). A price of 0 is "Free". */
  const price = (event: EventFacts) => {
    if (!event.price) return undefined
    if (event.price.amount === 0) return t('free')
    // Non-breaking spaces: the price never wraps inside ("€40 per / person").
    return t('perPerson', { price: wholeMoney(event.price, language.value) }).replace(/\s/g, '\u00a0')
  }
  /** Price and "fully booked", for a list. */
  const status = (event: EventFacts) => [price(event), event.soldOut ? t('soldOut') : undefined].filter(Boolean).join(' · ') || undefined
  return { dates, times, when, price, status, ltr }
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
    // Where it takes place, so the list says as much as the home page's card.
    text: item.data.location ?? undefined,
    image: item.data.image ?? undefined,
  })))
}

/**
 * The business as the venue of an event without a location and without an online link, only when `events.atTheBusiness`
 * is true in app/app.config.ts; otherwise (the default) such an event has no place, since content/site.md is the
 * organiser's address, not necessarily the venue.
 */
export function useEventVenue() {
  const site = useGinko('site')
  const { name } = useGinkoSite()
  // Only the sites that set `events` in app.config.ts have the key, so its type differs per template: narrow at run time.
  const config: unknown = useAppConfig().events
  const atTheBusiness = typeof config === 'object' && config !== null && 'atTheBusiness' in config && config.atTheBusiness === true
  return (e: EventFacts) => {
    if (!atTheBusiness || e.location || safeHref(e.online ?? undefined)) return undefined
    const own = site.value.data
    return { name, address: { street: own.street ?? '', postalCode: own.postalCode, city: own.city ?? '' } }
  }
}

/**
 * A builder of schema.org Event: dates with the site's time zone offset, the place (the event's own; else the business
 * when `events.atTheBusiness` is true and there is no online link; else none), price, booking link or
 * "sold out"; `description` is the page's Markdown tree, `sessions` the programme (each a `subEvent`). For pages that describe several events; one event page uses useEventJsonLd.
 */
export function useEventLd() {
  const { url, timeZone } = useGinkoSite()
  const country: string = useRuntimeConfig().public.ginko.country
  const booking = useEventBooking()
  const venue = useEventVenue()
  const absolute = (path: string) => new URL(path, url).href
  return (e: EventFacts & { url: string }, extra: { description?: MarkdownTree | null, sessions?: SessionJsonLdInput[] } = {}) => {
    const location = e.location ? { name: e.location } : venue(e)
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
