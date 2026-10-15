import { sessionsInOrder, type SessionJsonLdInput, type SessionStatus } from '@lupinum/ginko/basics'

/** A session as the programme, a speaker's page and "now and next" show it: every value read from its entry. */
export interface SessionEntry {
  id: string
  /** The id of its event (`events/<name>`). */
  event: string
  title: string
  /** One or two sentences: what it is about and who it is for. */
  summary?: string
  date: string
  from: string
  to: string
  room?: string
  status: SessionStatus
  /** The speakers by their entry in `people`, with the address of their page. */
  speakers: { id: string, name: string, to?: string }[]
}

// A stored status this code does not know (`UnknownChoice`: added by a later release of basics) shows as open.
const STATUSES: SessionStatus[] = ['open', 'soldOut', 'cancelled']

/**
 * The sessions still to come (the brick hides a session after its day) of the events on the site, in programme order:
 * by date, then start time (`sessionsInOrder`), with their speakers from `people`. A session of an event that is not
 * on the site (a draft, past, or without this language) is left out too: the reference to its event does not hide
 * it. The one place that reads the `sessions` brick, so the programme, the speaker pages, "now and next" and the
 * JSON-LD show the same sessions, times and rooms.
 */
export function useSessions() {
  const sessions = useGinko('sessions')
  const events = useGinko('events')
  const people = useGinko('people')
  return computed<SessionEntry[]>(() => {
    const shown = new Set(events.value.items.map((event) => event.id))
    const byId = new Map(people.value.items.map((person) => [person.id, person]))
    return sessionsInOrder(sessions.value.items).filter((session) => shown.has(session.data.event)).map((session) => ({
      id: session.id,
      event: session.data.event,
      title: session.data.title,
      summary: session.data.summary ?? undefined,
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
 * "Now and next" at the clock of useSessionClock: the sessions running now, the next ones, whether the day is over and
 * the first session of the next day with sessions. `state.day` is false on a day without sessions.
 */
export function useNowAndNext() {
  const rows = useSessions()
  const { at, tick } = useSessionClock()
  const state = computed(() => nowAndNext(rows.value, at.value.date, at.value.clock))
  return { state, at, tick }
}

/**
 * The sessions of one event for its Event JSON-LD (each a `subEvent`): the events feature's event page reads this
 * function when the sessions feature is there, so the event page describes the whole programme.
 */
export function useSessionsLd(event: () => string) {
  const rows = useSessions()
  return computed<SessionJsonLdInput[]>(() => rows.value.filter((row) => row.event === event()).map((row) => ({
    title: row.title,
    date: row.date,
    from: row.from,
    to: row.to,
    room: row.room,
    speakers: row.speakers.map((speaker) => speaker.name),
    status: row.status,
  })))
}
