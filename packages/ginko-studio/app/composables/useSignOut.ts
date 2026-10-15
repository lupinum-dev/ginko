// Signing out (the account menu, "Meine Seiten", the invite page): one flow for every button.
import { useI18n } from '#imports'
import { forgetLocalDrafts, localDraftKeys } from './useLocalDraft'

export function useSignOut() {
  const { client, user } = useConvexAuth()
  const { t } = useI18n()
  const busy = ref(false)

  /**
   * Signs out of this browser and deletes the person's unsaved input kept here, so it does not stay behind on a shared
   * computer. That input may belong to a form still open in another tab, so it goes only after a yes (window.confirm,
   * like the form's own leave question). A session that ended elsewhere (revoked, expired) keeps it for the next sign-in.
   */
  async function signOut() {
    const id = user.value?.id
    if (id && localDraftKeys(id).length > 0 && !window.confirm(t('nav.signOutDrafts'))) return
    busy.value = true
    try {
      await client.signOut()
      if (id) forgetLocalDrafts(id)
      await navigateTo('/login')
    } finally {
      busy.value = false
    }
  }

  return { busy, signOut }
}
