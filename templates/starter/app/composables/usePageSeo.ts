// Synced from templates/_features/site/app/composables/usePageSeo.ts by `pnpm templates sync`. Edit the source, not this copy.
import { siteJsonLd } from '@lupinum/ginko/basics'

export interface PageSeoInput {
  title?: string
  description?: string
  image?: GinkoSeoInput['image']
  /** The home page: the organisation from the `site` brick instead of WebPage and BreadcrumbList. */
  home?: boolean
  /** Home page: more properties of the organisation, which win over those from content/site.md (a `Restaurant`
   *  type, opening hours, a menu). */
  organization?: Record<string, unknown>
  /** Keeps the page out of search engines (a print version). */
  noindex?: boolean
  /** More JSON-LD for this page, for example a FAQPage. */
  jsonLd?: Record<string, unknown>[]
}

/**
 * Title, description, share card and JSON-LD of a page (useGinkoSeo). The home page describes the organisation
 * (Organization, LocalBusiness or NGO from app.config.ts, with address and contact from content/site.md and the
 * country from ginko.config.ts); every other page is a WebPage with a BreadcrumbList from home to itself.
 */
export function usePageSeo(input: () => PageSeoInput) {
  const site = useGinko('site')
  const config = useSiteAppConfig()
  const { name, url } = useGinkoSite()
  const route = useRoute()
  const path = useGinkoPath()
  const { t, language } = useI18n('site')
  const absolute = (p: string) => new URL(p, url).href
  useGinkoSeo(() => {
    const page = input()
    const own = page.jsonLd ?? []
    if (page.home) {
      const organization = siteJsonLd(site.value.data, {
        name,
        url,
        type: config.organization,
        logo: config.logo ? absolute(config.logo.src) : undefined,
        sameAs: config.socials.map((social) => social.url),
      })
      return { title: page.title, description: page.description, image: page.image, noindex: page.noindex, jsonLd: [{ ...organization, ...page.organization }, ...own] }
    }
    // WebPage and a two-step BreadcrumbList are written here: no documented export of @lupinum/ginko builds them
    // (core's breadcrumbLd takes navigation nodes and is internal). Move them to /basics when a second feature needs them.
    const here = absolute(route.path)
    const webPage = { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, url: here, description: page.description, inLanguage: language.value }
    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('home'), item: absolute(path('home')) },
        { '@type': 'ListItem', position: 2, name: page.title, item: here },
      ],
    }
    return { title: page.title, description: page.description, image: page.image, noindex: page.noindex, jsonLd: [webPage, breadcrumbs, ...own] }
  })
}
