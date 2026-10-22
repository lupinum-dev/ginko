// What Today's cards need from the page: the site's settings and the actions that open sheets or write. The page owns
// the sheets and the writes (index.vue); the cards only ask for them.
import type { InjectionKey } from 'vue'
import type { Brick } from '@lupinum/ginko'
import type { Entry } from '../../composables/useSiteData'
import type { TodayFlag } from '../../composables/useTodayAreas'
import type { Task } from '../../utils/content'

export interface TodayContext {
  slug: string
  main: string
  isManager: boolean
  today: string
  timeZone: string
  /** Entries whose removal is on its way. */
  removing: ReadonlySet<string>
  /** "Aufheben" is on its way. */
  lifting: boolean
  entriesOf: (key: string) => Entry[]
  isTimed: (brick: Brick) => boolean
  /** Starts a task; `launcher` gets the focus back when its sheet closes (else the focused element). */
  start: (key: string, task: Task, launcher?: HTMLElement) => void
  /** Opens a listed entry in the task's sheet. */
  openRow: (key: string, task: Task, entryId: string) => void
  remove: (key: string, entry: Entry, task: Task) => void
  lift: (flag: TodayFlag, key: string) => void
  showExpired: (key: string) => void
  expand: (key: string) => void
}

export const TODAY: InjectionKey<TodayContext> = Symbol('today')
