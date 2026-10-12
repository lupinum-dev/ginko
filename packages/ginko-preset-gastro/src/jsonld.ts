// schema.org Restaurant for search engines. The opening hours come from the same rule as the page (`hoursOn`),
// so Google never shows "open" on a day the site says "closed".
import { addDays, hoursOn, spansOf, weekdayKeys, weekdayOf, weekFor, type HoursContext, type Span, type Weekday } from './hours.ts'
import { plainText, type MarkdownTree } from '@lupinum/ginko'
import type { Money } from './prices.ts'

const dayNames: Record<Weekday, string> = { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' }

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

function requireCurrency(currency: string | undefined): string {
  if (!currency) throw new Error('JSON-LD: pass `currency` (the site’s currency) for prices that carry none.')
  return currency
}

const spanKey =(spans: Span[]) => spans.map((s) => `${s.from}-${s.to}`).join(',')
const price = (m: Money) => (m.amount / 100).toFixed(2)

export interface EventJsonLdInput {
  title: string
  /** Absolute URL of the event page. */
  url: string
  /** The days of the event. `f.daterange` stores dates only (YYYY-MM-DD); a `start` time is added to `startDate` without an offset (local time). */
  when: { from: string; to: string }
  /** Start time of the first day (`HH:MM`, local time). Written into `startDate` when given. */
  start?: string
  /** The restaurant as the place of the event; `address` is left out of the output when not given. */
  location: { name: string; address?: RestaurantJsonLdInput['address'] }
  description?: MarkdownTree
  /** Absolute URL of the image. */
  image?: string
  price?: Money
  /** The site’s currency (ISO 4217), used for a price that carries none. There is no default. */
  currency?: string
  /** Absolute URL where visitors book. */
  booking?: string
}

function addressOf(a: NonNullable<RestaurantJsonLdInput['address']>) {
  return { '@type': 'PostalAddress', streetAddress: a.street, ...(a.postalCode ? { postalCode: a.postalCode } : {}), addressLocality: a.city, ...(a.country ? { addressCountry: a.country } : {}) }
}

/** The weekly rule: days with the same times share one entry (one entry per time window). */
function weeklySpecs(week: ReturnType<typeof weekFor>['week']) {
  const groups = new Map<string, { spans: Span[]; days: Weekday[] }>()
  for (const key of weekdayKeys) {
    const day = week.find((d) => d.day === key)
    const spans = !day || day.closed ? [] : spansOf(day)
    if (!spans.length) continue
    const k = spanKey(spans)
    const group = groups.get(k) ?? { spans, days: [] }
    group.days.push(key)
    groups.set(k, group)
  }
  return [...groups.values()].flatMap((g) => g.spans.map((s) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: g.days.map((d) => dayNames[d]), opens: s.from, closes: s.to })))
}

/**
 * Days within `days` days that differ from the weekday rule of the week that applies today: a closure
 * (opens and closes "00:00", the way Google reads "closed all day") or other times. Consecutive days
 * with the same result become one entry with `validFrom` and `validThrough`.
 */
function specialSpecs(input: RestaurantJsonLdInput, week: ReturnType<typeof weekFor>['week']) {
  const runs: Array<{ key: string; spans: Span[]; from: string; to: string }> = []
  for (let i = 0; i < (input.days ?? 60); i++) {
    const date = addDays(input.today, i)
    const rule = hoursOn(date, input.hours)
    const base = week.find((d) => d.day === weekdayOf(date))
    const baseKey = !base || base.closed ? '' : spanKey(spansOf(base))
    const key = rule.closed ? '' : spanKey(rule.times)
    if (key === baseKey) continue
    const last = runs[runs.length - 1]
    if (last && last.key === key && last.to === addDays(date, -1)) last.to = date
    else runs.push({ key, spans: rule.closed ? [] : rule.times, from: date, to: date })
  }
  return runs.flatMap((r) => (r.spans.length ? r.spans : [{ from: '00:00', to: '00:00' }]).map((s) => ({
    '@type': 'OpeningHoursSpecification', validFrom: r.from, validThrough: r.to, opens: s.from, closes: s.to,
  })))
}

export function restaurantJsonLd(input: RestaurantJsonLdInput): Record<string, unknown> {
  const { week } = weekFor(input.today, input.hours)
  const currency = input.currency
  const sections = input.menu?.sections?.filter((s) => s.items.length)
  const special = specialSpecs(input, week)
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
            offers: { '@type': 'Offer', price: price(i.price), priceCurrency: i.price.currency ?? requireCurrency(currency) },
          })),
        })),
      }
    : input.menu?.url
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: input.name,
    url: input.url,
    ...(input.address ? { address: addressOf(input.address) } : {}),
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.servesCuisine?.length ? { servesCuisine: input.servesCuisine } : {}),
    ...(menu ? { hasMenu: menu } : {}),
    openingHoursSpecification: weeklySpecs(week),
    ...(special.length ? { specialOpeningHoursSpecification: special } : {}),
  }
}

/** schema.org Event for one event of the events brick. Offers are given only with a price. */
export function eventJsonLd(input: EventJsonLdInput): Record<string, unknown> {
  const description = input.description ? plainText(input.description) : ''
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.title,
    startDate: input.start ? `${input.when.from}T${input.start}` : input.when.from,
    endDate: input.when.to,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: input.location.name, ...(input.location.address ? { address: addressOf(input.location.address) } : {}) },
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(description ? { description } : {}),
    ...(input.price ? { offers: { '@type': 'Offer', price: price(input.price), priceCurrency: input.price.currency ?? requireCurrency(input.currency), ...(input.booking ? { url: input.booking } : {}) } } : {}),
  }
}
