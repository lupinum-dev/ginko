// `textOf` bound to the Studio's translator and language. Explicit imports, so unit tests can shim '#imports'.
import { useI18n } from '#imports'
import { textOf, type StoredMsg, type TextEnv } from '../utils/textOf'

/** Call in setup. `site` gives the site's zone and main language, for dates and labels inside the text. */
export function useTextOf(site?: () => { timeZone: string | undefined; main?: string }) {
  const { t, has, locale } = useI18n()
  const translator = t as TextEnv['t']
  const known = has as TextEnv['has']
  return (msg: StoredMsg | null | undefined, fallback: string) => {
    const where = site?.()
    // A site's text waits for its time zone while the model loads (D114): a time in another zone would be wrong.
    if (where && !where.timeZone) return ''
    return textOf(msg, fallback, { t: translator, has: known, locale: locale.value, ...where, ...(where?.timeZone ? { timeZone: where.timeZone } : {}) })
  }
}
