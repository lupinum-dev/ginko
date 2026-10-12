import { labels as labelTables, siteName } from '../utils/site'

/** Language, lookup labels and today's date of the current page. Fixed texts come from `t()` in i18n/<locale>.json. */
export function useSite() {
  const lang = useGinkoLocale()
  const otherLang = computed<GinkoLocale>(() => (lang.value === 'de' ? 'en' : 'de'))
  const labels = computed(() => labelTables[lang.value])
  const today = useGinkoToday()
  // "<Page> | Brunner Präzisionstechnik" with the fixed description of the page kind. There is no seo brick.
  const head = (title: () => string, key: GinkoPageKey, ogImage?: () => string | undefined) => {
    useSeoMeta({
      title: () => `${title()} | ${siteName}`,
      description: () => labels.value.descriptions[key],
      ogTitle: () => `${title()} | ${siteName}`,
      ogDescription: () => labels.value.descriptions[key],
      ogImage,
    })
  }
  return { lang, otherLang, labels, today, head }
}
