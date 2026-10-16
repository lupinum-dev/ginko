import { safeHref } from '@lupinum/ginko'

/**
 * How to book and how to get here, for the home page and the contact page: phone, email and address from
 * content/site.md (written once, there), the phone hours, an online booking page and the directions from
 * content/visit.md, and "Open in maps" as a link to OpenStreetMap with the address: no embedded map, so nothing
 * loads from another company until the visitor chooses it.
 */
export function useVisit() {
  const site = useGinko('site')
  const visit = useGinko('visit')
  const country: string = useRuntimeConfig().public.ginko.country
  const contact = computed(() => site.value.data)
  const address = computed(() => [contact.value.street, [contact.value.postalCode, contact.value.city].filter(Boolean).join(' ')].filter(Boolean))
  const maps = computed(() => (address.value.length ? `https://www.openstreetmap.org/search?query=${encodeURIComponent([...address.value, country].filter(Boolean).join(', '))}` : undefined))
  // An address the owner typed: safeHref drops unsafe schemes (javascript: …); the field itself accepts only URLs.
  const booking = computed(() => (visit.value.data.bookingUrl ? safeHref(visit.value.data.bookingUrl) : undefined))
  return { contact, visit, address, maps, booking }
}
