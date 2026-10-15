/** A navigation item: a collection entry by id (`pages/about`, title and address from the content), or a page of
 *  `pages` in ginko.config.ts with its label per language. */
export type SiteNavItem = { entry: string } | { page: string, label: Record<string, string> }

/** `site` in app/app.config.ts: the brand and navigation of the template. Name, address and contact come from
 *  ginko.config.ts (`name`) and the `site` brick (content/site.md). */
export interface SiteAppConfig {
  /** Shown instead of the name in the header on phones. Default: the name from ginko.config.ts. */
  shortName?: string
  /** A logo file in public/ with its size in pixels. Without it, the header shows the name. */
  logo?: { src: string, width: number, height: number }
  /** The schema.org type of the organisation on the home page. */
  organization: 'Organization' | 'LocalBusiness' | 'NGO'
  /** The header navigation: at most 6 items. The footer repeats it. */
  nav: SiteNavItem[]
  /** More links in the footer, for example a newsletter page. */
  footer: SiteNavItem[]
  /** Profiles elsewhere, as text links in the footer (no third-party icons or scripts). */
  socials: { label: string, url: string }[]
}

/** The collection keys useGinkoNav takes. */
type NavBricks = Extract<Parameters<typeof useGinkoNav>[0], readonly unknown[]>

/** The `site` part of app.config.ts. */
export function useSiteAppConfig(): SiteAppConfig {
  return useAppConfig().site
}

/** The items of a navigation list with their label and path in the current language. An entry that does not exist
 *  in this language (untranslated or removed) is left out. */
export function useSiteLinks(items: () => SiteNavItem[]) {
  const path = useGinkoPath()
  const locale = useGinkoLocale()
  const { mainLocale } = useGinkoSite()
  // useGinkoNav takes the site's collection keys; the ids in app.config.ts are plain strings (`pages/about`), and a
  // key that is no collection of this site is skipped by it.
  const tree = useGinkoNav(() => [...new Set(items().flatMap((item) => ('entry' in item ? [item.entry.split('/')[0]!] : [])))] as NavBricks)
  return computed(() => {
    const byId = new Map<string, { title: string, path: string }>()
    const walk = (nodes: typeof tree.value) => nodes.forEach((node) => {
      if (node.id) byId.set(node.id, node)
      walk(node.children)
    })
    walk(tree.value)
    return items().flatMap((item) => {
      if ('entry' in item) {
        const node = byId.get(item.entry)
        return node ? [{ key: item.entry, label: node.title, to: node.path }] : []
      }
      const label = item.label[locale.value] ?? item.label[mainLocale]
      return label ? [{ key: item.page, label, to: path(item.page as GinkoPageKey) }] : []
    })
  })
}
