// "Update website now" (UI.md 10.6): asks the site to re-render now instead of in about a minute.
// Owner and admin only (the server checks). One call at a time; the result is honest: done, or what failed.
import { api } from '#convex/api'
import { useConvexAction, useI18n } from '#imports'
import { ref } from 'vue'
import { opErrorOf } from './useOps'
import { useToast } from './useToast'

export function useUpdateSite(site: () => string) {
  const { t } = useI18n()
  const { show } = useToast()
  const refresh = useConvexAction(api.refresh.urgentRefresh)
  const running = ref(false)

  async function run() {
    if (running.value) return
    running.value = true
    try {
      const result = await refresh.run({ site: site(), opId: crypto.randomUUID() }) as { results?: { ok: boolean }[] } | null
      const failed = (result?.results ?? []).filter((row) => !row.ok).length
      if (failed) show(`${t('basics.update.pagesFailed', { count: failed })} ${t('basics.update.fallback')}`, { tone: 'err' })
      else show(t('basics.update.done'))
    } catch (error) {
      show(`${opErrorOf(error).message} ${t('basics.update.fallback')}`, { tone: 'err' })
    } finally {
      running.value = false
    }
  }
  return { run, running }
}
