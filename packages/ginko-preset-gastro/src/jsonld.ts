// schema.org Restaurant and Event for search engines. The opening hours come from the same rule as the page (`hoursOn`),
// so Google never shows "open" on a day the site says "closed". The builders live in `@lupinum/ginko/basics`.
import { eventJsonLd as basicsEventJsonLd, openingHoursJsonLd, type EventJsonLdInput as BasicsEventInput, type HoursContext } from '@lupinum/ginko/basics'
import { offerPrice, postalAddress } from '@lupinum/ginko/internal'
import type { MarkdownTree } from '@lupinum/ginko'
import { withDefault } from './hours.ts'
import type { Money } from './prices.ts'

export interface JsonLdMenuSection { name: string; items: Array<{ name: string; description?: string; price: Money }> }
export interface RestaurantJsonLdInput {
  name: string
  url: string
  today: string
  hours: HoursContext
  /** Street, postal code and city as the owner typed them. The postal code is left out of the output when not given. */
  address?: { street: string; postalCode?: string; city: string; /** ISO country code such as AT or SG. Left out of the output when not given. */ country?: string }
  telephone?: string
  email?: string
  servesCuisine?: string[]
  /** Dishes with the price that applies today. Without sections but with `url`, only the menu link is given. */
  menu?: { url?: string; sections?: JsonLdMenuSection[] }
  /** The site's currency (ISO 4217), used for a price that carries none. There is no default. */
  currency?: string
  /** How many days from `today` get special entries (default 60). */
  days?: number
}

export interface EventJsonLdInput {
  title: string
  /** Absolute URL of the event page. */
  url: string
  /** The days of the event. `f.daterange` stores dates only (YYYY-MM-DD). */
  when: { from: string; to: string }
  /** Start time of the first day (`HH:MM`, local time). Written into `startDate` when given. */
  start?: string
  /**
   * The site's IANA time zone: `startDate` then carries its offset (`2026-12-03T19:00:00+01:00`). Without it the start
   * is written without an offset (local time), as in 0.4.
   */
  timeZone?: string
  /** The restaurant as the place of the event; `address` is left out of the output when not given. */
  location: { name: string; address?: RestaurantJsonLdInput['address'] }
  description?: MarkdownTree
  /** Absolute URL of the image. */
  image?: string
  price?: Money
  /** The site’s currency (ISO 4217), used for a price that carries none. There is no default. */
  currency?: string
  /** Absolute URL where visitors book. Left out when the event is fully booked. */
  booking?: string
  /** Fully booked (the events brick's `soldOut`): the offer says `SoldOut` and has no booking link. */
  soldOut?: boolean
}

export function restaurantJsonLd(input: RestaurantJsonLdInput): Record<string, unknown> {
  const currency = input.currency
  const sections = input.menu?.sections?.filter((s) => s.items.length)
  const menu = sections?.length
    ? {
        '@type': 'Menu',
        ...(input.menu?.url ? { url: input.menu.url } : {}),
        hasMenuSection: sections.map((s) => ({
          '@type': 'MenuSection',
          name: s.name,
          hasMenuItem: s.items.map((i) => ({
            '@type': 'MenuItem',
            name: i.name,
            ...(i.description ? { description: i.description } : {}),
            offers: { '@type': 'Offer', ...offerPrice(i.price, currency) },
          })),
        })),
      }
    : input.menu?.url
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: input.name,
    url: input.url,
    ...(input.address ? { address: postalAddress(input.address) } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.servesCuisine?.length ? { servesCuisine: input.servesCuisine } : {}),
    ...(menu ? { hasMenu: menu } : {}),
    ...openingHoursJsonLd(withDefault(input.hours), input.today, input.days ?? 60),
  }
}

/** schema.org Event for one event of the events brick. Offers are given with a price, or to say it is fully booked. */
export function eventJsonLd(input: EventJsonLdInput): Record<string, unknown> {
  const { timeZone, ...rest } = input
  const ld = basicsEventJsonLd({ ...rest, timeZone: timeZone ?? 'UTC' } satisfies BasicsEventInput)
  // 0.4 output without a time zone: the start as local time, the end as a date.
  return timeZone ? ld : { ...ld, startDate: input.start ? `${input.when.from}T${input.start}` : input.when.from }
}
