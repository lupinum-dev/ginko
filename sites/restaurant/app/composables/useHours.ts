// The opening-hours data and the date plans, shaped for the preset's `hoursOn` rule. One place, so the
// Heute board, the hours table and the JSON-LD always read the same context.
import type { HourPlan, HoursData } from '../utils/site'

export function useHours() {
  const hours = useGinko('hours')
  const hourPlans = useGinko('hourPlans')
  const data = computed(() => hours.value.data as unknown as HoursData & { holidayNoticeDays: number })
  const plans = computed<HourPlan[]>(() => hourPlans.value.items.map((p) => ({ _id: p.id, ...(p.data as unknown as Omit<HourPlan, '_id'>) })))
  const ctx = computed(() => ({ hours: data.value, plans: plans.value }))
  return { hours, hourPlans, data, plans, ctx }
}
