// POC T2 of the v2 spec (ginko-internal: specs/V2-AUTHORING.md, section 19): a site written in v2 produces the stored
// model of its v1 config. Wrong behaviour this catches: the v2 layer changes a stored name, type, limit, address or
// task, which a release to a live site would report as a change of its model.
import { describe, expect, it } from 'vitest'
import { checkSite, diffSchema, serializeSchema, type Json, type Schema, type SiteInput } from '../../src/core/index.ts'
import type { BrickValue, UnknownChoice } from '../../src/core/infer.ts'
import saasV1 from '../../../../sites/saas/ginko.config.ts'
import saasV2 from '../../../../sites/saas/ginko.config.v2.ts'
import companyV1 from '../../../../templates/company/ginko.config.ts'
import companyV2 from '../../../../templates/company/ginko.config.v2.ts'
import starterV1 from '../../../../templates/starter/ginko.config.ts'
import starterV2 from '../../../../templates/starter/ginko.config.v2.ts'
import restaurantV1 from '../../../../sites/restaurant/ginko.config.ts'
import restaurantV2 from '../../../../sites/restaurant/ginko.config.v2.ts'

// Checked by `tsc`, not at run time: a page reads a v2 config with the same types as a v1 config. Wrong behaviour this
// catches: an address in the site's `entries` does not reach the brick's type, so `item.url` is missing in pages.
type CompanyBricks = (typeof companyV2)['bricks']
export const serviceUrl = (services: BrickValue<CompanyBricks['services']>): string => services.items[0]!.url
export const serviceTitle = (services: BrickValue<CompanyBricks['services']>): string => services.items[0]!.data.title
export const jobUrl = (jobs: BrickValue<CompanyBricks['jobs']>): string => jobs.items[0]!.url
// @ts-expect-error logos has no line in `entries`, so its entries have no address
export const logoUrl = (logos: BrickValue<CompanyBricks['logos']>): string => logos.items[0]!.url
export const lunchDay = (lunch: BrickValue<(typeof restaurantV2)['bricks']['lunch']>): 'mo' | 'tu' | 'we' | 'th' | 'fr' | UnknownChoice => lunch.data.days[0]!.day

interface Difference { path: string; v1: unknown; v2: unknown }

/** Every place where two JSON values differ. Object key order does not count; a list of plain values is one value. */
function differences(a: Json | undefined, b: Json | undefined, path: string, out: Difference[] = []): Difference[] {
  const plainList = (v: unknown) => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')
  const isRecord = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (Array.isArray(a) && Array.isArray(b) && !plainList(a) && !plainList(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) differences(a[i], b[i], `${path}.${i}`, out)
  } else if (isRecord(a) && isRecord(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], path ? `${path}.${key}` : key, out)
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, v1: a, v2: b })
  }
  return out
}

const STANDARD = ['add', 'edit', 'remove']

/** The kind of an allowed difference (spec section 19.3), or undefined: then T2 fails. */
function allowed(d: Difference, v1: Schema): string | undefined {
  const task = /^bricks\.([^.]+)\.tasks\.(\d+)\.label(?:\..+)?$/.exec(d.path)
  if (task) {
    const id = v1.bricks[task[1]!]?.tasks?.[Number(task[2])]?.id
    if (id !== undefined && STANDARD.includes(id)) return 'label of a standard task'
  }
  return undefined
}

function compare(v1: SiteInput, v2: SiteInput) {
  const before = serializeSchema(v1)
  const after = serializeSchema(v2)
  const all = differences(before as unknown as Json, after as unknown as Json, '')
  const kinds = all.map((d) => ({ ...d, kind: allowed(d, before) }))
  return {
    unexpected: kinds.filter((d) => d.kind === undefined).map(({ path, v1: a, v2: b }) => ({ path, v1: a, v2: b })),
    allowed: kinds.filter((d) => d.kind !== undefined),
    rejected: diffSchema(before, after).rejected.map((change) => change.path),
    problemsV1: checkSite(v1),
    problemsV2: checkSite(v2),
  }
}

const sites: [string, SiteInput, SiteInput][] = [
  ['templates/starter', starterV1, starterV2],
  ['templates/company', companyV1, companyV2],
  ['sites/saas', saasV1, saasV2],
  ['sites/restaurant', restaurantV1, restaurantV2],
]

describe('a v2 config produces the stored model of its v1 config', () => {
  it.each(sites)('%s', (name, v1, v2) => {
    const result = compare(v1, v2)
    const counts = new Map<string, number>()
    for (const d of result.allowed) counts.set(d.kind!, (counts.get(d.kind!) ?? 0) + 1)
    const byKind = [...counts].map(([kind, count]) => `${count} × ${kind}`)
    console.log(`${name}: ${result.unexpected.length} unexpected, allowed: ${byKind.join(', ') || 'none'}`)
    for (const d of result.allowed) console.log(`  ${d.kind}: ${d.path}  v1=${JSON.stringify(d.v1)}  v2=${JSON.stringify(d.v2)}`)
    expect(result.unexpected).toEqual([])
    expect(result.rejected).toEqual([])
    expect(result.problemsV2).toEqual(result.problemsV1)
  })
})
