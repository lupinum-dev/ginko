// schema.org building blocks shared by the JSON-LD of the basics: postal address and offer price.
import { minorDigits } from '../core/money.ts'

/** An amount in minor units; `currency` (ISO 4217) defaults to the site's. */
export interface Money { amount: number; currency?: string }

/** Street, postal code and city as the owner typed them. The postal code is left out of the output when not given. */
export interface PostalAddressInput {
  street: string
  postalCode?: string
  city: string
  /** ISO country code such as AT or SG. Default: the site's `country`; left out when neither is given. */
  country?: string
}

export function postalAddress(a: PostalAddressInput, siteCountry?: string) {
  const country = a.country ?? siteCountry
  return { '@type': 'PostalAddress', streetAddress: a.street, ...(a.postalCode ? { postalCode: a.postalCode } : {}), addressLocality: a.city, ...(country ? { addressCountry: country } : {}) }
}

/** schema.org `price` and `priceCurrency`: the amount in major units of its currency (2 decimals for EUR, 0 for JPY). */
export function offerPrice(m: Money, siteCurrency: string | undefined) {
  const currency = m.currency ?? siteCurrency
  if (!currency) throw new Error('JSON-LD: pass `currency` (the site’s currency) for prices that carry none.')
  const digits = minorDigits(currency)
  return { price: (m.amount / 10 ** digits).toFixed(digits), priceCurrency: currency }
}

/**
 * schema.org Offer for a price of the site's own JSON-LD (a service, a product): `price` and `priceCurrency` as
 * `offerPrice`. `valueAddedTaxIncluded` (false for net prices) adds a PriceSpecification that says so, so search
 * engines do not read a net price as the full one; left out, the Offer says nothing about VAT. `unitCode` (UN/CEFACT:
 * `MON` per month, `ANN` per year) makes it a recurring price: a UnitPriceSpecification for one such unit, so a
 * subscription's price per month is not read as a one-off price.
 */
export function offerJsonLd(m: Money, siteCurrency: string | undefined, o: { valueAddedTaxIncluded?: boolean, unitCode?: string } = {}) {
  const price = offerPrice(m, siteCurrency)
  const vat = o.valueAddedTaxIncluded === undefined ? {} : { valueAddedTaxIncluded: o.valueAddedTaxIncluded }
  const specification = o.unitCode
    ? { '@type': 'UnitPriceSpecification', ...price, ...vat, referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: o.unitCode } }
    : o.valueAddedTaxIncluded === undefined ? undefined : { '@type': 'PriceSpecification', ...price, ...vat }
  return { '@type': 'Offer', ...price, ...(specification ? { priceSpecification: specification } : {}) }
}
