// The site's own routes and lookup tables. Fixed texts are ginko-i18n messages in i18n/<locale>.json.
// Content comes from the bundle. Opening-hours logic comes from the gastro preset.
// Option labels in ginko.config.ts are editor text (SPEC 2), so visitor names live in code, per language:
// allergens and weekdays from the preset, menu categories and veg labels here.

import { allergenNames, weekdayNames } from '@lupinum/ginko-preset-gastro'

// Re-exported for the components (Nuxt auto-imports what app/utils exports).
export { hoursOn, spansOf, spansText, timesOf, todayState, upcomingClosures, upcomingHolidayClosures, upcomingPlans, weekdayOf, weekFor, type DayHours, type Exception, type HourPlan, type HoursData, type TodayState, type Weekday } from '@lupinum/ginko-preset-gastro'

/** The house name. Address, phone and e-mail are content (brick `contact`), maintained by the owner. */
export const siteName = 'Gasthaus zur Linde'

/** `tel:` link for a phone number as typed ("+43 662 000 000" → "tel:+43662000000"). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`
}

/** Lookup tables read with a dynamic key (`t()` takes only literal keys), so they stay in TypeScript, per language. */
export const labels = {
  de: {
    categories: { starters: 'Vorspeisen', soups: 'Suppen', mains: 'Hauptspeisen', desserts: 'Nachspeisen', drinks: 'Getränke' } as Record<string, string>,
    veg: { vegetarian: 'vegetarisch', vegan: 'vegan' } as Record<string, string>,
    allergens: allergenNames.de,
    weekdays: weekdayNames.de,
  },
  en: {
    categories: { starters: 'Starters', soups: 'Soups', mains: 'Mains', desserts: 'Desserts', drinks: 'Drinks' } as Record<string, string>,
    veg: { vegetarian: 'vegetarian', vegan: 'vegan' } as Record<string, string>,
    allergens: allergenNames.en,
    weekdays: weekdayNames.en,
  },
}

/** Node and browsers ship different ICU data; one space kind keeps server and client text equal. */
const nbsp = (text: string) => text.replace(/\s/g, '\u00a0')


/** The print page of the lunch week. Not a `pages` entry of ginko.config.ts: it is no content page, so it stays out of the sitemap. */
export const lunchPrintPath = (lang: 'de' | 'en') => (lang === 'de' ? '/mittagsmenue/drucken' : '/en/lunch/print')
