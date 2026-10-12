// How the Studio shows the schema's labels: in the language of the person, else in the main language of the site.
import { useI18n } from '#imports'
import { inject, provide, type InjectionKey } from 'vue'
import { labelOf, type Currency, type Label, type Locale } from '@lupinum/ginko'

/**
 * The language of the Studio's own texts: the person's (ginko-i18n, see useAccountLocale), never the site's. `main` is
 * kept so callers stay as they were; the site's main language is only the fallback of `labelOf`.
 */
export function studioLocale(main: Locale): Locale {
  try {
    return useI18n().locale.value
  } catch {
    // No Nuxt context (a head getter that runs after an await on the server): the site's main language until the next render.
    return main
  }
}

/** The text of a label for the person at a Studio screen. */
export const shownLabel = (label: Label, main: Locale): string => labelOf(label, studioLocale(main), main)

/** The site facts every screen under the site layout needs for labels and prices. */
export interface StudioSite { main: () => Locale; currency: () => Currency }
export const STUDIO_SITE = Symbol('ginko:studio-site') as InjectionKey<StudioSite>

export function provideStudioSite(site: StudioSite): void {
  provide(STUDIO_SITE, site)
}

/** Label text and money settings of the current site; without a site layout (tests) the first text of a label and EUR. */
export function useStudioSite(): { shown: (label: Label) => string; main: () => Locale; currency: () => Currency; locale: () => Locale } {
  const site = inject(STUDIO_SITE, { main: () => '', currency: () => 'EUR' })
  // Read once in setup, so `shown` also works in getters and handlers that run later (useHead, after an await).
  const { locale } = useI18n()
  return { shown: (label) => labelOf(label, locale.value, site.main()), main: site.main, currency: site.currency, locale: () => locale.value }
}
