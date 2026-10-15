// @vitest-environment happy-dom
// How full a site is: the band above every page, and the trash ("Jetzt löschen", every removed entry reachable). The German
// catalog is the real one; Nuxt's auto-imports become globals, Convex and the writes are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { i18nLocale, useI18n } from '#imports'
import RemovedList from '../app/components/RemovedList.vue'
import StorageNotice from '../app/components/StorageNotice.vue'
import { ConvexError } from 'convex/values'
import { normalizeConvexError } from '@lupinum/better-convex-nuxt/errors'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'

const text = () => document.body.textContent ?? ''
const button = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

/** What entries.usedBy answers while the delete-for-good question is open. */
const usedBy = ref<unknown[]>([])

beforeAll(() => {
  // reka-ui positions popups with these; happy-dom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.scrollIntoView ??= () => {}
  Object.entries({ computed, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
  vi.stubGlobal('useConvexQuery', (_fn: unknown, args: () => unknown) => ({
    data: computed(() => (args() === 'skip' ? undefined : usedBy.value)), error: computed(() => undefined),
  }))
})
afterEach(() => { document.body.innerHTML = ''; usedBy.value = [] })

const removed = (mayPurge: boolean) => ({ entry: 'e1', brick: 'dishes', brickLabel: 'Gerichte', label: 'Kürbissuppe', lifeRev: 3, deletedAt: 0, purgeAt: Date.UTC(2026, 10, 14), wasDraft: false, deletedBy: null, mayRestore: true, mayPurge })

/** The trash's paginated query in this state; returns its `loadMore`. */
function trashQuery(state: { data?: unknown[]; status?: 'success' | 'error'; error?: unknown; canLoadMore?: boolean }) {
  const loadMore = vi.fn(async () => {})
  vi.stubGlobal('useConvexPaginatedQuery', () => ({
    data: computed(() => state.data), status: computed(() => state.status ?? 'success'), error: computed(() => state.error),
    canLoadMore: computed(() => state.canLoadMore ?? false), isLoadingMore: computed(() => false), loadMore,
  }))
  return loadMore
}

// Wrong behaviour caught: "Jetzt löschen" deletes at the first click, sends a stale lifeRev, or shows for staff (the server refuses them).
test('an owner deletes a removed entry for good after one question; staff see no button for it', async () => {
  const purgeEntry = vi.fn(async () => true)
  vi.stubGlobal('useOps', () => ({ purgeEntry, restoreEntry: vi.fn() }))
  trashQuery({ data: [removed(true)] })
  mount(RemovedList, { props: { slug: 'restaurant', schema: undefined }, attachTo: document.body })

  // A screen reader names the entry, not only "Jetzt löschen" once per row.
  expect(button('Jetzt löschen')!.getAttribute('aria-label')).toBe('Jetzt löschen: „Kürbissuppe“')
  button('Jetzt löschen')!.click()
  await flushPromises()
  expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('„Kürbissuppe“ endgültig löschen?')
  expect(text()).toContain('Du kannst den Eintrag danach nicht mehr wiederherstellen.')
  expect(purgeEntry).not.toHaveBeenCalled()
  button('Endgültig löschen')!.click()
  await flushPromises()
  expect(purgeEntry).toHaveBeenCalledWith('e1', 3, 'Kürbissuppe')

  document.body.innerHTML = ''
  trashQuery({ data: [removed(false)] })
  mount(RemovedList, { props: { slug: 'restaurant', schema: undefined }, attachTo: document.body })
  expect(button('Wiederherstellen')).toBeDefined()
  expect(button('Jetzt löschen')).toBeUndefined()
})

// Wrong behaviour caught: in an English Studio for a German site, each removed entry named its area in German
// ("Autoren") while the navigation beside it said "Authors".
test('a removed entry names its area in the language of the Studio', () => {
  vi.stubGlobal('useOps', () => ({ purgeEntry: vi.fn(), restoreEntry: vi.fn() }))
  trashQuery({ data: [removed(true)] })
  const schema = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: { dishes: collection({ label: { de: 'Gerichte', en: 'Dishes' }, fields: { title: f.text('Name') } }) },
  }))
  i18nLocale.value = 'en'
  try {
    mount(RemovedList, { props: { slug: 'restaurant', schema }, attachTo: document.body })
    expect(text()).toContain('Dishes ·')
  } finally {
    i18nLocale.value = 'de'
  }
})

