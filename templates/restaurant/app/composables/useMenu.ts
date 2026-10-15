// Synced from templates/_features/menu/app/composables/useMenu.ts by `pnpm templates sync`. Edit the source, not this copy.
import { allergensEU, dishOn, lunchWeekOn, priceOn, upcomingPrice } from '@lupinum/ginko-preset-gastro'
import { hoursOn, weekdayOf } from '@lupinum/ginko/basics'

/** The categories of the menu brick, in the order of the menu. */
export const MENU_CATEGORIES = ['starters', 'soups', 'mains', 'desserts', 'drinks'] as const
export type MenuCategory = (typeof MENU_CATEGORIES)[number]

/** The 14 EU allergen letters as the menu stores them (`allergensEU` of the gastro preset). */
export type Allergen = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'L' | 'M' | 'N' | 'O' | 'P' | 'R'
export const isAllergen = (code: string): code is Allergen => allergensEU.some((option) => option.value === code)
/** Known letters only, each once, in alphabetical order. */
export const allergenList = (codes: readonly string[] = []): Allergen[] => [...new Set(codes)].filter(isAllergen).sort()

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
  const groups = computed(() => MENU_CATEGORIES
    .map((category) => ({ category, dishes: dishes.value.filter((dish) => String(dish.item.data.category) === category) }))
    .filter((group) => group.dishes.length))
  // A dish in a category this list does not know stays off the page; `ginko check` names unknown values.
  /** The allergen letters of the dishes shown, for the key. */
  const allergens = computed(() => allergenList(dishes.value.flatMap((dish) => dish.item.data.allergens.map(String))))
  return { menu, dishes, groups, allergens }
}

/**
 * The lunch week to show today (`lunchWeekOn`: this work week; at the weekend the coming one), each day with its date
 * and whether the house is closed that day (by the opening hours, so a rest day never shows a dish), or nothing.
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
      return { ...day, date, today: date === today.value, closed: rule.closed, reason: rule.closed ? rule.reason : undefined }
    })
  })
  /** Today's dish, when this week's lunch has one and the house is open today. */
  const todayDish = computed(() => days.value.find((day) => day.today && !day.closed))
  return { lunch, week, days, todayDish }
}
