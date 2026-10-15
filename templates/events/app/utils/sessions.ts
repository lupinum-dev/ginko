// Synced from templates/_features/sessions/app/utils/sessions.ts by `pnpm templates sync`. Edit the source, not this copy.
// The rules behind the programme and "now and next" without Vue or Nuxt: plain functions of dates and clock times in
// the site's time zone. useSessions and the components use them (auto-imported from app/utils/); tests import this
// file directly.

/** What these rules read of a session: its day, start and end (`HH:MM`, site time zone) and its state. */
export interface SessionTimes {
  date: string
  from: string
  to: string
  status: string
}

/** The day (`YYYY-MM-DD`) and clock time (`HH:MM`, 24 h) of an instant in a time zone. */
export function dayAndClock(timeZone: string, time: number): { date: string, clock: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(time).map((part) => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}` }
}

/** Sessions grouped by day, in the order given (`sessionsInOrder` of the basics: date, then start time). */
export function byDay<S extends { date: string }>(sessions: readonly S[]): { date: string, sessions: S[] }[] {
  const days: { date: string, sessions: S[] }[] = []
  for (const session of sessions) {
    const last = days.at(-1)
    if (last?.date === session.date) last.sessions.push(session)
    else days.push({ date: session.date, sessions: [session] })
  }
  return days
}

/**
 * What is on at `clock` on `date` and what comes next, from sessions in programme order. Only on a day with sessions
 * (`day: false` otherwise, and the home page shows nothing). `now`: the sessions running at the clock (from its start
 * up to, not including, its end). `next`: the sessions with the next start time after the clock on the same day,
 * all of them when several rooms start together. `over`: the day's last session has ended. A cancelled session counts
 * like the others, so its room and time still show with the word "cancelled".
 */
export function nowAndNext<S extends SessionTimes>(sessions: readonly S[], date: string, clock: string): { day: boolean, now: S[], next: S[], over: boolean } {
  const today = sessions.filter((s) => s.date === date)
  if (!today.length) return { day: false, now: [], next: [], over: false }
  const now = today.filter((s) => s.from <= clock && clock < s.to)
  const start = today.map((s) => s.from).filter((from) => from > clock).sort()[0]
  const next = start ? today.filter((s) => s.from === start) : []
  return { day: true, now, next, over: !now.length && !next.length }
}
