// SPEC 5.1 step 4: the candidate the platform would build, computed here so the CLI can refuse
// a release before it is sent. The platform repeats the same work in sites.release (SPEC 5.2),
// so both must stay in step: same migration rules, same defaults, same validation.
import {
  checkSite, defaultsFor, fieldsChanged, isTranslatable, releaseData, SITE_BUDGET, validate,
  type Field, type Fields, type Json, type Locale, type Migration, type MigrationDescriptor, type Schema, type SiteInput,
} from '../core/index.ts'
import { type Candidate, isObject, type ReleaseState, type Write } from './model.ts'
import { english } from './report.ts'

// The platform also counts translation prints, so it stays the authority on the exact size.
const BUDGET = SITE_BUDGET

const byteSize = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength

/**
 * Builds the release candidate from the stored state and the local config. Runs every migration
 * that the platform has not applied yet over every entry of its brick, deleted ones too.
 * Writes are merged: one write per entry, holding all target fields of the new migrations.
 * `schema` is the platform schema of `site` (without file bricks, CONTENT.md); `plan()` passes the one it built.
 */
export async function buildCandidate(state: ReleaseState, site: SiteInput, schema: Schema): Promise<Candidate> {
  const problems = checkSite(site, schema)
  const applied = new Set([...state.schema.migrations, ...state.migrations].map((m) => m.id))
  const fresh = schema.migrations.filter((m) => !applied.has(m.id))

  const writes = new Map<string, Record<string, Json>>()
  const targets = new Map<string, string>()
  for (const descriptor of fresh) {
    const target = `${descriptor.brick}.${descriptor.fills}`
    const other = targets.get(target)
    if (other !== undefined) {
      problems.push(`Migrations “${other}” and “${descriptor.id}” both fill “${target}”. Remove one of them.`)
      continue
    }
    targets.set(target, descriptor.id)
    const field = schema.bricks[descriptor.brick]?.fields[descriptor.fills]
    const migration = Object.hasOwn(site.migrations ?? {}, descriptor.id) ? site.migrations?.[descriptor.id] : undefined
    if (!field || !migration) {
      problems.push(`Migration “${descriptor.id}” has no target field “${target}”.`)
      continue
    }
    if (field.type === 'slug') {
      problems.push(`Migration “${descriptor.id}” cannot set an address (slug).`)
      continue
    }
    for (const entry of state.entries) {
      if (entry.brick !== descriptor.brick) continue
      let value: Json
      try {
        value = migrate(migration, descriptor, field, schema, entry.data)
      } catch (error) {
        problems.push(`Migration “${descriptor.id}” fails for entry ${entry.id}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      writes.set(entry.id, { ...writes.get(entry.id), [descriptor.fills]: value })
    }
  }

  const changed: Candidate['changed'] = []
  const created: Candidate['created'] = []
  const checked: { id: string; brick: string; data: Record<string, Json> }[] = []
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (!Object.hasOwn(state.schema.bricks, key)) {
      if (brick.kind === 'single') created.push({ brick: key, data: defaultsFor(brick.fields) })
      continue
    }
    const all = fieldsChanged(state.schema, schema, key)
    for (const entry of state.entries) {
      if (entry.brick !== key) continue
      const next = releaseData(state.schema.bricks[key]!.fields, brick.fields, entry.data, writes.get(entry.id) ?? {})
      if (next.roots.length) changed.push({ id: entry.id, brick: key, data: next.data })
      if (next.roots.length || all) checked.push({ id: entry.id, brick: key, data: next.data })
    }
  }

  // Every entry of a brick whose fields changed is checked, not only the written ones (break-it 9).
  for (const entry of checked) {
    for (const issue of (await validate(schema, entry.brick, entry.data, { mode: 'release' })).errors) {
      problems.push(`Entry ${entry.id} (${entry.brick}), ${issue.path || 'entry'}: ${english(issue)}`)
    }
  }
  for (const single of created) {
    for (const issue of (await validate(schema, single.brick, single.data, { mode: 'release' })).errors) {
      problems.push(`The new single brick “${single.brick}”, ${issue.path || 'entry'}: ${english(issue)}`)
    }
  }

  const changedData = new Map(changed.map((c) => [c.id, c.data]))
  const bytes = { site: 0, largest: 0 }
  const count = (size: number, label: string) => {
    bytes.site += size
    bytes.largest = Math.max(bytes.largest, size)
    if (size > BUDGET.entryBytes) problems.push(`${label} is too large (at most 256 KiB).`)
  }
  for (const entry of state.entries) count(byteSize(changedData.get(entry.id) ?? entry.data), `Entry ${entry.id} (${entry.brick})`)
  for (const single of created) count(byteSize(single.data), `The new single brick “${single.brick}”`)
  if (bytes.site > BUDGET.siteBytes) problems.push('The site has reached its storage budget (4 MiB).')

  // The limit counts live entries only, plus the singles this release creates (the platform checks the same in sites.release).
  const liveEntries = state.entries.filter((entry) => entry.deletedAt === null).length
  if (liveEntries + created.length > BUDGET.entries) problems.push(`The site has reached its limit of ${BUDGET.entries} entries.`)

  return {
    schema,
    writes: [...writes].map(([entry, fields]): Write => ({ entry, fields })),
    changed,
    created,
    problems,
    bytes,
  }
}

/**
 * Runs one migration. A translatable target is called once per locale with the entry resolved
 * to that locale, and returns a Localized value; a locale without source stays empty. Any other
 * target is called once with the raw entry. A missing result is stored as null.
 */
function migrate(migration: Migration, descriptor: MigrationDescriptor, field: Field, schema: Schema, data: Record<string, Json>): Json {
  const mainLocale = schema.locales[0]!
  const fields = schema.bricks[descriptor.brick]!.fields
  if (!isTranslatable(field)) {
    return migration.compute(structuredClone(data), { locales: schema.locales, mainLocale }) ?? null
  }
  const out: Record<string, Json> = {}
  for (const locale of schema.locales) {
    const value = migration.compute(forLocale(fields, data, locale), { locales: schema.locales, mainLocale, locale })
    if (value !== undefined && value !== null) out[locale] = value
  }
  return out
}

/** The entry with its translatable values (top level and inside list rows) resolved to one locale. A missing locale is left out. */
function forLocale(fields: Fields, data: Record<string, Json>, locale: Locale): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [name, value] of Object.entries(data)) {
    const field = Object.hasOwn(fields, name) ? fields[name] : undefined
    if (field && isTranslatable(field)) {
      const picked = isObject(value) ? (value as Record<string, Json>)[locale] : undefined
      if (picked !== undefined) out[name] = picked
    } else if (field?.type === 'list' && Array.isArray(value)) {
      out[name] = value.map((row) => (isObject(row) ? forLocale(field.of, row as Record<string, Json>, locale) : row))
    } else {
      out[name] = value
    }
  }
  return out
}
