// `textOf` bound to the Studio's translator and language. Explicit imports, so unit tests can shim '#imports'.
import { useI18n } from '#imports'
import { textOf, type StoredMsg, type TextEnv } from '../utils/textOf'

/** Call in setup. `site` gives the site's zone and main language, for dates and labels inside the text. */
export function useTextOf(site?: () => { timeZone: string; main?: string }) {
  const { t, has, locale } = useI18n()
  const translator = t as TextEnv['t']
  const known = has as TextEnv['has']
  return (msg: StoredMsg | null | undefined, fallback: string) => textOf(msg, fallback, { t: translator, has: known, locale: locale.value, ...site?.() })
}
