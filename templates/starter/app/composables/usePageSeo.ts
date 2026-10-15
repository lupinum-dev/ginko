// Synced from templates/_features/site/app/composables/usePageSeo.ts by `pnpm templates sync`. Edit the source, not this copy.
import { siteJsonLd } from '@lupinum/ginko/basics'

export interface PageSeoInput {
  title?: string
  description?: string
  image?: GinkoSeoInput['image']
  /** The home page: the organisation from the `site` brick instead of WebPage and BreadcrumbList. */
  home?: boolean
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
        sameAs: config.socials.map((social: { url: string }) => social.url),
      })
      return { title: page.title, description: page.description, image: page.image, jsonLd: [organization, ...own] }
    }
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
    return { title: page.title, description: page.description, image: page.image, jsonLd: [webPage, breadcrumbs, ...own] }
  })
}