// Wrong behaviour caught: "Jetzt löschen" deletes an author that posts still use without a word, and the posts keep a
// reference to an entry that no longer exists.
test('the delete-for-good question lists the entries that still use the entry', async () => {
  const purgeEntry = vi.fn(async () => true)
  vi.stubGlobal('useOps', () => ({ purgeEntry, restoreEntry: vi.fn() }))
  usedBy.value = [{ entry: 'p1', brick: 'posts', title: 'Herbstmenü', paths: ['author'], fieldLabels: [{ de: 'Autorin' }], locale: null, missingAlt: false, deleted: false, state: 'live' }]
  trashQuery({ data: [removed(true)] })
  const stubs = { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
  mount(RemovedList, { props: { slug: 'restaurant', schema: undefined }, global: { stubs }, attachTo: document.body })

  button('Jetzt löschen')!.click()
  await flushPromises()
  expect(text()).toContain('Diese Einträge verwenden ihn noch. Dort fehlt er danach auf der Website:')
  expect(document.body.querySelector('a[href="/s/restaurant/all/posts/p1"]')?.textContent).toBe('Herbstmenü')
  button('Endgültig löschen')!.click()
  await flushPromises()
  expect(purgeEntry).toHaveBeenCalledWith('e1', 3, 'Kürbissuppe')
})

// Wrong behaviour caught: removed entries past the first 50 cannot be reached, so they cannot be restored.
test('more removed entries load with Mehr anzeigen', () => {
  vi.stubGlobal('useOps', () => ({}))
  const loadMore = trashQuery({ data: [removed(true)], canLoadMore: true })
  mount(RemovedList, { props: { slug: 'restaurant', schema: undefined }, attachTo: document.body })
  button('Mehr anzeigen')!.click()
  expect(loadMore).toHaveBeenCalledWith(50)
})

// Wrong behaviour caught: a trash that failed to load looks like an empty one.
test('a failed trash load shows the error, not an empty trash', () => {
  vi.stubGlobal('useOps', () => ({}))
  trashQuery({ status: 'error', error: normalizeConvexError(new ConvexError({ code: 'FORBIDDEN', message: 'Kein Zugriff.' }), { functionName: 'entries:trash' }) })
  mount(RemovedList, { props: { slug: 'restaurant', schema: undefined }, attachTo: document.body })
  expect(document.body.querySelector('[role="alert"]')?.textContent).toBe('Kein Zugriff.')
  expect(text()).not.toContain('Der Papierkorb ist leer.')
})

// Wrong behaviour caught: the site budget is found only when a save is refused, or the full band can be hidden while saves fail.
test('the storage band warns from 80 %, and once full it cannot be hidden', async () => {
  const MB = 1024 * 1024
  const notice = (bytes: number, entryCount = 10) => mount(StorageNotice, { props: { slug: 'restaurant', bytes, entryCount, manager: true } })
  expect(notice(1 * MB).text()).toBe('')
  // One byte under the limit is not "4 MB von 4 MB" (volume-6).
  expect(notice(4 * MB - 1).text()).toBe('Speicher fast voll: 3,9 MB von 4 MB belegt. Platz schaffst du, indem du Einträge entfernst oder lange Texte kürzt. Entfernte Einträge zählen nicht mit.')

  const near = notice(3.3 * MB)
  expect(near.text()).toBe('Speicher fast voll: 3,3 MB von 4 MB belegt. Platz schaffst du, indem du Einträge entfernst oder lange Texte kürzt. Entfernte Einträge zählen nicht mit.')
  await near.get('button[aria-label="Hinweis ausblenden"]').trigger('click')
  expect(near.text()).toBe('')

  // de-AT groups thousands with a space.
  const full = notice(4 * MB, 1640)
  expect(full.text()).toBe('Speicher voll: 4 MB von 4 MB belegt. Du kannst Einträge weiter bearbeiten, solange sie nicht länger werden, aber keine neuen anlegen. 1 640 von 2 000 Einträgen angelegt. Platz schaffst du, indem du Einträge entfernst oder lange Texte kürzt. Entfernte Einträge zählen nicht mit.')
  expect(full.find('button').exists()).toBe(false)
})

// Wrong behaviour caught: with only the entry count high, the band asks to shorten texts, which frees no entries.
test('a band about the entry count alone asks only to remove entries', () => {
  const MB = 1024 * 1024
  const near = mount(StorageNotice, { props: { slug: 'restaurant', bytes: 1 * MB, entryCount: 1640, manager: true } })
  expect(near.text()).toBe('1 640 von 2 000 Einträgen angelegt. Platz schaffst du, indem du Einträge entfernst. Entfernte Einträge zählen nicht mit.')
  const full = mount(StorageNotice, { props: { slug: 'restaurant', bytes: 1 * MB, entryCount: 2000, manager: true } })
  expect(full.text()).toBe('2 000 von 2 000 Einträgen angelegt. Neue Einträge kannst du nicht mehr anlegen. Platz schaffst du, indem du Einträge entfernst. Entfernte Einträge zählen nicht mit.')
})

// Wrong behaviour caught: a full entry count with storage only near began with "Speicher fast voll", hiding the limit
// that blocks new entries (volume-7).
test('the band names the limit that is reached first', () => {
  const MB = 1024 * 1024
  const band = mount(StorageNotice, { props: { slug: 'restaurant', bytes: 3.8 * MB, entryCount: 2000, manager: true } })
  expect(band.text()).toBe('2 000 von 2 000 Einträgen angelegt. Neue Einträge kannst du nicht mehr anlegen. Speicher fast voll: 3,8 MB von 4 MB belegt. Platz schaffst du, indem du Einträge entfernst oder lange Texte kürzt. Entfernte Einträge zählen nicht mit.')
})

// Wrong behaviour caught: an editor hides the warning that only an owner or admin is meant to dismiss.
test('only an owner or admin can hide the storage warning', () => {
  const near = mount(StorageNotice, { props: { slug: 'restaurant', bytes: 3.3 * 1024 * 1024, entryCount: 10, manager: false } })
  expect(near.text()).toContain('Speicher fast voll')
  expect(near.find('button').exists()).toBe(false)
})
