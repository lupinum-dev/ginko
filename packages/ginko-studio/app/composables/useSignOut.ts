// Signing out (the account menu, the account settings, the invite page): one flow for every button, and signing out the
// person's other devices (the account menu).
import { useI18n } from '#imports'
import { forgetLocalDrafts, localDraftKeys } from './useLocalDraft'

export function useSignOut() {
  const { client, user } = useConvexAuth()
  const { t } = useI18n()
  const { show } = useToast()
  const busy = ref(false)

  /**
   * Signs out of this browser and deletes the person's unsaved input kept here, so it does not stay behind on a shared
   * computer. That input may belong to a form still open in another tab, so it goes only after a yes (window.confirm,
   * like the form's own leave question). A session that ended elsewhere (revoked, expired) keeps it for the next sign-in.
   * A refused sign-out keeps the session, so it keeps the input too and stays on the page.
   */
  async function signOut() {
    const id = user.value?.id
    if (id && localDraftKeys(id).length > 0 && !window.confirm(t('nav.signOutDrafts'))) return
    busy.value = true
    try {
      // Better Auth answers a refusal with `error`; it does not throw.
      const result = await client.signOut()
      if (result.error) throw result.error
      if (id) forgetLocalDrafts(id)
      await navigateTo('/login')
    } catch (error) {
      console.error(error)
      show(t('nav.signOutFailed'), { tone: 'err' })
    } finally {
      busy.value = false
    }
  }

  /**
   * Ends every other session of this person (a lost laptop, a shared computer); this one stays. Their next call is refused
   * at once (currentUser reads the live session), and the layout shows them signed out. Nothing is lost, so no question:
   * the unsaved input on those devices waits for the next sign-in there. Not revokeSessions: that ends this one too.
   */
  async function signOutOthers() {
    busy.value = true
    try {
      // Better Auth answers a refusal with `error`; it does not throw.
      const result = await client.revokeOtherSessions()
      if (result.error) throw result.error
      show(t('nav.signedOutOthers'))
    } catch (error) {
      console.error(error)
      show(t('nav.signOutOthersFailed'), { tone: 'err' })
    } finally {
      busy.value = false
    }
  }

  return { busy, signOut, signOutOthers }
}
