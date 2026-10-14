// @vitest-environment happy-dom
// Making room on a full site: "Jetzt löschen" in the trash. The German catalog is the real one; Nuxt's
// auto-imports become globals, Convex and the writes are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import RemovedList from '../app/components/RemovedList.vue'

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
