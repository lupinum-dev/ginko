// @lupinum/ginko/basics: ready-made bricks for the content most sites have, with their schema.org JSON-LD. Each factory
// returns a brick for `bricks` in ginko.config.ts; the components stay in the site. Stored field names never change.
// Every name here is documented on the docs site (Presets page, "Basics").
export type { BasicsOptions } from './shared.ts'
export { site, siteJsonLd, type SiteData, type SiteJsonLdOptions } from './site.ts'
export { legal, legalTypes, type LegalOptions } from './legal.ts'
export { people, personJsonLd, type PersonJsonLdInput } from './people.ts'
export { posts, authors, changelog, postJsonLd, type PostsOptions, type ChangelogOptions, type PostJsonLdInput } from './posts.ts'
export { jobs, jobJsonLd, type JobsOptions, type JobJsonLdInput } from './jobs.ts'
export { faq, faqJsonLd } from './faq.ts'
export { downloads } from './downloads.ts'
// The platform twin of a files config: tools and tests check that a site can move to the Studio.
export { withoutFiles } from '../core/site.ts'
