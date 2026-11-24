import { lunchWeekOn } from '@lupinum/ginko-preset-gastro'
import { weekdayOf } from '../utils/site'

/**
 * The lunch week to show: a week planned ahead for this work week, else the main `lunch` fields if they
 * are for this week (`lunchWeekOn`). `lunch` is that source, so `langOf(lunch, ...)` (useGinkoLang) and `lunch.data` work for both.
 * Nothing to show: `current` is false and the page shows `lunchPending`.
 */
export function useLunchWeek() {
  const { today } = useSite()
  const main = useGinko('lunch')
  const plans = useGinko('lunchPlans')
  const picked = computed(() => lunchWeekOn(main.value, plans.value.items, today.value, useGinkoWeek()))
  const lunch = computed(() => picked.value ?? main.value)
  const current = computed(() => picked.value !== undefined)
  const todayKey = computed(() => weekdayOf(today.value))
  /** The lunch days from the week's first day (`weekOf`) on, each with its day key: the rows are the site's workdays. */
  const days = computed(() => {
    const start = Date.parse(`${lunch.value.data.weekOf}T12:00:00Z`)
    return Array.from({ length: 7 }, (_, i) => weekdayOf(new Date(start + i * 86_400_000).toISOString().slice(0, 10))).flatMap((day) => {
      const row = lunch.value.data.days[day]
      return row ? [{ day, ...row }] : []
    })
  })
  return { lunch, current, todayKey, days }
}
