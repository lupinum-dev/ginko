import { labels as labelTables, siteName } from '../utils/site'

/** Language, lookup labels and today's date of the current page. Fixed texts come from `t()` in i18n/<lang>.json. */
export function useSite() {
  const lang = useGinkoLocale()
  const labels = computed(() => labelTables[lang.value])
  const today = useGinkoToday()
  return { lang, labels, today }
}

/** Title and description of a fixed page: `<Page> | Taktwerk`, text from the site's labels. */
export function usePageSeo(key: GinkoPageKey) {
  const { labels } = useSite()
  useSeoMeta({
    title: () => `${labels.value.pages[key].title} | ${siteName}`,
    description: () => labels.value.pages[key].description,
    ogTitle: () => `${labels.value.pages[key].title} | ${siteName}`,
    ogDescription: () => labels.value.pages[key].description,
  })
}
