// The upload adapter of the editor package (@lupinum/ginko-editor) for this platform: the Convex
// queries uploads.get / uploads.urls for live state and URLs, and useUpload for sending a file.
import { api } from '#convex/api'
import type { GinkoAssets } from '@lupinum/ginko-editor'

export function useConvexGinkoAssets(site: Ref<string>): GinkoAssets {
  // Composables must be called in setup, so both senders are created here, not per upload.
  const send = { image: useUpload('image'), file: useUpload('file') }
  return {
    state(id) {
      const query = useConvexQuery(api.uploads.get, () => (id.value ? { site: site.value, upload: id.value } : 'skip'))
      return computed(() => {
        const row = query.data.value
        return row ? { status: row.status, error: row.error ?? undefined } : undefined
      })
    },
    details(ids) {
      const query = useConvexQuery(api.uploads.urls, () => (ids.value.length ? { site: site.value, ids: ids.value } : 'skip'))
      return computed(() => query.data.value)
    },
    upload: (kind, file, signal) => send[kind](site.value, file, signal),
  }
}
