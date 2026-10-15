import { formatMoney, type ImageValue, type Money } from '@lupinum/ginko'
import type { Card } from '~/components/block/Cards.vue'

/** What the services feature reads of an entry of the `services` brick (app/bricks/services.ts). */
export interface ServiceFacts {
  title: string
  /** `price` (a fixed price) or `onRequest`; a value the brick no longer offers counts as on request. */
  pricing: string
  price?: Money | null
  duration?: number | null
}

/** Digits after the decimal point of a currency: 2 for EUR, 0 for JPY. */
const digitsOf = (currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2

/** A price in the page's language, without minor units when the amount is whole ("€390", "€12.50"). */
function moneyText(money: Money, language: string): string {
  const value = money.amount / 10 ** digitsOf(money.currency)
  if (!Number.isInteger(value)) return formatMoney(money, language)
  return new Intl.NumberFormat(language, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(value).replace(/\s/g, ' ')
}

/**
 * Texts of a service in the page's language: its price or "On request", and its duration ("90 minutes",
 * "2 hours"). A fixed price without an amount is a mistake in the content: `npm run dev` stops on it with the
 * service's title; a built site shows "On request" rather than no price or a wrong one.
 */
export function useServiceText() {
  const { t, format, language } = useI18n('services')
  const price = (service: ServiceFacts) => {
    if (service.pricing === 'price' && service.price) return moneyText(service.price, language.value)
    if (service.pricing === 'price' && import.meta.dev) throw new Error(`content/services: “${service.title}” has \`pricing: price\` but no \`price\`. Add the amount, or set \`pricing: onRequest\`.`)
    return t('onRequest')
  }
  const duration = (service: ServiceFacts) => {
    const minutes = service.duration
    if (!minutes) return undefined
    const hours = minutes / 60
    return minutes >= 60 && Number.isInteger(hours * 2)
      ? format.number(hours, { style: 'unit', unit: 'hour', unitDisplay: 'long' })
      : format.number(minutes, { style: 'unit', unit: 'minute', unitDisplay: 'long' })
  }
  /** Price and duration in one line: "€390 · 2 hours". */
  const meta = (service: ServiceFacts) => [price(service), duration(service)].filter(Boolean).join(' · ')
  return { price, duration, meta }
}

/** The services in their order as cards (BlockCards): price and duration above the title, the summary, the photo. */
export function useServiceCards(limit?: () => number | undefined) {
  const services = useGinko('services')
  const { meta } = useServiceText()
  return computed<Card[]>(() => services.value.items.slice(0, limit?.()).map((service) => ({
    key: service.id,
    title: service.data.title,
    to: service.url,
    text: service.data.summary,
    meta: meta(service.data),
    image: service.data.image,
  })))
}

/** A product sheet: the entry of the downloads brick that a service's `sheet` names. */
export interface ServiceSheet { title: string, url: string, name: string, size: number }

/**
 * The product sheet of a service. `sheet` exists only with `services({ downloads })`, and a site without downloads
 * has no such brick, so the brick is read by the name in the entry's id (`downloads/<file>`) and the entry is checked
 * by its shape (title and a file).
 */
export function useServiceSheet(sheet: () => unknown) {
  const id = sheet()
  const downloads = useGinko((typeof id === 'string' ? id.split('/')[0]! : '') as string as Parameters<typeof useGinko>[0])
  return computed<ServiceSheet | undefined>(() => {
    const value: unknown = downloads.value
    const want = sheet()
    if (typeof want !== 'string' || !value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return undefined
    const data: unknown = value.items.find((item: { id?: unknown }) => item.id === want)?.data
    if (!data || typeof data !== 'object' || !('title' in data) || !('file' in data)) return undefined
    const { title, file } = data
    if (typeof title !== 'string' || !file || typeof file !== 'object' || !('url' in file) || typeof file.url !== 'string') return undefined
    return { title, url: file.url, name: 'name' in file && typeof file.name === 'string' ? file.name : file.url, size: 'size' in file && typeof file.size === 'number' ? file.size : 0 }
  })
}

/** What the Service JSON-LD needs besides the texts: the address of the page and the photo. */
export interface ServiceJsonLdInput extends ServiceFacts {
  summary: string
  url: string
  image?: ImageValue | null
}

/**
 * schema.org Service for a service page: name, summary, address, photo, the business as provider and, with a fixed
 * price, an Offer with the amount in major units and its currency. A service on request has no Offer, so search
 * engines never read a price the page does not show.
 */
export function useServiceJsonLd(service: () => ServiceJsonLdInput) {
  const { name, url } = useGinkoSite()
  const country: string = useRuntimeConfig().public.ginko.country
  const absolute = (path: string) => new URL(path, url).href
  return computed(() => {
    const s = service()
    const price = s.pricing === 'price' ? s.price : undefined
    return {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: s.title,
      description: s.summary,
      url: absolute(s.url),
      ...(s.image ? { image: absolute(s.image.url) } : {}),
      provider: { '@type': 'Organization', name, url },
      ...(country ? { areaServed: { '@type': 'Country', name: country } } : {}),
      ...(price ? { offers: { '@type': 'Offer', price: (price.amount / 10 ** digitsOf(price.currency)).toFixed(digitsOf(price.currency)), priceCurrency: price.currency } } : {}),
    }
  })
}
