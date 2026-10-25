// The corpus (contracts/restaurant) is dated around 2026-10-08: notices expire, lunch weeks start.
// Every backend test runs on that day, so results do not change at midnight. A test that needs
// another moment sets its own time.
import { beforeEach, vi } from 'vitest'

export const CORPUS_NOW = Date.parse('2026-10-08T10:00:00Z')

/**
 * Moves the frozen clock one second on and returns the new time. Like Convex, convex-test never starts a transaction
 * before the latest commit, so on a frozen clock each commit lands a little later; the first transaction after
 * `tick()` runs exactly at the returned time. A test that compares a stored time with the clock calls it first.
 */
export function tick(ms = 1000): number {
  vi.setSystemTime(Date.now() + ms)
  return Date.now()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CORPUS_NOW)
})
