// The Convex side of the file library (UI.md 10.3): every query and mutation of `files.*` the Finder
// needs, behind one object. The Finder components talk to this and never to Convex, so tests replace
// this one module. `site` is the slug of the open site route.
import { api } from '#convex/api'
import type { FunctionReturnType } from 'convex/server'
import { computed, ref, watch, type Ref } from 'vue'
import { opErrorOf } from './useOps'
import { useUpload } from './useUpload'

export type LibFile = FunctionReturnType<typeof api.files.list>['files'][number]
export type FileInfo = FunctionReturnType<typeof api.files.info>
export type UsedIn = FileInfo['usedIn'][number]
export type Folder = FunctionReturnType<typeof api.files.folders>[number]
export type ListView = 'all' | 'recent' | 'unused' | 'missingAlt' | 'duplicates' | 'trash'
/** `folder`: absent for every folder, null for the top level, an id for one folder. */
export interface ListQuery { view: ListView; folder?: string | null; search?: string }

export interface FileListState {
  files: Ref<LibFile[]>
  /** The first page has not arrived yet. */
  pending: Ref<boolean>
  hasMore: Ref<boolean>
  more: () => Promise<void>
}

export interface FilesLibrary {
  slug: Ref<string>
  /** Owner and admin change the library; staff only reads and uploads (files.ts). */
  canManage: Ref<boolean>
  folders: Ref<Folder[]>
  /** Files a live entry shows without alt text (`files.counts`, the sidebar badge); `null` while loading. */
  missingAlt: Ref<number | null>
  list: (query: () => ListQuery) => FileListState
  info: (file: () => string | null) => Ref<FileInfo | null | undefined>
  /** Where files are used, for the remove rule: one entry per file. */
  usage: (files: string[]) => Promise<{ id: string; name: string; usedIn: UsedIn[] }[]>
  /** Sends one file; resolves with its id once the server has processed it. */
  upload: (file: File, target?: { folder?: string | null }) => Promise<string>
  createFolder: (name: string, parent: string | null) => Promise<void>
  renameFolder: (folder: string, name: string) => Promise<void>
  deleteFolder: (folder: string) => Promise<void>
  move: (files: string[], folder: string | null) => Promise<void>
  rename: (file: string, name: string) => Promise<void>
  setFocus: (file: string, focus: { x: number; y: number }) => Promise<void>
  trash: (files: string[]) => Promise<{ trashed: string[]; refused: { file: string; name: string; usedIn: UsedIn[] }[] }>
  restore: (files: string[]) => Promise<void>
  /** Puts `source` (a ready upload) in the place of `file`. */
  replace: (file: string, source: File) => Promise<void>
  /** Writes the library description of a photo. The server allows owner and admin only; the panel offers it when `canManage` (like the focus point) and shows the text read-only otherwise. */
  setAlt?: (file: string, locale: string, text: string) => Promise<void>
  /** The text of a failed call in the Studio's language. */
  errorText: (error: unknown) => string
}

