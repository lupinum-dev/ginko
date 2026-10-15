// @vitest-environment happy-dom
// Schnell ändern with a timed collection: each listed entry has its own "Entfernen". The German catalog is the
// real one; Nuxt's auto-imports become globals, and Convex and the writes are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import QuickPage from '../app/pages/s/[site]/index.vue'

const { computed, defineComponent, h, nextTick, reactive, ref, Suspense, watch, watchEffect } = vue
Object.entries({ computed, nextTick, reactive, ref, watch, watchEffect, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const schema = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: {
    notices: collection({
      label: 'Hinweise', max: 20, order: 'manual',
      fields: { text: f.text('Text'), until: f.date('Gilt bis', { optional: true }) },
      visible: { mode: 'until', field: 'until' },
      tasks: [{ id: 'remove', label: 'Hinweis entfernen', kind: 'remove' }],
    }),
  },
}))
const notice = (id: string, text: string) => ({ _id: id, brick: 'notices', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { text, until: '2026-10-20' } })

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('navigateTo', () => {})
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('restaurant'), schema: ref(schema), site: ref({ name: 'Restaurant' }), main: ref('de'), today: ref('2026-10-15'),
  isManager: ref(false), may: () => true, bricks: computed(() => Object.entries(schema.bricks)),
}))
vi.stubGlobal('useKeptEntry', () => ({ entry: ref(undefined), removed: ref(false) }))
vi.stubGlobal('useConvexQuery', (fn: unknown) => ({
  data: ref(String(fn) === 'entries.ofBricks' ? [notice('e1', 'Heute geschlossen'), notice('e2', 'Neue Karte')] : undefined),
}))
// No entry points at these: "Entfernen" removes at once.
vi.stubGlobal('useConvex', () => ({ query: async () => [] }))
// Each removal runs until the test lets it finish.
const finish = new Map<string, () => void>()
vi.stubGlobal('useOps', () => ({ removeEntry: (entry: string) => new Promise<boolean>((resolve) => finish.set(entry, () => resolve(true))) }))

// Wrong behaviour caught: removing one notice, then another, re-enabled the second's button when the first finished,
// so a second click sent its removal twice.
test('a row\'s "Entfernen" stays disabled while its removal runs, also when another row\'s finishes first', async () => {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
    global: { stubs: { TaskSheet: true, PickSheet: true, I18nT: true, NuxtLink: true } },
  })
  await flushPromises()
  const removeButton = (title: string) => wrapper.find(`button[aria-label="${title} entfernen"]`)
  await removeButton('Heute geschlossen').trigger('click')
  await flushPromises()
  await removeButton('Neue Karte').trigger('click')
  await flushPromises()
  finish.get('e1')!()
  await flushPromises()
  expect(removeButton('Heute geschlossen').attributes('disabled')).toBeUndefined()
  expect(removeButton('Neue Karte').attributes('disabled')).toBeDefined()
})
