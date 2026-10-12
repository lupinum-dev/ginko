import type { Json } from '@lupinum/ginko'
import { ConvexError } from 'convex/values'
import { DEFAULT_LOCALE, t, type MessageKey } from './i18n'

export type ErrorCode =
  | 'FORBIDDEN' | 'NOT_FOUND' | 'CHANGED_SINCE' | 'OP_REUSED' | 'INVALID' | 'TOO_LARGE' | 'SLUG_TAKEN'
  | 'NOT_UNDOABLE' | 'SCHEMA_REJECTED' | 'MIGRATION_CHANGED' | 'MIGRATION_INCOMPLETE' | 'RELEASE_TOO_LARGE'
  | 'SITE_NOT_FOUND' | 'FORMAT_UNSUPPORTED' | 'STALE' | 'RATE_LIMITED' | 'UPLOAD_REJECTED'

/**
 * Every error has a code, a catalog `key` with its `params`, and `message` (the German text, for agents
 * and logs). The Studio translates `key` with `params` into the person's language (the catalogs are
 * shared); the server holds no per-request language, so nothing depends on how Convex reuses isolates.
 * `details` carries e.g. validation issues or the current state. Clients branch on `code`.
 */
/** Error parameters travel to clients as Convex values: text and numbers only (no `Date`). */
export type ErrorParams = Record<string, string | number>

export function fail(code: ErrorCode, key: MessageKey, params?: ErrorParams, details?: Json): never {
  throw new ConvexError({
    code,
    message: t(DEFAULT_LOCALE, key, params),
    key,
    ...(params === undefined ? {} : { params }),
    ...(details === undefined ? {} : { details }),
  })
}