const key = (query: ListQuery) => `${query.view}|${query.folder === undefined ? '*' : query.folder ?? ''}|${query.search?.trim() ?? ''}`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function useFilesLibrary(): FilesLibrary {
  const route = useRoute()
  const slug = computed(() => String(route.params.site))
  const convex = useConvex()
  const sendImage = useUpload('image')
  const sendFile = useUpload('file')

  const site = useConvexQuery(api.sites.get, () => ({ site: slug.value }))
  const canManage = computed(() => site.data.value?.role === 'owner' || site.data.value?.role === 'admin')

  const folderQuery = useConvexQuery(api.files.folders, () => ({ site: slug.value }))
  const folders = computed(() => folderQuery.data.value ?? [])

  const counts = useConvexQuery(api.files.counts, () => ({ site: slug.value }))
  const missingAlt = computed(() => counts.data.value?.missingAlt ?? null)

  function list(query: () => ListQuery): FileListState {
    const args = () => {
      const q = query()
      return { site: slug.value, view: q.view, ...(q.folder !== undefined ? { folder: q.folder } : {}), ...(q.search?.trim() ? { search: q.search.trim() } : {}) }
    }
    const first = useConvexQuery(api.files.list, args)
    // Later pages are read once: the first page is the live one (uploads turning ready, files moved).
    const extra = ref<LibFile[]>([])
    const next = ref<{ done: boolean; cursor: string | null } | null>(null)
    watch(() => key(query()), () => { extra.value = []; next.value = null })
    const files = computed(() => {
      const seen = new Set((first.data.value?.files ?? []).map((f) => f.id))
      return [...(first.data.value?.files ?? []), ...extra.value.filter((f) => !seen.has(f.id))]
    })
    const hasMore = computed(() => (next.value ? !next.value.done : first.data.value ? !first.data.value.isDone : false))
    async function more() {
      const cursor = next.value ? next.value.cursor : first.data.value?.cursor
      if (!hasMore.value || cursor === undefined || cursor === null) return
      const page = await convex.query(api.files.list, { ...args(), cursor })
      extra.value = [...extra.value, ...page.files]
      next.value = { done: page.isDone, cursor: page.cursor }
    }
    return { files, pending: computed(() => first.data.value === undefined), hasMore, more }
  }

  function info(file: () => string | null) {
    const query = useConvexQuery(api.files.info, () => { const id = file(); return id ? { site: slug.value, file: id } : 'skip' })
    return computed(() => query.data.value ?? (query.error?.value ? null : undefined))
  }

  async function usage(ids: string[]) {
    const rows = await Promise.all(ids.map((id) => convex.query(api.files.info, { site: slug.value, file: id })))
    return rows.map((r) => ({ id: r.id as string, name: r.name, usedIn: r.usedIn }))
  }

  async function sendAndWait(file: File, target?: { folder?: string | null }) {
    const send = file.type === 'application/pdf' ? sendFile : sendImage
    const folder = target?.folder ?? undefined
    const id = await send(slug.value, file, undefined, { library: true, ...(folder ? { folder } : {}) })
    // A file counts when the server has checked it; a failed one reports its reason.
    for (let i = 0; i < 120; i++) {
      const state = await convex.query(api.uploads.get, { site: slug.value, upload: id })
      if (state.status === 'ready') return id
      if (state.status === 'failed') throw new Error(state.error ?? 'failed')
      await sleep(500)
    }
    return id
  }

  const mutations = {
    createFolder: useConvexMutation(api.files.createFolder),
    renameFolder: useConvexMutation(api.files.renameFolder),
    deleteFolder: useConvexMutation(api.files.deleteFolder),
    move: useConvexMutation(api.files.move),
    rename: useConvexMutation(api.files.rename),
    setFocus: useConvexMutation(api.files.setFocus),
    setAlt: useConvexMutation(api.files.setAlt),
    trash: useConvexMutation(api.files.trash),
    restore: useConvexMutation(api.files.restore),
    replace: useConvexMutation(api.files.replace),
  }
  const base = () => ({ site: slug.value })

  return {
    slug,
    canManage,
    folders,
    missingAlt,
    list,
    info,
    usage,
    upload: sendAndWait,
    createFolder: async (name, parent) => { await mutations.createFolder.mutate({ ...base(), name, parent }) },
    renameFolder: async (folder, name) => { await mutations.renameFolder.mutate({ ...base(), folder, name }) },
    deleteFolder: async (folder) => { await mutations.deleteFolder.mutate({ ...base(), folder }) },
    move: async (files, folder) => { await mutations.move.mutate({ ...base(), files, folder }) },
    rename: async (file, name) => { await mutations.rename.mutate({ ...base(), file, name }) },
    setFocus: async (file, focus) => { await mutations.setFocus.mutate({ ...base(), file, focus }) },
    setAlt: async (file, locale, text) => { await mutations.setAlt.mutate({ ...base(), file, locale, text }) },
    trash: (files) => mutations.trash.mutate({ ...base(), files }),
    restore: async (files) => { await mutations.restore.mutate({ ...base(), files }) },
    replace: async (file, source) => {
      const upload = await sendAndWait(source)
      await mutations.replace.mutate({ ...base(), file, upload })
    },
    errorText: (error) => (error instanceof Error && !('data' in error) && !('kind' in error) ? error.message : opErrorOf(error).message),
  }
}
