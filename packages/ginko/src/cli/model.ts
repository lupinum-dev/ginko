// Shared shapes of the CLI: what the platform's release state looks like, what the CLI sends
// back, and the error type that ends a command with an English message and a coded failure.
import type { Json, Schema } from '../core/index.ts'

/** GET /release/state (SPEC 5.1 step 2): the stored schema and the data of every entry, deleted ones too. */
export interface ReleaseState {
  site: string
  schema: Schema
  schemaRev: number
  contentRev: number
  migrations: { id: string; brick: string; fills: string; fingerprint: string; schemaRev: number }[]
  entries: { id: string; brick: string; data: Record<string, Json>; deletedAt: number | null }[]
}

/** One write of a migration result: the target values of one entry (SPEC 5.2 step 6). */
export interface Write {
  entry: string
  fields: Record<string, Json>
}

/** The candidate the CLI checks locally before it sends the release (SPEC 5.1 steps 3 and 4). */
export interface Candidate {
  schema: Schema
  writes: Write[]
  /** Existing entries whose data changes; validated in release mode. */
  changed: { id: string; brick: string; data: Record<string, Json> }[]
  /** New singles, created from their defaults. */
  created: { brick: string; data: Record<string, Json> }[]
  /** Messages in English. Empty when the candidate may be sent. */
  problems: string[]
  bytes: { site: number; largest: number }
}

/**
 * The `error.code` of a CLI failure that is not the platform's own answer. It decides the exit code (run.ts):
 * INVALID 1 (fix the config, schema or content), USAGE 2 (fix the call or the environment),
 * UNAVAILABLE 3 (platform unreachable or the outcome unknown: running the same commit again is safe), FORBIDDEN 4.
 */
export type CliCode = 'INVALID' | 'USAGE' | 'UNAVAILABLE' | 'FORBIDDEN'

/** A command that stops here. The message is shown as it is. */
export class CliError extends Error {
  readonly code: CliCode

  constructor(message: string, code: CliCode = 'INVALID') {
    super(message)
    this.code = code
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Checks the shape of the state JSON from the platform. The schema is trusted once its parts exist. A bad answer is
 * UNAVAILABLE, not INVALID: the site's code is not at fault, the platform (or what answers at GINKO_PLATFORM) is.
 */
export function parseReleaseState(value: unknown): ReleaseState {
  if (!isObject(value)) throw new CliError('The platform did not return a valid state.', 'UNAVAILABLE')
  const { site, schema, schemaRev, contentRev, migrations, entries } = value
  const valid = typeof site === 'string'
    && isObject(schema) && isObject(schema.bricks) && Array.isArray(schema.migrations) && isObject(schema.retired)
    && typeof schemaRev === 'number' && typeof contentRev === 'number'
    && Array.isArray(migrations) && Array.isArray(entries)
    && entries.every((e) => isObject(e) && typeof e.id === 'string' && typeof e.brick === 'string' && isObject(e.data))
  if (!valid) throw new CliError('The platform returned an incomplete state.', 'UNAVAILABLE')
  return value as unknown as ReleaseState
}

/** One file of an export: its upload ID in the exported site, name, type of the exported bytes and size. */
export interface ExportFileInfo {
  id: string
  name: string
  mime: string
  size: number
  width?: number
  height?: number
  /** Library state (SPEC 12). Absent in older exports: the ID of the file's folder in `folders`, kept, focus point, hash. */
  folder?: string
  kept?: boolean
  focus?: { x: number; y: number }
  sha256?: string
  /** The bytes are the original file (`local:files-export`), not a processed copy: the import runs them through the upload pipeline. */
  original?: true
  /** The description written in the Files library, per language. Absent in older exports. */
  alt?: Record<string, string>
}

/** A folder of the asset library; `parent` is another folder's `id`. */
export interface ExportFolder {
  id: string
  name: string
  parent?: string
}

export interface ExportEntry {
  id: string
  brick: string
  kind: 'single' | 'item'
  order: number
  data: Record<string, Json>
  prints: Record<string, Record<string, string>>
  rev: number
  deletedAt?: number
}

/** GET /export (SPEC 9, 12): the site with every entry (deleted ones too) and a signed URL per file. */
export interface ExportAnswer {
  format: 1
  site: string
  name: string
  schema: Schema
  schemaRev: number
  contentRev: number
  exportedAt: string
  entries: ExportEntry[]
  /** Absent in older exports. */
  folders?: ExportFolder[]
  files: (ExportFileInfo & { url: string })[]
}

/** `<dir>/export.json`: the answer without the URLs; each file lies at `path` below the folder. */
export interface SiteExport extends Omit<ExportAnswer, 'files'> {
  files: (ExportFileInfo & { path: string })[]
}

/**
 * Checks the shape of an export. `locator` is the key that says where a file is: `url` (platform) or `path` (folder).
 * A bad platform answer is UNAVAILABLE (as in parseReleaseState); a bad local export.json is INVALID.
 */
export function parseExport(value: unknown, locator: 'url', problem: string): ExportAnswer
export function parseExport(value: unknown, locator: 'path', problem: string): SiteExport
export function parseExport(value: unknown, locator: 'url' | 'path', problem: string): ExportAnswer | SiteExport {
  const optionalNumber = (v: unknown) => v === undefined || typeof v === 'number'
  const optionalString = (v: unknown) => v === undefined || typeof v === 'string'
  const valid = isObject(value) && value.format === 1
    && typeof value.site === 'string' && typeof value.name === 'string' && typeof value.exportedAt === 'string'
    && isObject(value.schema) && isObject(value.schema.bricks)
    && typeof value.schemaRev === 'number' && typeof value.contentRev === 'number'
    && Array.isArray(value.entries) && value.entries.every((e) => isObject(e)
      && typeof e.id === 'string' && typeof e.brick === 'string' && (e.kind === 'single' || e.kind === 'item')
      && typeof e.order === 'number' && isObject(e.data) && isObject(e.prints) && typeof e.rev === 'number' && optionalNumber(e.deletedAt))
    && Array.isArray(value.files) && value.files.every((f) => isObject(f)
      && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.mime === 'string' && typeof f.size === 'number'
      && typeof f[locator] === 'string' && optionalNumber(f.width) && optionalNumber(f.height)
      && optionalString(f.folder) && optionalString(f.sha256) && (f.kept === undefined || typeof f.kept === 'boolean') && (f.original === undefined || f.original === true)
      && (f.alt === undefined || (isObject(f.alt) && Object.values(f.alt).every((text) => typeof text === 'string')))
      && (f.focus === undefined || (isObject(f.focus) && typeof f.focus.x === 'number' && typeof f.focus.y === 'number')))
    && (value.folders === undefined || (Array.isArray(value.folders) && value.folders.every((f) => isObject(f)
      && typeof f.id === 'string' && typeof f.name === 'string' && optionalString(f.parent))))
  if (!valid) throw new CliError(problem, locator === 'url' ? 'UNAVAILABLE' : 'INVALID')
  return value as unknown as ExportAnswer | SiteExport
}
