// Synced from templates/_features/site/app/utils/telHref.ts by `pnpm templates sync`. Edit the source, not this copy.
/** The `tel:` link for a phone number written for people ("+49 30 1234"): only digits and "+" are kept. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
