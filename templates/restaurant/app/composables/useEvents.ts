// Synced from templates/_features/events/app/composables/useEvents.ts by `pnpm templates sync`. Edit the source, not this copy.
import { formatMoney, safeHref, type ImageValue, type MarkdownTree, type Money } from '@lupinum/ginko'
import { eventJsonLd } from '@lupinum/ginko/basics'

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
  soldOut?: boolean | null
  image?: ImageValue | null
}

/**
 * Texts of an event in the page's language: the date with its weekday (a range for several days) and the clock times
 * as the owner entered them, in the site's time zone; the price; "fully booked".
 */
export function useEventText() {
  const { t, format, language } = useI18n('events')
  const long = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } as const
  const short = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const
  const dates = (event: EventFacts, style: 'long' | 'short' = 'long') => {
    const options = style === 'long' ? long : short
    return event.when.from === event.when.to ? format.date(event.when.from, options) : format.range(event.when.from, event.when.to, options)
  }
  const times = (event: EventFacts) => {
    if (event.start && event.end) return `${event.start}–${event.end}`
    return event.start ?? undefined
  }
  /** "Fri, 29 Jan 2027 · 19:00" */
  const when = (event: EventFacts, style: 'long' | 'short' = 'long') => [dates(event, style), times(event)].filter(Boolean).join(' · ')
  const price = (event: EventFacts) => (event.price ? formatMoney(event.price, language.value) : undefined)
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
    meta: when(item.data, 'short'),
    text: status(item.data),
    image: item.data.image ?? undefined,
  })))
}

/**
 * schema.org Event for an event page: dates with the site's time zone offset, the place (the event's own, else the
 * house from content/site.md), price, booking link or "sold out". `description` is the page's Markdown tree.
 */
export function useEventJsonLd(event: () => EventFacts & { url: string }, description: () => MarkdownTree | null | undefined) {
  const site = useGinko('site')
  const { name, url, timeZone } = useGinkoSite()
  const country: string = useRuntimeConfig().public.ginko.country
  const absolute = (path: string) => new URL(path, url).href
  return computed(() => {
    const e = event()
    const house = site.value.data
    const location = e.location
      ? { name: e.location }
      : e.online ? undefined : { name, address: { street: house.street ?? '', postalCode: house.postalCode, city: house.city ?? '' } }
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
      description: description() ?? undefined,
      image: e.image ? absolute(e.image.url) : undefined,
      price: e.price ?? undefined,
      booking: safeHref(e.booking ?? undefined),
      soldOut: e.soldOut === true,
    })
  })
}
