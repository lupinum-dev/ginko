import { lunchWeekOn } from '@lupinum/ginko-preset-gastro'
import { weekdayOf } from '../utils/site'

/**
 * The lunch week to show: a week planned ahead for this work week, else the main `lunch` fields if they
 * are for this week (`lunchWeekOn`). `lunch` is that source, so `ginkoLangOf(lunch, ...)` and `lunch.data` work for both.
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
  return { lunch, current, todayKey }
}
