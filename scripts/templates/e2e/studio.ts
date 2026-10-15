// Shared by the gate 7 specs (templates/_features/<feature>/e2e/studio/*.spec.ts): where the Studio and the site are.
export const studio = {
  /** The site's slug on the platform; the Studio opens it at /s/<slug>. */
  site: process.env.TEMPLATE_SITE ?? '',
  siteUrl: process.env.TEMPLATE_SITE_URL ?? 'http://localhost:3000',
}
