// The text of a server error or a core issue in the Studio's language: both carry a catalog `key` with `params`
// next to a German `message` (for agents and logs), see textOf.
import type { Msg } from '@lupinum/ginko/internal'
import { useTextOf } from '../composables/useTextOf'

export interface Described {
  key?: string
  params?: Msg['params']
  /** The German text; shown when the key is unknown or missing (an older server, a transport error). */
  message?: string
}

/** `error` is a server error, an `OpError` or an issue. Call it where the Nuxt app is available (setup, handlers, render). */
export function messageOf(error: Described): string {
  const { key, params, message = '' } = error
  return useTextOf()(key ? { key, params: params as Record<string, unknown> | undefined } : null, message)
}
