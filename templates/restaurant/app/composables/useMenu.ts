// Synced from templates/_features/menu/app/composables/useMenu.ts by `pnpm templates sync`. Edit the source, not this copy.
import { allergensEU, dishOn, lunchWeekOn, menuCategories } from '@lupinum/ginko-preset-gastro'
import { hoursOn, weekdayOf } from '@lupinum/ginko/patterns'

/** The 14 EU allergen letters (`allergensEU` of the gastro preset): the menu texts name each of them. */
export type Allergen = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'L' | 'M' | 'N' | 'O' | 'P' | 'R'
export const isAllergen = (code: string): code is Allergen => allergensEU.some((option) => option.value === code)
/**
 * The allergen codes as stored, each once: the EU letters in alphabetical order, then any other code as it is written
 * (a site with its own `allergens` options on `menu()`). Nothing is dropped, so a dish with an allergen never reads as
 * one without.
 */
export const allergenList = (codes: readonly string[] = []): string[] => {
  const unique = [...new Set(codes)]
  return [...unique.filter(isAllergen).sort(), ...unique.filter((code) => !isAllergen(code))]
}

/** The visitor's name of an allergen code: the menu texts' name of an EU letter, else the code as it is written. */
export function useAllergenName() {
  const { t } = useI18n('menu')
  return (code: string) => (isAllergen(code) ? t(`allergens.${code}`) : code)
}

/** The day `days` days after `day` (both `YYYY-MM-DD`). */
const daysAfter = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/**
 * The menu as guests see it today: dishes taken off the menu are left out, a dish marked sold out today stays with
 * `soldOut`, and a new price that starts within 14 days is announced (`next`, from the dish's `upcoming`: the price
 * task can plan a price for a day). The rules come from the gastro preset, so the menu, the allergen key and the
 * JSON-LD agree.
 */
export function useMenu() {
  const menu = useGinko('menu')
  const today = useGinkoToday()
  const dishes = computed(() => menu.value.items.flatMap((item) => {
    const { shown, soldOut } = dishOn(item.data, today.value)
    if (!shown) return []
    const coming = item.upcoming?.find((change) => change.data.price && change.from > today.value && change.from <= daysAfter(today.value, 14))
    const next = coming?.data.price ? { from: coming.from, price: coming.data.price } : undefined
    return [{ item, soldOut, price: item.data.price, next }]
  }))
  // The categories of the `menu()` brick (`menuCategories`), so a dish always has its group: the brick accepts no other.
  const groups = computed(() => menuCategories
    .map((category) => ({ category, dishes: dishes.value.filter((dish) => String(dish.item.data.category) === category) }))
    .filter((group) => group.dishes.length))
  /** The allergen letters of the dishes shown, for the key. */
  const allergens = computed(() => allergenList(dishes.value.flatMap((dish) => dish.item.data.allergens.map(String))))
  return { menu, dishes, groups, allergens }
}

/**
 * The lunch week to show today (`lunchWeekOn`: this work week; at the weekend the coming one), each day with its date
 * and whether the place is closed that day (by the opening hours, so a rest day never shows a dish), or nothing.
 */
export function useLunch() {
  const lunch = useGinko('lunch')
  const today = useGinkoToday()
  const { ctx } = useHours()
  const siteWeek = useGinkoWeek()
  const week = computed(() => lunchWeekOn(lunch.value, [], today.value, siteWeek))
  const days = computed(() => {
    const current = week.value
    if (!current) return []
    // The week runs from its first day (`weekOf`, the site's first weekday); its rows are the site's workdays by day key.
    return Array.from({ length: 7 }, (_, i) => plusDays(current.data.weekOf, i)).flatMap((date) => {
      const key = weekdayOf(date)
      const day = current.data.days[key]
      if (!day) return []
      const rule = hoursOn(ctx.value, date)
      // `served`: the day's first opening span, when lunch is on.
      return [{ ...day, day: key, date, today: date === today.value, closed: rule.closed, reason: rule.closed ? rule.reason : undefined, served: rule.closed ? undefined : rule.times[0] }]
    })
  })
  /** When lunch is served: the first opening span of the open lunch days, when it is the same on all of them. */
  const served = computed(() => {
    const spans = days.value.filter((day) => !day.closed).map((day) => day.served)
    const first = spans[0]
    return first && spans.every((span) => span?.from === first.from && span.to === first.to) ? first : undefined
  })
  return { lunch, week, days, served }
}
