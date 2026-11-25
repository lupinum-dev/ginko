// `textOf` bound to the Studio's translator and language. Explicit imports, so unit tests can shim '#imports'.
import { useI18n } from '#imports'
import { textOf, type StoredMsg, type TextEnv } from '../utils/textOf'
import { dayWords } from '../utils/when'

/** Call in setup. `site` gives the site's zone and main language, for dates and labels inside the text. */
export function useTextOf(site?: () => { timeZone: string | undefined; main?: string }) {
  const { t, has, locale, format } = useI18n()
  const translator = t as TextEnv['t']
  const known = has as TextEnv['has']
  return (msg: StoredMsg | null | undefined, fallback: string) => {
    const where = site?.()
    const env = { t: translator, has: known, locale: locale.value, day: (iso: string) => dayWords(iso, format), ...(where?.main ? { main: where.main } : {}) }
    if (!where || where.timeZone) return textOf(msg, fallback, { ...env, ...(where?.timeZone ? { timeZone: where.timeZone } : {}) })
    // While the model loads the site's zone is unknown (D114): a text that formats a time or a day waits for it, as a
    // time in another zone would be wrong; any other text shows at once. A text reads the same at both ends of the
    // clock (UTC-12 and UTC+14, 26 hours apart, so every day differs too) only when it has no time or day in it.
    const early = textOf(msg, fallback, { ...env, timeZone: 'Etc/GMT+12' })
    return early === textOf(msg, fallback, { ...env, timeZone: 'Pacific/Kiritimati' }) ? early : ''
  }
}
