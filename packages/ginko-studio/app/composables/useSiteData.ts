// The open site: schema, settings, the caller's role and grants (sites.meta), plus what the caller may do. Every page
// under /s/[site] reads this one query. It carries no entries: each page reads the ones it shows (entries.list, get,
// single, titles, ofBricks), so a save elsewhere does not send the whole site again.
import { api } from '#convex/api'
import type { Brick } from '@lupinum/ginko'
import { ordered, type Schema } from '@lupinum/ginko/internal'
import { useToday } from '@lupinum/ginko-editor'
import { taskRef, type Data, type Task } from '../utils/content'

/** An entry as an editor reads it (server lib/list.ts editorEntry). */
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
  /** Someone removed it (it is in the trash); a form open on it keeps the input (N1). */
  deleted?: boolean
  /** Per foreign language, the texts that are missing or outdated (entries.get and entries.single only). */
  translation?: Record<string, { missing: string[]; outdated: string[] }>
  /** The person created it through a create task, so staff may change it with that task (entries.get only). */
  own?: boolean
}

export async function useSiteData() {
  const route = useRoute()
  const slug = computed(() => String(route.params.site))
  const query = useConvexQuery(api.sites.meta, () => ({ site: slug.value }))
  await query

  const schema = computed(() => query.data.value?.site.schema as Schema | undefined)
  const role = computed(() => query.data.value?.role)
  const grants = computed(() => new Set(query.data.value?.grants ?? []))
  const main = computed(() => schema.value?.locales[0] ?? 'de')
  const today = useToday(() => schema.value?.timeZone ?? 'Europe/Vienna')

  /** owner and admin may do everything; staff only granted tasks (SPEC 2.7). */
  const may = (brick: string, task: Task) => role.value === 'owner' || role.value === 'admin' || grants.value.has(taskRef(brick, task))
  const isManager = computed(() => role.value === 'owner' || role.value === 'admin')

  /** Live bricks in schema order. */
  const bricks = computed(() => ordered(schema.value?.bricks ?? {}).filter(([, b]) => !b.retired) as [string, Brick][])

  return { slug, query, site: computed(() => query.data.value?.site), schema, role, grants, main, today, may, isManager, bricks }
}
