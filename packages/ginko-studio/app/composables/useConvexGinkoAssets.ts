// The upload adapter of the editor package (@lupinum/ginko-editor) for this platform: the Convex
// queries uploads.get / uploads.urls for live state and URLs, useUpload for sending a file, files.setFocus for the focus point.
import { api } from '#convex/api'
import type { GinkoAssets } from '@lupinum/ginko-editor'
import { useI18n } from '#imports'
import { useTextOf } from './useTextOf'

export function useConvexGinkoAssets(site: Ref<string>): GinkoAssets {
  // Composables must be called in setup, so both senders are created here, not per upload.
  const send = { image: useUpload('image'), file: useUpload('file') }
  const { t } = useI18n()
  const textOf = useTextOf()
  // Owner and admin change the library (files.setFocus), as in Files.
  const meta = useConvexQuery(api.sites.meta, () => ({ site: site.value }))
  const setFocus = useConvexMutation(api.files.setFocus)
  return {
    state(id) {
      const query = useConvexQuery(api.uploads.get, () => (id.value ? { site: site.value, upload: id.value } : 'skip'))
      return computed(() => {
        const row = query.data.value
        // `error` is the catalog key of the reason (uploads.get).
        return row ? { status: row.status, error: row.error ? textOf({ key: row.error }, t('ops.upload.failed')) : undefined } : undefined
      })
    },
    details(ids) {
      const query = useConvexQuery(api.uploads.urls, () => (ids.value.length ? { site: site.value, ids: ids.value } : 'skip'))
      return computed(() => query.data.value)
    },
    upload: (kind, file, signal) => send[kind](site.value, file, signal),
    focus: {
      allowed: computed(() => meta.data.value?.role === 'owner' || meta.data.value?.role === 'admin'),
      set: async (file, focus) => { await setFocus.mutate({ site: site.value, file, focus }) },
    },
  }
}
