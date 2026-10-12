// Text the server stored or sent as a catalog message ({ key, params }) next to German text, in the reader's
// language. One path for history lines, approvals, "why not on the website" and errors: the server's catalog
// (namespace `server`, see modules/server-messages.ts), else core's (`issues.*`, `links.*`, …), else the stored
// German text (rows from before `msg`, an older server, a key this Studio does not know).
// No Nuxt here, so unit tests load it directly; `useTextOf` binds it to the Studio's translator.
import { coreMessage, labelOf } from '@lupinum/ginko'
import type { Params } from '@lupinum/ginko-i18n/core'

export interface StoredMsg {
  key: string
  params?: Record<string, unknown>
}

export interface TextEnv {
  /** Studio translator; a key it does not know comes back as itself. */
  t: (key: string, params?: Params, options?: { timeZone?: string }) => string
  /** The reader's language. */
  locale: string
  /** The site's zone: dates in the text are the site's, wherever the reader sits. */
  timeZone?: string
  /** The site's main language, where a label lacks the reader's. */
  main?: string
}

/** A value in `params`: text, a number (a date in ms), a label per locale or a nested message. */
type Param = string | number | Record<string, unknown>

const isMsg = (value: Param): value is { key: string; params?: Record<string, Param> } =>
  typeof value === 'object' && typeof value.key === 'string' && Object.keys(value).every((k) => k === 'key' || k === 'params')

function translate(msg: StoredMsg, env: TextEnv): string | undefined {
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries((msg.params ?? {}) as Record<string, Param>)) {
    if (typeof value === 'string' || typeof value === 'number') {
      params[name] = value
    } else if (isMsg(value)) {
      const nested = translate(value, env)
      if (nested === undefined) return undefined
      params[name] = nested
    } else {
      params[name] = labelOf(value as Record<string, string>, env.locale, env.main ?? env.locale)
    }
  }
  const full = `server.${msg.key}`
  const server = env.t(full, params, env.timeZone ? { timeZone: env.timeZone } : undefined)
  if (server !== full) return server
  try {
    const core = coreMessage(env.locale, msg.key, params)
    return core === msg.key ? undefined : core
  } catch {
    return undefined
  }
}

/** `msg` in the reader's language, else `fallback` (the German text stored or sent with it). */
export function textOf(msg: StoredMsg | null | undefined, fallback: string, env: TextEnv): string {
  return (msg ? translate(msg, env) : undefined) ?? fallback
}
