// Runtime config and helpers without Nuxt imports, so the module's unit tests can load them.
import { markdownRequestPath, type Locale, type SiteInput } from '../../internal.ts'

export interface GinkoPublicConfig {
  site: string; name: string; url: string; platform: string; locales: Locale[]; mainLocale: Locale; timeZone: string
  /** `seo` of the site config (`useGinkoSeo` defaults). */
  seo: NonNullable<SiteInput['seo']>
  /** `agents` of the site config (llms.txt, Markdown routes). */
  agents: NonNullable<SiteInput['agents']>
  /** Which sources the site's bricks use (CONTENT.md): a site with only file bricks never asks the platform. */
  sources: { platform: boolean; files: boolean }
}

/**
 * The page a request may ask Markdown for (docs: 10.seo-und-agenten "Addresses and headers"): `<page>.md` always
 * does; any other path is a page if an entry has that URL, also with a dot in its last segment (`/blog/v1.2`).
 * Ginko's and Nuxt's own paths are no pages.
 * Files from public/ never get here: the host serves them first.
 */
export function agentRequest(path: string): { page: string; asMarkdown: boolean } | undefined {
  if (/^\/(__ginko|_nuxt|_ginko)(\/|$)/.test(path)) return undefined
  const page = markdownRequestPath(path)
  return page === undefined ? { page: path, asMarkdown: false } : { page, asMarkdown: true }
}

/** The items of a routed brick, each with `url`: its address in `locale`. */
export function withUrl<T extends { urls?: Partial<Record<string, string>> }>(items: T[], locale: Locale): (T & { url?: string })[] {
  return items.map((item) => ({ ...item, url: item.urls?.[locale] }))
}
