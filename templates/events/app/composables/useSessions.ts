// Synced from templates/_features/sessions/app/composables/useSessions.ts by `pnpm templates sync`. Edit the source, not this copy.
import { sessionsInOrder, type SessionStatus } from '@lupinum/ginko/basics'

/** A session as the programme, a speaker's page and "now and next" show it: every value read from its entry. */
export interface SessionEntry {
  id: string
  /** The id of its event (`events/<name>`). */
  event: string
  title: string
  date: string
  from: string
  to: string
  room?: string
  status: SessionStatus
  /** The speakers by their entry in `people`, with the address of their page. */
  speakers: { id: string, name: string, to?: string }[]
}

const STATUSES: SessionStatus[] = ['open', 'soldOut', 'cancelled']

/**
 * The sessions still to come (the brick hides a session after its day) in programme order: by date, then start time
 * (`sessionsInOrder`), with their speakers from `people`. The one place that reads the `sessions` brick, so the
 * programme, the speaker pages, "now and next" and the JSON-LD show the same time and room.
 */
export function useSessions() {
  const sessions = useGinko('sessions')
  const people = useGinko('people')
  return computed<SessionEntry[]>(() => {
    const byId = new Map(people.value.items.map((person) => [person.id, person]))
    return sessionsInOrder(sessions.value.items).map((session) => ({
      id: session.id,
      event: session.data.event,
      title: session.data.title,
      date: session.data.date,
      from: session.data.from,
      to: session.data.to,
      room: session.data.room ?? undefined,
      status: STATUSES.find((status) => status === session.data.status) ?? 'open',
      speakers: (session.data.speakers ?? []).flatMap((id) => {
        const person = byId.get(id)
        return person ? [{ id, name: person.data.name, to: person.url }] : []
      }),
    }))
  })
}

/** Texts of a session in the page's language: "10:30–11:15", the state as a word (none while it takes place), the day. */
export function useSessionText() {
  const { t, format } = useI18n('sessions')
  // A narrow screen breaks before or after a time span, never inside it (word joiners around the dash).
  const time = (session: Pick<SessionEntry, 'from' | 'to'>) => `${session.from}⁠–⁠${session.to}`
  const status = (session: Pick<SessionEntry, 'status'>) => (session.status === 'open' ? undefined : t(`status.${session.status}`))
  /** "Thursday, 19 November": the heading of a day. */
  const day = (date: string) => format.date(date, { weekday: 'long', day: 'numeric', month: 'long' })
  /** "Thu, 19 Nov": the day next to a time in a list. */
  const shortDay = (date: string) => format.date(date, { weekday: 'short', day: 'numeric', month: 'short' })
  return { time, status, day, shortDay }
}

/**
 * The clock of "now and next": the instant of the server's render, carried to the browser so both show the same
 * sessions; a component that shows it moves it on every minute after it is mounted (`tick`).
 */
export function useSessionClock() {
  const { timeZone } = useGinkoSite()
  const now = useState('sessions:now', () => Date.now())
  const at = computed(() => dayAndClock(timeZone, now.value))
  const tick = () => {
    now.value = Date.now()
    const timer = setInterval(() => (now.value = Date.now()), 60_000)
    onBeforeUnmount(() => clearInterval(timer))
  }
  return { at, tick }
}

/**
 * schema.org Event per event that has sessions (useEventLd of the events feature), each session a `subEvent` with the
 * site's time zone offset, read from the same rows as the programme. For the programme page.
 */
export function useProgrammeJsonLd(rows: () => SessionEntry[]) {
  const events = useGinko('events')
  const build = useEventLd()
  return computed(() => events.value.items.flatMap((event) => {
    const own = rows().filter((row) => row.event === event.id)
    if (!own.length) return []
    return [build({ ...event.data, url: event.url ?? '/' }, {
      sessions: own.map((row) => ({
        title: row.title,
        date: row.date,
        from: row.from,
        to: row.to,
        room: row.room,
        speakers: row.speakers.map((speaker) => speaker.name),
        status: row.status,
      })),
    })]
  }))
}
