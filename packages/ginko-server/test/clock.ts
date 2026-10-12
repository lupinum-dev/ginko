// The corpus (contracts/restaurant) is dated around 2026-10-08: notices expire, lunch weeks start.
// Every backend test runs on that day, so results do not change at midnight. A test that needs
// another moment sets its own time.
import { beforeEach, vi } from 'vitest'

export const CORPUS_NOW = Date.parse('2026-10-08T10:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CORPUS_NOW)
})
