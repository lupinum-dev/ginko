import type { NuxtPage } from '@nuxt/schema'
import { inUserZone, isExcluded, localizePath, type LocaleConfig } from './core/locales.ts'

/** definePageMeta({ i18n }) of a page. */
export interface PageI18n {
  /** Path per locale code. Locales not listed keep the file path. */
  paths?: Record<string, string>
  /** Limit the page to these locale codes. */
  locales?: string[]
}

/**
 * Nuxt adds an empty page (its `component-stub`) at the source of every `redirect` route rule, so the router knows the
 * path and the rule can redirect. Such a page is one exact address: a copy per locale would answer the prefixed path
 * with 200 and an empty page, because no rule redirects it.
 */
const isRedirectStub = (page: NuxtPage) => !page.name && /[\\/]component-stub\.[cm]?[jt]s$/.test(page.file ?? '')

/** One route per page and locale, from definePageMeta({ i18n }). */
export function localizePages(pages: NuxtPage[], config: LocaleConfig): NuxtPage[] {
  const codes = config.locales.map(l => l.code)
  const suffix = (page: NuxtPage, code: string): NuxtPage => ({
    ...page,
    name: page.name ? `${page.name}__${code}` : undefined,
    children: page.children?.map(child => suffix(child, code)),
  })
  const out: NuxtPage[] = []
  for (const page of pages) {
    const options = page.meta?.i18n as PageI18n | false | undefined
    if (options === false || isRedirectStub(page) || isExcluded(page.path, config) || inUserZone(page.path, config)) {
      out.push(page)
      continue
    }
    for (const code of options?.locales ?? codes) {
      if (!codes.includes(code))
        throw new Error(`[ginko-i18n] ${page.file} lists locale "${code}" in definePageMeta, but it is not in i18n.locales.`)
      const path = options?.paths?.[code] ?? page.path
      out.push({
        ...suffix(page, code),
        path: localizePath(path, code, config),
        meta: { ...page.meta, i18nBase: page.name, i18nLocale: code },
      })
    }
  }
  return out
}
