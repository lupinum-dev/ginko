// The limits of an exception's days (slices 3 and 4), one place for the task sheet and "Tage ändern" (round N6). The
// server checks the same (lib/dated.ts checkDay, checkUntil); these only say so before the press.
import { addDays, leapDayAlone, yearTooLong } from '@lupinum/ginko/internal'

/** The same date last year: the earliest start of a yearly change (decision 3). */
export const yearBack = (day: string) => `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`

/** The earliest start of an exception: today, a yearly one a year back. */
export const earliestStart = (today: string, yearly: boolean) => (yearly ? yearBack(today) : today)

/** The last end a yearly change from `from` may have: the day before the one that makes it a year long (`yearTooLong`). */
export function latestYearlyUntil(from: string): string {
  let until = addDays(from, 365)
  while (yearTooLong({ from, until, yearly: true, set: {} })) until = addDays(until, -1)
  return until
}

export type DaysProblem = 'startsTooFarBack' | 'startsPast' | 'untilBeforeFrom' | 'yearlyTooLong' | 'yearlyLeapDay' | 'untilPast'

/**
 * What is wrong with two valid days of an exception, or undefined. A holding one keeps its start (decision 4); a yearly
 * one may start up to a year back and end before today (it waits for next year), unless it holds.
 */
export function exceptionProblem(o: { from: string; until: string; today: string; yearly: boolean; holding: boolean }): DaysProblem | undefined {
  const { from, until, today, yearly, holding } = o
  if (!holding && from < earliestStart(today, yearly)) return yearly ? 'startsTooFarBack' : 'startsPast'
  if (until < from) return 'untilBeforeFrom'
  if (yearly && yearTooLong({ from, until, yearly: true, set: {} })) return 'yearlyTooLong'
  if (yearly && leapDayAlone({ from, until, yearly: true, set: {} })) return 'yearlyLeapDay'
  return (!yearly || holding) && until < today ? 'untilPast' : undefined
}
