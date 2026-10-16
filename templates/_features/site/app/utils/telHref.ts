/** The `tel:` address of a phone number as people write it: `+49 1234 000030` → `tel:+491234000030`. Auto-imported. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
