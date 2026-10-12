// Shared by the CLI routes (release, export): the push key `Authorization: Bearer ginko_<site>_<32>`
// names the site, only its SHA-256 is stored. Answers are JSON; errors carry `code` and an English message
// (the CLI prints it to a developer), plus `key`/`params` when the error came from the catalog.
import { sha256 } from '@lupinum/ginko/internal'
import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { t, type MessageKey } from '../lib/i18n'
import { SLUG_PATTERN } from '../lib/input'

export type Scope = 'release' | 'pull' | 'check' | 'export'

const TOKEN = new RegExp(`^ginko_${SLUG_PATTERN}_[a-z0-9]{32}$`)

/** HTTP status per error code. Codes outside SPEC 11 (UNAUTHORIZED, INTERNAL) are used here only. */
const STATUS: Record<string, number> = {
  INVALID: 400, SCHEMA_REJECTED: 400, MIGRATION_CHANGED: 400, MIGRATION_INCOMPLETE: 400,
  UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, SITE_NOT_FOUND: 404, CHANGED_SINCE: 409,
  TOO_LARGE: 413, RELEASE_TOO_LARGE: 413,
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

export function failure(code: string, message: string, details?: unknown): Response {
  return json(STATUS[code] ?? 500, { code: STATUS[code] ? code : 'INTERNAL', message, ...(details === undefined ? {} : { details }) })
}

/** Turns a thrown `fail(...)` (ConvexError with `{ code, message, details? }`) into the HTTP answer. */
export function errorResponse(error: unknown, fallback = 'The release failed. Please try again later.'): Response {
  const data = (error as { data?: unknown }).data
  if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
    const { code, message, key, params, details } = data as { code: string; message: string; key?: string; params?: Record<string, string | number>; details?: unknown }
    // `message` is the catalog's German default; the developer reads English.
    return failure(code, key ? t('en', key as MessageKey, params) : message, details)
  }
  return failure('INTERNAL', fallback)
}

/** Resolves the bearer key to its site and checks revocation and scope. Returns a response on failure. */
export async function authenticate(ctx: ActionCtx, request: Request, scopes: Scope[]) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!TOKEN.test(token)) return failure('UNAUTHORIZED', 'The key is missing or invalid.')
  const key = await ctx.runQuery(internal.release.pushKey, { hash: sha256(token) })
  if (!key || key.revokedAt !== null) return failure('UNAUTHORIZED', 'The key is missing or invalid.')
  if (!scopes.some((s) => key.scopes.includes(s))) return failure('FORBIDDEN', 'This key may not do that.')
  return key
}
