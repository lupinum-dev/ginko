// The open site: schema, live entries, the caller's role and grants (sites.get), plus what the
// caller may do. Every page under /s/[site] reads this one query.
import { api } from '#convex/api'
import type { Brick, CollectionBrick, Json } from '@lupinum/ginko'
import { ordered, sortEntries, type Schema, type StoredEntry } from '@lupinum/ginko/internal'
import { useToday } from '@lupinum/ginko-editor'
import { taskRef, type Data, type Task } from '../utils/content'

export interface Entry {
  _id: string
  brick: string
  kind: 'single' | 'item'
  order: number
  data: Data
  rev: number
  fieldRevs: Record<string, number>
  lifeRev: number
  prints: Record<string, Record<string, string>>
  /** Drafts (SPEC 15): absent means live; `publishAt` is set on a scheduled draft. */
  state?: 'draft' | 'live'
  publishAt?: number
}

export async function useSiteData() {
  const route = useRoute()
  const slug = computed(() => String(route.params.site))
  const query = useConvexQuery(api.sites.get, () => ({ site: slug.value }))
  await query

  const schema = computed(() => query.data.value?.site.schema as Schema | undefined)
  const role = computed(() => query.data.value?.role)
  const grants = computed(() => new Set(query.data.value?.grants ?? []))
  const entries = computed(() => (query.data.value?.entries ?? []) as unknown as Entry[])
  const main = computed(() => schema.value?.locales[0] ?? 'de')
  const today = useToday(() => schema.value?.timezone ?? 'Europe/Vienna')

  /** owner and admin may do everything; staff only granted tasks (SPEC 2.7). */
  const may = (brick: string, task: Task) => role.value === 'owner' || role.value === 'admin' || grants.value.has(taskRef(brick, task))
  const isManager = computed(() => role.value === 'owner' || role.value === 'admin')

  /** Live bricks in schema order. */
  const bricks = computed(() => ordered(schema.value?.bricks ?? {}).filter(([, b]) => !b.retired) as [string, Brick][])

  /** A collection's live entries in the site's order; a single's one entry. */
  function entriesOf(key: string): Entry[] {
    const brick = schema.value?.bricks[key]
    const own = entries.value.filter((e) => e.brick === key)
    if (!brick || brick.kind !== 'collection') return own
    const byId = new Map(own.map((e) => [e._id, e]))
    const stored: StoredEntry[] = own.map((e) => ({ id: e._id, order: e.order, data: e.data as Record<string, Json> }) as StoredEntry)
    return sortEntries(brick as CollectionBrick, stored).map((s) => byId.get(s.id)!)
  }
  const single = (key: string) => entries.value.find((e) => e.brick === key)

  return { slug, query, site: computed(() => query.data.value?.site), schema, role, grants, entries, main, today, may, isManager, bricks, entriesOf, single }
}
