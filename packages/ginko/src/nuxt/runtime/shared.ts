// Runtime config and helpers without Nuxt imports, so the module's unit tests can load them.
import type { Locale, SiteInput } from '../../index.ts'

export interface GinkoPublicConfig {
  site: string; name: string; url: string; platform: string; locales: Locale[]; mainLocale: Locale; timezone: string
  /** Which sources the site's bricks use (CONTENT.md): a site with only file bricks never asks the platform. */
  /** `seo` of the site config (`useGinkoSeo` defaults). */
  seo: NonNullable<SiteInput['seo']>
  /** `agents` of the site config (llms.txt, Markdown routes). */
  agents: NonNullable<SiteInput['agents']>
  sources: { platform: boolean; files: boolean }
}

/** The items of a routed brick, each with `url`: its address in `locale`. */
export function withUrl<T extends { urls?: Partial<Record<string, string>> }>(items: T[], locale: Locale): (T & { url?: string })[] {
  return items.map((item) => ({ ...item, url: item.urls?.[locale] }))
}

/** The main locale when the field at `path` was filled from it (SPEC 6 `fallback`), so `lang` can say so. */
export function fallbackLang(fallback: readonly string[] | undefined, path: string, mainLocale: Locale): Locale | undefined {
  return fallback?.includes(path) ? mainLocale : undefined
}
