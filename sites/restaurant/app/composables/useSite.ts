import { labels as labelTables } from '../utils/site'

/** Language, lookup labels and today's date of the current page. Fixed texts come from `t()` in i18n/<locale>.json. */
export function useSite() {
  const lang = useGinkoLocale()
  const otherLang = computed<GinkoLocale>(() => (lang.value === 'de' ? 'en' : 'de'))
  const labels = computed(() => labelTables[lang.value])
  const today = useGinkoToday()
  return { lang, otherLang, labels, today }
}
