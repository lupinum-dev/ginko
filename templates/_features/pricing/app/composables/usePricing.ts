import { formatMoney, safeHref, type Money } from '@lupinum/ginko'
import { offerJsonLd } from '@lupinum/ginko/basics'

/** A plan as the pricing table shows it, in the page's language. */
export interface Plan {
  id: string
  name: string
  summary: string
  /** Both prices, or none for a plan on request. */
  prices?: { monthly: string, yearly: string }
  included: string[]
  recommended: boolean
  action: { label: string, href: string }
}

/**
 * The plans of the `pricing` brick (app/bricks/pricing.ts) in their order, with their prices in the page's language
 * ("€89", "89 €") and their action: the plan's own link, else an email to the address of content/site.md with the
 * plan's name in the subject. A priced plan always has both amounts (the brick refuses one without them); a plan whose
 * `pricing` is anything else counts as on request, so a price is never made up. Only the first plan marked
 * `recommended` is marked: two "Recommended" plans would recommend nothing.
 */
export function usePlans() {
  const plans = useGinko('pricing')
  const site = useGinko('site')
  const { t, language } = useI18n('pricing')
  return computed<Plan[]>(() => {
    const recommended = plans.value.items.find((plan) => plan.data.recommended)?.id
    const email = site.value.data.email
    return plans.value.items.map((plan) => {
      const { monthly, yearly } = plan.data
      const priced = plan.data.pricing === 'price' && monthly && yearly
      const href = safeHref(plan.data.actionUrl) ?? (email ? `mailto:${email}?subject=${encodeURIComponent(t('subject', { plan: plan.data.name }))}` : '')
      return {
        id: plan.id,
        name: plan.data.name,
        summary: plan.data.summary,
        prices: priced ? { monthly: formatMoney(monthly, language.value, { wholeWithoutMinor: true }), yearly: formatMoney(yearly, language.value, { wholeWithoutMinor: true }) } : undefined,
        included: (plan.data.included ?? []).map((row) => row.item),
        recommended: plan.id === recommended,
        action: { label: plan.data.actionLabel, href },
      }
    })
  })
}

/** "Prices plus VAT" or "Prices incl. VAT", from `vat` in app.config.ts; none when it is not set. */
export function usePricingVat() {
  const { t } = useI18n('pricing')
  const { vat } = useSiteAppConfig()
  return computed(() => (vat === 'excluded' ? t('net') : vat === 'included' ? t('gross') : undefined))
}

/**
 * schema.org Product for each plan with fixed prices: the plan's name, its summary and two Offers, one per month and
 * one per year (UnitPriceSpecification with the billing period: `MON`, `ANN`), each with the amount in major units,
 * its currency and, with `vat` in app.config.ts, whether VAT is included. A plan on request has no Product, so search
 * engines never read a price the page does not show.
 */
export function usePricingJsonLd() {
  const plans = useGinko('pricing')
  const { name, url } = useGinkoSite()
  const { vat } = useSiteAppConfig()
  const route = useRoute()
  const included = vat ? { valueAddedTaxIncluded: vat === 'included' } : {}
  const offer = (money: Money, unitCode: 'MON' | 'ANN', page: string) => {
    const base = offerJsonLd(money, money.currency, included)
    const { '@type': _type, ...price } = (base.priceSpecification ?? { price: base.price, priceCurrency: base.priceCurrency }) as Record<string, unknown>
    return {
      ...base,
      url: page,
      priceSpecification: { '@type': 'UnitPriceSpecification', ...price, referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode } },
    }
  }
  return computed(() => {
    const page = new URL(route.path, url).href
    return plans.value.items.flatMap((plan) => {
      const { monthly, yearly } = plan.data
      if (plan.data.pricing !== 'price' || !monthly || !yearly) return []
      return [{
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: `${name} ${plan.data.name}`,
        description: plan.data.summary,
        brand: { '@type': 'Brand', name },
        offers: [offer(monthly, 'MON', page), offer(yearly, 'ANN', page)],
      }]
    })
  })
}
