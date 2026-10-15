// The Convex side of the files library (useFilesLibrary) with Convex replaced: `files.list` pages answer when the
// test says so, and `uploads.get` reports what the server's check says. The German catalog is the real one.
import { computed, effectScope, nextTick, ref, toValue } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import type { FilesLibrary, ListView } from '../app/composables/useFilesLibrary'

vi.mock('../app/composables/useUpload', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  // The file is sent and registered as upload u1; the server's check is what the tests decide.
  useUpload: () => async () => 'u1',
}))

const file = (id: string) => ({ id })
/** Later pages of `files.list`, answered by the test; `uploads.get` answers, as the server's check runs. */
const pages: { resolve: (page: unknown) => void; reject: (error: unknown) => void }[] = []
const checks: ((state: { status: string; error: string | null }) => void)[] = []
vi.stubGlobal('useRoute', () => ({ params: { site: 'restaurant' } }))
vi.stubGlobal('useI18n', useI18n)
vi.stubGlobal('useConvexMutation', () => ({ mutate: async () => undefined }))
vi.stubGlobal('useConvexQuery', (fn: unknown, args: unknown) => ({
  data: computed(() => {
    const a = toValue(args) as { view?: string } | 'skip'
    return String(fn) === 'files.list' && a !== 'skip' ? { files: [file(`${a.view}-1`)], isDone: false, cursor: 'c1' } : undefined
  }),
  error: ref(undefined),
}))
vi.stubGlobal('useConvex', () => ({
  query: (fn: unknown) => String(fn) === 'uploads.get'
    ? Promise.resolve({ status: 'pending', error: null })
    : new Promise((resolve, reject) => pages.push({ resolve, reject })),
  onUpdate: (_fn: unknown, _args: unknown, callback: (state: { status: string; error: string | null }) => void) => {
    checks.push(callback)
    return () => {}
  },
}))

const { useFilesLibrary } = await import('../app/composables/useFilesLibrary')

function library() {
  let lib!: FilesLibrary
  effectScope().run(() => { lib = useFilesLibrary() })
  return lib
}

afterEach(() => {
  pages.length = 0
  checks.length = 0
  vi.useRealTimers()
})

describe('"Mehr anzeigen"', () => {
  // Wrong behaviour caught: a page of the last view arrives after a switch to Trash, so live files show in Trash
  // and selection actions work on them.
  test('a page asked for another view is dropped when it arrives', async () => {
    const view = ref<ListView>('all')
    const list = library().list(() => ({ view: view.value }))
    const asked = list.more()
    view.value = 'trash'
    await nextTick()
    pages[0]!.resolve({ files: [file('all-2')], isDone: true, cursor: null })
    await asked
    expect(list.files.value.map((f) => f.id)).toEqual(['trash-1'])
    expect(list.hasMore.value).toBe(true)
  })

  // Wrong behaviour caught: a failed page is an unhandled rejection, and the person sees nothing.
  test('a failed page keeps the files and says so', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const list = library().list(() => ({ view: 'all' }))
    const asked = list.more()
    pages[0]!.reject(new Error('[CONVEX Q(files:list)] Server Error'))
    await asked
    expect(list.moreError.value).toBe('Weitere Dateien ließen sich nicht laden.')
    expect(list.files.value.map((f) => f.id)).toEqual(['all-1'])
    logged.mockRestore()
  })
})
