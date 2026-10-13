// The top-level keys of a site config. Typed against `SiteInput`, so a new or renamed key fails the type check here
// until this list follows it.
import { checkSchema, serializeSchema } from './schema.ts'
import type { SiteInput } from './site.ts'

const SITE_KEYS = {
  site: true, name: true, url: true, timezone: true, locales: true, languages: true, weekStart: true, currency: true,
  pages: true, bricks: true, links: true, redirects: true, seo: true, agents: true, components: true, migrations: true,
  retired: true,
} satisfies Record<keyof SiteInput, true>

/** Messages for keys that a site config does not know. A typo (`redirect`) would otherwise change nothing, silently. */
export function unknownSiteKeys(site: object): string[] {
  return Object.keys(site).filter((key) => !Object.hasOwn(SITE_KEYS, key)).map((key) => `Unknown key “${key}”. Known keys: ${Object.keys(SITE_KEYS).join(', ')}.`)
}

/** Every problem of a site config: unknown keys, then the schema check. `nuxt build` and `ginko check` both run this. */
export function siteProblems(site: SiteInput): string[] {
  return [...unknownSiteKeys(site), ...checkSchema(serializeSchema(site))]
}
