// SPEC 5.1 steps 2–4 as one pure function: the local schema against the stored state. Used by
// `ginko release` (then sends it) and `ginko check` (then only reports it).
import { checkSchema, diffSchema, platformSchema, serializeSchema, type MigrationDescriptor, type Schema, type SchemaChange, type SiteInput } from '../core/index.ts'
import { buildCandidate } from './candidate.ts'
import type { Candidate, ReleaseState } from './model.ts'

export interface Plan {
  schema: Schema
  /** Allowed changes, for the report. */
  changes: SchemaChange[]
  /** Rejected changes. Non-empty: the release stops here and `candidate` is null. */
  rejected: SchemaChange[]
  candidate: Candidate | null
}

export async function plan(state: ReleaseState, site: SiteInput): Promise<Plan> {
  // File bricks (CONTENT.md) never reach the platform.
  const schema = platformSchema(serializeSchema(site))
  // A schema that is not well-formed gets no diff: diffSchema assumes valid input, and its answers
  // (e.g. a "removed" language for a doubled one) would hide the real problem, which the candidate reports.
  if (checkSchema(schema).length > 0) return { schema, changes: [], rejected: [], candidate: await buildCandidate(state, site) }
  // The ledger of applied migrations overrides the schema's copy, as in sites.release (SPEC 5.2 step 3).
  const known = new Map<string, MigrationDescriptor>()
  for (const m of [...state.schema.migrations, ...state.migrations]) {
    known.set(m.id, { id: m.id, brick: m.brick, fills: m.fills, fingerprint: m.fingerprint })
  }
  const { changes, rejected } = diffSchema({ ...state.schema, migrations: [...known.values()] }, schema)
  if (rejected.length > 0) return { schema, changes, rejected, candidate: null }
  return { schema, changes, rejected, candidate: await buildCandidate(state, site) }
}
