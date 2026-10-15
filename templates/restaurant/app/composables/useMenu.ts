// Synced from templates/_features/menu/app/composables/useMenu.ts by `pnpm templates sync`. Edit the source, not this copy.
import { allergensEU, dishOn, lunchWeekOn, menuCategories, priceOn, upcomingPrice } from '@lupinum/ginko-preset-gastro'
import { hoursOn, weekdayOf } from '@lupinum/ginko/basics'

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

/**
 * The menu as guests see it today: dishes taken off the menu are left out, a dish marked sold out today stays with
 * `soldOut`, prices are today's (`priceOn`), and a price change within 14 days is announced (`next`). All rules come
 * from the gastro preset, so the menu, the allergen key and the JSON-LD agree.
 */
export function useMenu() {
  const menu = useGinko('menu')
  const today = useGinkoToday()
  const dishes = computed(() => menu.value.items.flatMap((item) => {
    const { shown, soldOut } = dishOn(item.data, today.value)
    if (!shown) return []
    return [{ item, soldOut, price: priceOn(item.data, today.value), next: upcomingPrice(item.data, today.value, 14) }]
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
  const order = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
  const week = computed(() => lunchWeekOn(lunch.value, [], today.value, siteWeek))
  const days = computed(() => {
    const current = week.value
    if (!current) return []
    return current.data.days.map((day) => {
      // The week starts on the site's first weekday (Monday or Sunday); the day keys name weekdays.
      const offset = (order.indexOf(String(day.day)) - order.indexOf(weekdayOf(current.data.weekOf)) + 7) % 7
      const date = plusDays(current.data.weekOf, offset)
      const rule = hoursOn(ctx.value, date)
      // `served`: the day's first opening span, when lunch is on.
      return { ...day, date, today: date === today.value, closed: rule.closed, reason: rule.closed ? rule.reason : undefined, served: rule.closed ? undefined : rule.times[0] }
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
