import type { BundleItem, Bundle } from './bundle.ts'
import type { Money } from './infer.ts'
import type { Field, Fields, RefField } from './types.ts'

type Scalar = string | number | boolean
type Data = Record<string, unknown>

/** What a condition compares a value with: one element of a list value, money by `amount`, a daterange by its start date. */
type Comparable<V> = V extends readonly (infer E)[] ? E : V extends Money ? Pick<Money, 'amount'> : V extends { from: string } ? string : V

/**
 * A test on one field. `eq`/`ne`: equal or not (for a list value: one element is). `gt`, `gte`, `lt`, `lte`: compare.
 * `in`: equal to one of these. `contains`: a text contains this text (case-insensitive), a list contains this element.
 */
export interface Condition<V = unknown> {
  eq?: Comparable<V> | null; ne?: Comparable<V> | null; gt?: Comparable<V>; gte?: Comparable<V>; lt?: Comparable<V>; lte?: Comparable<V>
  in?: readonly Comparable<V>[]; contains?: Comparable<V>
}
/** A sort order: the text `'price desc, name'` (`asc` is the default) or `{ field, dir? }` like a brick's `order`. */
export type QueryOrder<D = Data> = string | { field: keyof D & string; dir?: 'asc' | 'desc' }
/** `D` is the data of the brick's entries; `useGinkoQuery` sets it, so field names and values are checked. */
export interface Query<D = Data> {
  /** Per field a value (equal to it) or a `Condition`; every field must match. */
  where?: { [K in keyof D]?: Comparable<D[K]> | null | Condition<D[K]> }
  /** Default: the bundle's item order. */
  order?: QueryOrder<D>
  /** At least 1; without it, every matching entry. */
  limit?: number
  /** 1-based. */
  page?: number
  fields?: (keyof D & string)[]
  facets?: (keyof D & string)[]
  include?: (keyof D & string)[]
}
export interface QueryResult {
  items: BundleItem[]
  total: number
  page: number
  pages: number
  facets?: Record<string, Record<string, number>>
}
/** What `query` reads of the schema: the fields of each brick (a full `Schema` fits). */
export interface QuerySchema { bricks: Record<string, { fields: Fields }> }

const OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function refOf(field: Field | undefined): RefField | undefined {
  return field?.type === 'ref' ? field : undefined
}

function collectionOf(bundle: Bundle, brick: string): BundleItem[] {
  const b = Object.hasOwn(bundle.bricks, brick) ? bundle.bricks[brick] : undefined
  if (!b || b.kind !== 'collection') throw new Error(`query: "${brick}" is not a collection of this bundle`)
  return b.items
}

/** Comparable form of a value: money by amount, daterange by `from`; dates and times stay ISO strings. */
function scalar(v: unknown): Scalar | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (isRecord(v) && 'amount' in v) return Number(v.amount)
  if (isRecord(v) && 'from' in v) return String(v.from)
  return JSON.stringify(v)
}

function compare(a: Scalar, b: Scalar): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function equals(value: unknown, want: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => equals(v, want))
  if (value === undefined || value === null) return want === null || want === undefined
  return scalar(value) === scalar(want)
}

function matches(value: unknown, cond: Condition): boolean {
  if ('eq' in cond && !equals(value, cond.eq)) return false
  if ('ne' in cond && equals(value, cond.ne)) return false
  for (const op of ['gt', 'gte', 'lt', 'lte'] as const) {
    if (!(op in cond)) continue
    const a = scalar(value)
    const b = scalar(cond[op])
    if (a === undefined || b === undefined) return false
    const c = compare(a, b)
    if (op === 'gt' ? c <= 0 : op === 'gte' ? c < 0 : op === 'lt' ? c >= 0 : c > 0) return false
  }
  if ('in' in cond) {
    const list = cond.in
    if (!Array.isArray(list)) throw new Error('query: "in" needs an array')
    if (!list.some((w) => equals(value, w))) return false
  }
  if ('contains' in cond) {
    const want = cond.contains
    if (typeof value === 'string') {
      if (!value.toLowerCase().includes(String(want).toLowerCase())) return false
    } else if (!equals(value, want)) return false
  }
  return true
}

function asCondition(spec: unknown): Condition {
  if (isRecord(spec) && Object.keys(spec).length > 0 && Object.keys(spec).every((k) => OPERATORS.includes(k))) return spec as Condition
  return { eq: spec as Condition['eq'] }
}

function knownFields(items: BundleItem[], brick: string, schema?: QuerySchema): Set<string> | undefined {
  const fields = schema && Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick]!.fields : undefined
  if (fields) return new Set(Object.keys(fields))
  if (items.length === 0) return undefined
  return new Set(items.flatMap((i) => Object.keys(i.data)))
}

function checkField(known: Set<string> | undefined, field: string, brick: string, where: string): void {
  if (known && !known.has(field)) throw new Error(`query: brick "${brick}" has no field "${field}" (${where})`)
}

