// @vitest-environment happy-dom
// How full a site is: the band above every page, and "Jetzt löschen" in the trash. The German catalog is the real one; Nuxt's
// auto-imports become globals, Convex and the writes are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import RemovedList from '../app/components/RemovedList.vue'
import StorageNotice from '../app/components/StorageNotice.vue'

const text = () => document.body.textContent ?? ''
const button = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

beforeAll(() => {
  // reka-ui positions popups with these; happy-dom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.scrollIntoView ??= () => {}
  Object.entries({ computed, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
})
afterEach(() => { document.body.innerHTML = '' })

const trashed = (mayPurge: boolean) => ({
  items: [{ entry: 'e1', brick: 'dishes', brickLabel: 'Gerichte', label: 'Kürbissuppe', lifeRev: 3, deletedAt: 0, purgeAt: Date.UTC(2026, 10, 14), wasDraft: false, deletedBy: null, mayRestore: true, mayPurge }],
  total: 1, nextCursor: null,
})

// Wrong behaviour caught: "Jetzt löschen" deletes at the first click, sends a stale lifeRev, or shows for staff (the server refuses them).
test('an owner deletes a removed entry for good after one question; staff see no button for it', async () => {
  const purgeEntry = vi.fn(async () => true)
  vi.stubGlobal('useOps', () => ({ purgeEntry, restoreEntry: vi.fn() }))
  vi.stubGlobal('useConvexQuery', () => ({ data: ref(trashed(true)) }))
  mount(RemovedList, { props: { slug: 'restaurant', timeZone: 'Europe/Vienna' }, attachTo: document.body })

  button('Jetzt löschen')!.click()
  await flushPromises()
  expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('„Kürbissuppe“ endgültig löschen?')
  expect(text()).toContain('Du kannst den Eintrag danach nicht mehr wiederherstellen.')
  expect(purgeEntry).not.toHaveBeenCalled()
  button('Endgültig löschen')!.click()
  await flushPromises()
  expect(purgeEntry).toHaveBeenCalledWith('e1', 3, 'Kürbissuppe')

  document.body.innerHTML = ''
  vi.stubGlobal('useConvexQuery', () => ({ data: ref(trashed(false)) }))
  mount(RemovedList, { props: { slug: 'restaurant', timeZone: 'Europe/Vienna' }, attachTo: document.body })
  expect(button('Wiederherstellen')).toBeDefined()
  expect(button('Jetzt löschen')).toBeUndefined()
})

// Wrong behaviour caught: the site budget is found only when a save is refused, or the full band can be hidden while saves fail.
test('the storage band warns from 80 %, and once full it cannot be hidden', async () => {
  const MB = 1024 * 1024
  const notice = (bytes: number, entryCount = 10) => mount(StorageNotice, { props: { slug: 'restaurant', bytes, entryCount } })
  expect(notice(1 * MB).text()).toBe('')

  const near = notice(3.3 * MB)
  expect(near.text()).toBe('Speicher fast voll: 3,3 MB von 4 MB belegt. Platz schaffst du, indem du Einträge entfernst oder lange Texte kürzt. Entfernte Einträge zählen nicht mit.')
  await near.get('button[aria-label="Hinweis ausblenden"]').trigger('click')
  expect(near.text()).toBe('')

  // de-AT groups thousands with a space.
  const full = notice(4 * MB, 1640)
  expect(full.text()).toBe('Speicher voll: 4 MB von 4 MB belegt. Kürzere Texte lassen sich weiter speichern, neue Einträge nicht. 1 640 von 2 000 Einträgen angelegt. Platz schaffst du, indem du Einträge entfernst oder lange Texte kürzt. Entfernte Einträge zählen nicht mit.')
  expect(full.find('button').exists()).toBe(false)
})
