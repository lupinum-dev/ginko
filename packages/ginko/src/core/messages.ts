// Every text core shows to a person has a catalog key (`i18n/<code>.json`) and parameters next to the
// German sentence. German is the source and the fallback. The Studio and the server translate with
// `coreMessage(locale, key, params)`; the catalogs are exported as `coreCatalogs` for tools that merge them.
// The catalogs are compiled ahead of time (scripts/compile-messages.ts): no ICU parser at runtime.
import { defineCatalog, type KeysOf } from '@lupinum/ginko-i18n/core'
import de from '../../i18n/de.json' with { type: 'json' }
import en from '../../i18n/en.json' with { type: 'json' }
import es from '../../i18n/es.json' with { type: 'json' }
import fr from '../../i18n/fr.json' with { type: 'json' }
import it from '../../i18n/it.json' with { type: 'json' }
import ar from '../../i18n/ar.json' with { type: 'json' }
import { compiled } from './messages.compiled.ts'

export type CoreKey = KeysOf<typeof de>

/** A message: catalog key and parameters. A parameter may itself be a message (translated first). */
export interface Msg { key: string; params?: Record<string, string | number | Msg> }
/** A message with its German text: what issues carry (`message` stays German for agents, logs and the CLI). */
export interface Described extends Msg { message: string }

export const DEFAULT_LOCALE = 'de'
/** The raw catalogs by language, in the shape `@lupinum/ginko-i18n` reads. */
export const coreCatalogs = { de, en, es, fr, it, ar } as const

const catalog = defineCatalog<CoreKey>(compiled, { defaultLocale: DEFAULT_LOCALE })

const isMsg = (value: unknown): value is Msg => typeof value === 'object' && value !== null && typeof (value as Msg).key === 'string'

/** The text of a message in `locale`. An unknown language gets German; a key missing there falls back to German. */
export function coreMessage(locale: string | undefined, key: string, params?: Msg['params']): string {
  const flat = params && Object.fromEntries(Object.entries(params).map(([name, value]) => [name, isMsg(value) ? coreMessage(locale, value.key, value.params) : value]))
  return catalog.translator(locale).t(key, flat)
}

/** A message with its German text, for issues and problems. */
export function msg(key: CoreKey, params?: Msg['params']): Described {
  return { key, ...(params === undefined ? {} : { params }), message: coreMessage(DEFAULT_LOCALE, key, params) }
}

/** The message without its German text, to nest it in the parameters of another one. */
export function bare(m: Msg): Msg {
  return { key: m.key, ...(m.params === undefined ? {} : { params: m.params }) }
}

/** Names in the quotes of the language, joined by the word of the language: `„a“ oder „b“` / `“a” or “b”`, as a nested message. */
export function orList(items: readonly string[]): string | Msg {
  return joinNames(items, 'component.or')
}

/** The same with a comma: `„a“, „b“`. */
export function commaList(items: readonly string[]): string | Msg {
  return joinNames(items, 'component.and')
}

function joinNames(items: readonly string[], key: 'component.or' | 'component.and'): string | Msg {
  const quoted = items.map((name): Msg => ({ key: 'component.quoted', params: { name } }))
  return quoted.slice(1).reduce<string | Msg>((first, second) => ({ key, params: { first, second } }), quoted[0] ?? '')
}