function parseOrder(input: QueryOrder<Data>): { field: string; sign: 1 | -1 }[] {
  if (typeof input !== 'string') {
    if (!input.field || (input.dir !== undefined && input.dir !== 'asc' && input.dir !== 'desc')) throw new Error(`query: invalid order ${JSON.stringify(input)}`)
    return [{ field: input.field, sign: input.dir === 'desc' ? -1 : 1 }]
  }
  const order = input
  return order.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [field, dir, extra] = part.split(/\s+/)
    if (!field || extra !== undefined || (dir !== undefined && dir !== 'asc' && dir !== 'desc')) throw new Error(`query: invalid order "${part}"`)
    return { field, sign: dir === 'desc' ? -1 : 1 }
  })
}

function sortItems(items: BundleItem[], order: { field: string; sign: 1 | -1 }[]): BundleItem[] {
  // Array.prototype.sort is stable: equal items keep the bundle order. Missing values go last in both directions.
  return [...items].sort((a, b) => {
    for (const { field, sign } of order) {
      const x = scalar(a.data[field])
      const y = scalar(b.data[field])
      if (x === undefined && y === undefined) continue
      if (x === undefined) return 1
      if (y === undefined) return -1
      const c = compare(x, y)
      if (c !== 0) return sign * c
    }
    return 0
  })
}

/** Filter, order, page, project and enrich the items of one collection brick. Pure; throws on a field the brick does not have. */
export function query(bundle: Bundle, brick: string, q: Query = {}, schema?: QuerySchema): QueryResult {
  if (q.limit !== undefined && !(q.limit >= 1)) throw new Error(`query: limit must be at least 1 (got ${String(q.limit)})`)
  const all = collectionOf(bundle, brick)
  const known = knownFields(all, brick, schema)
  const where = Object.entries(q.where ?? {}).map(([field, spec]) => {
    checkField(known, field, brick, 'where')
    return { field, cond: asCondition(spec) }
  })
  for (const f of q.fields ?? []) checkField(known, f, brick, 'fields')
  for (const f of q.facets ?? []) checkField(known, f, brick, 'facets')
  for (const f of q.include ?? []) checkField(known, f, brick, 'include')
  const order = q.order ? parseOrder(q.order) : []
  for (const o of order) checkField(known, o.field, brick, 'order')

  let items = all.filter((item) => where.every(({ field, cond }) => matches(item.data[field], cond)))
  if (order.length) items = sortItems(items, order)
  const total = items.length

  let facets: QueryResult['facets']
  if (q.facets?.length) {
    facets = {}
    for (const field of q.facets) {
      // A Map, so a value such as `constructor` or `__proto__` counts like any other.
      const counts = new Map<string, number>()
      for (const item of items) {
        const v = item.data[field]
        for (const one of Array.isArray(v) ? v : [v]) {
          const s = scalar(one)
          if (s !== undefined) counts.set(String(s), (counts.get(String(s)) ?? 0) + 1)
        }
      }
      facets[field] = Object.fromEntries(counts)
    }
  }

  const limit = q.limit !== undefined ? Math.floor(q.limit) : undefined
  const page = q.page !== undefined && q.page > 0 ? Math.floor(q.page) : 1
  const pages = limit ? Math.max(1, Math.ceil(total / limit)) : 1
  if (limit) items = items.slice((page - 1) * limit, page * limit)
  else if (page > 1) items = []

  if (q.include?.length) items = items.map((item) => include(bundle, brick, item, q.include!, schema))
  if (q.fields) {
    const keep = new Set(q.fields)
    items = items.map((item) => ({ ...item, data: Object.fromEntries(Object.entries(item.data).filter(([k]) => keep.has(k))) }))
  }
  return { items, total, page, pages, ...(facets ? { facets } : {}) }
}

function include(bundle: Bundle, brick: string, item: BundleItem, fields: string[], schema?: QuerySchema): BundleItem {
  if (!schema || !Object.hasOwn(schema.bricks, brick)) return item
  const data = { ...item.data }
  for (const name of fields) {
    const ref = refOf(schema.bricks[brick]!.fields[name])
    const target = ref && Object.hasOwn(bundle.bricks, ref.to) ? bundle.bricks[ref.to] : undefined
    if (!ref || target?.kind !== 'collection') continue
    const find = (id: unknown) => target.items.find((t) => t.id === id) ?? id
    const value = data[name]
    if (Array.isArray(value)) data[name] = value.map(find)
    else if (typeof value === 'string') data[name] = find(value)
  }
  return { ...item, data }
}

/** The items before and after `id` in the given (or default) order. Both are missing for an unknown id. */
export function neighbors(bundle: Bundle, brick: string, id: string, order?: QueryOrder): { prev?: BundleItem; next?: BundleItem } {
  let items = collectionOf(bundle, brick)
  if (order) items = sortItems(items, parseOrder(order))
  const at = items.findIndex((i) => i.id === id)
  if (at < 0) return {}
  const prev = items[at - 1]
  const next = items[at + 1]
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) }
}
