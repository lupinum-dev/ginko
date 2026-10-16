import { formatMoney, type ImageValue, type Money } from '@lupinum/ginko'
import { offerJsonLd } from '@lupinum/ginko/basics'
import type { Card } from '~/components/block/Cards.vue'

/** What the services feature reads of an entry of the `services` brick (app/bricks/services.ts). */
export interface ServiceFacts {
  title: string
  /** `price` (a fixed price) or `onRequest`; a value the brick no longer offers counts as on request. */
  pricing: string
  price?: Money | null
  duration?: number | null
}

/**
 * Texts of a service in the page's language: its price ("€390", "€12.50") or "On request", the label of the price
 * (with "plus VAT" or "incl. VAT" from `vat` in app.config.ts), its duration ("45 minutes", "90 minutes", "2 hours"),
 * and the main action: "Ask for a date" for a fixed price, the enquiry for one on request. A fixed price always has
 * its amount: the brick refuses `pricing: price` without one.
 */
export function useServiceText() {
  const { t, format, language } = useI18n('services')
  const { vat } = useSiteAppConfig()
  const amount = (service: ServiceFacts) => (service.pricing === 'price' ? service.price ?? undefined : undefined)
  const price = (service: ServiceFacts) => {
    const money = amount(service)
    return money ? formatMoney(money, language.value, { wholeWithoutMinor: true }) : t('onRequest')
  }
  const priceLabel = vat === 'excluded' ? t('priceNet') : vat === 'included' ? t('priceGross') : t('price')
  const duration = (service: ServiceFacts) => {
    const minutes = service.duration
    if (!minutes) return undefined
    return minutes >= 60 && minutes % 60 === 0
      ? format.number(minutes / 60, { style: 'unit', unit: 'hour', unitDisplay: 'long' })
      : format.number(minutes, { style: 'unit', unit: 'minute', unitDisplay: 'long' })
  }
  /** Price and duration in one line: "€390 · 2 hours". */
  const meta = (service: ServiceFacts) => [price(service), duration(service)].filter(Boolean).join(' · ')
  /** The label and email subject of the main action. */
  const action = (service: ServiceFacts) => (amount(service)
    ? { label: t('book'), subject: t('bookSubject', { title: service.title }) }
    : { label: t('enquire'), subject: t('subject', { title: service.title }) })
  return { price, priceLabel, duration, meta, action }
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

/** What the Service JSON-LD needs besides the texts: the address of the page and the photo. */
export interface ServiceJsonLdInput extends ServiceFacts {
  summary: string
  url: string
  image?: ImageValue | null
}

/**
 * schema.org Service for a service page: name, summary, address, photo, the business as provider and, with a fixed
 * price, an Offer with the amount in major units, its currency and, with `vat` in app.config.ts, whether VAT is
 * included. A service on request has no Offer, so search engines never read a price the page does not show.
 */
export function useServiceJsonLd(service: () => ServiceJsonLdInput) {
  const { name, url } = useGinkoSite()
  const { vat } = useSiteAppConfig()
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
      ...(price ? { offers: offerJsonLd(price, price.currency, vat ? { valueAddedTaxIncluded: vat === 'included' } : {}) } : {}),
    }
  })
}
