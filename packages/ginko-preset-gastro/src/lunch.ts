// Lunch planning: the main `lunch` fields are "this week"; `lunchPlans` entries are weeks planned ahead.
import type { WeekInfo } from '@lupinum/ginko'
import { workWeekOf } from '@lupinum/ginko/internal'

export interface LunchWeekData { weekOf: string; days: unknown[]; note?: unknown }

/**
 * The lunch week to show on `today`: the planned week whose first day is this work week's first day wins,
 * else the main fields if they are for this week, else nothing (the site shows "follows shortly").
 * Past planned weeks never match, so they drop out of every display without a cleanup job.
 * Like the lunch page before, the weekend looks at the coming week (see `workWeekOf`). `week` is the site's `schema.week`.
 */
export function lunchWeekOn<M extends { data: LunchWeekData }, P extends { data: LunchWeekData }>(main: M, planned: readonly P[], today: string, week: WeekInfo): M | P | undefined {
  const start = workWeekOf(today, week)
  return planned.find((p) => p.data.weekOf === start) ?? (main.data.weekOf === start ? main : undefined)
}
