// The Studio's language. Source of truth: the person's account setting (`api.account.settings`), kept on
// the server so the next sign-in, another device and the mails agree. Without a setting the zone default
// stays (cookie, then Accept-Language, then English; see ginko-i18n "Apps and SaaS"). That shown language is noted
// as `seenLocale` (not a choice), so mails (sign-in codes, reminders) come in the language the person reads.
import { api } from '#convex/api'

/** Call once (app.vue): when the signed-in person's setting is known and differs from the shown language, switch to it. */
export function useAccountLocale() {
  const { locale, locales, switchLocale } = useI18n()
  const { status } = useConvexAuth()
  const { mutate: noteSeen } = useConvexMutation(api.account.sawLocale)
  const { data: settings } = useConvexQuery(api.account.settings, () => (status.value === 'authenticated' ? {} : 'skip'))
  // Watching the setting (not the shown language) means a person who just picked another language is not switched back.
  // Only after mount: switching while the page hydrates makes server and client text differ. The switch
  // writes the cookie, so the next server render already uses the account's language.
  onMounted(() => watch(() => settings.value?.locale, (setting) => {
    // null: loaded, never chosen. The server ignores a language it has no mail catalog for.
    if (setting === null) void noteSeen({ locale: locale.value }).catch(() => undefined)
    else if (setting && setting !== locale.value && locales.some((l) => l.code === setting)) void switchLocale(setting)
  }, { immediate: true }))
}

/** Languages offered as beta: a native speaker has not checked the translation yet. */
export const BETA_LOCALES = new Set(['es'])

/** The name in the language picker; a beta language says so. */
export const localeLabel = (locale: { code: string; name?: string }) =>
  BETA_LOCALES.has(locale.code) ? `${locale.name} (beta)` : (locale.name ?? locale.code)

/** The language picker: shows the choice at once, then saves it on the account. */
export function useLocalePicker() {
  const { locale, locales, switchLocale } = useI18n()
  const { mutate: store } = useConvexMutation(api.account.setLocale)
  async function pick(code: string) {
    if (code === locale.value) return
    await switchLocale(code)
    await store({ locale: code })
  }
  return { locale, locales, pick }
}
