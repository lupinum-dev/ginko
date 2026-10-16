// Synced from templates/_features/site/app/utils/telHref.ts by `pnpm templates sync`. Edit the source, not this copy.
/** The `tel:` address of a phone number as people write it: `+49 1234 000030` → `tel:+491234000030`. Auto-imported. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
