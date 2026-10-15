// @vitest-environment happy-dom
// Schnell ändern with a timed collection: each listed entry has its own "Entfernen". The German catalog is the
// real one; Nuxt's auto-imports become globals, and Convex and the writes are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import QuickPage from '../app/pages/s/[site]/index.vue'
import PickSheet from '../app/components/PickSheet.vue'
import { taskFields } from '../app/utils/content'

const { computed, defineComponent, h, nextTick, onMounted, reactive, ref, Suspense, watch, watchEffect } = vue
Object.entries({ computed, nextTick, onMounted, reactive, ref, watch, watchEffect, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

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
const notice = (id: string, text: string, until = '2026-10-20') => ({ _id: id, brick: 'notices', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { text, until } })
let listed = [notice('e1', 'Heute geschlossen'), notice('e2', 'Neue Karte')]

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
  data: ref(String(fn) === 'entries.ofBricks' ? listed : undefined),
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

const DAY = 86_400_000
// Wrong behaviour caught: a timed collection of 450 events listed every one, expired ones too: a page of 32,000 px; or
// past 50 expired entries the oldest showed and the rest could not be reached (volume-11); or focus fell to <body>
// when the button went away.
test.each([
  // current, expired, rows before / after "Abgelaufene anzeigen", area link before / after, first expired row shown
  [52, 2, 50, 52, true, true, 'Alt 0'],
  [30, 120, 30, 80, false, true, 'Alt 70'],
])('%i current and %i expired entries: %i rows, then %i', async (current, expiredCount, before, after, linkBefore, linkAfter, firstExpired) => {
  // The expired ones ended one day after another, the last on 2026-09-28 at most: "Alt 119" ended last.
  const ended = (i: number) => new Date(Date.UTC(2026, 5, 1) + i * DAY).toISOString().slice(0, 10)
  listed = [...Array.from({ length: current }, (_, i) => notice(`n${i}`, `Hinweis ${i}`)), ...Array.from({ length: expiredCount }, (_, i) => notice(`x${i}`, `Alt ${i}`, ended(i)))]
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
    attachTo: document.body,
    global: { stubs: { TaskSheet: true, PickSheet: true, I18nT: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  await flushPromises()
  const allIn = () => wrapper.find('a[href="/s/restaurant/all/notices"]')
  const titles = () => wrapper.findAll('li').map((li) => li.find('.font-medium').text())
  expect([titles().length, allIn().exists()]).toEqual([before, linkBefore])
  await wrapper.findAll('button').find((b) => b.text() === `Abgelaufene anzeigen (${expiredCount})`)!.trigger('click')
  expect([titles().length, allIn().exists() && allIn().text(), titles()[Math.min(current, 50)]]).toEqual([after, linkAfter && 'Alle in „Hinweise“ ansehen', firstExpired])
  expect(wrapper.findAll('button').some((b) => b.text().startsWith('Abgelaufene anzeigen'))).toBe(false)
  // These rows open nothing (no edit task, not a manager), so the list takes the focus.
  await nextTick()
  expect(document.activeElement).toBe(wrapper.get('ul').element)
  wrapper.unmount()
})

describe('a planned price (menu, `planned`)', () => {
  const dishes = serializeSchema(restaurant).bricks.menu!
  const task = (id: string) => dishes.tasks!.find((t) => t.id === id)!

  // Wrong behaviour caught: "Gericht hinzufügen" asks for a planned price before the dish exists, and "Preis ändern"
  // changes the price without showing the plan that replaces it on its date.
  test('"Gericht hinzufügen" shows no plan; "Preis ändern" shows the price with its plan', () => {
    expect(Object.keys(taskFields(dishes, task('add')))).toEqual(['category', 'name', 'description', 'price', 'allergens', 'veg'])
    expect(Object.keys(taskFields(dishes, task('price')))).toEqual(['price', 'nextPrice', 'priceFrom'])
  })

  // Wrong behaviour caught: from the day of a planned price on, the pick list of "Preis ändern" still showed the old
  // price, which the website no longer shows.
  test.each([
    ['the day before the plan', '2026-10-17', '21,90'],
    ['the day of the plan', '2026-10-18', '22,90'],
  ])('%s (%s): the pick list shows %s', async (_name, today, price) => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
    const schnitzel = { _id: 's1', brick: 'menu', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { category: 'mains', name: { de: 'Schnitzel' }, price: { amount: 2190 }, nextPrice: { amount: 2290 }, priceFrom: '2026-10-18' } }
    const wrapper = mount(PickSheet, { props: { brick: dishes, task: task('price'), entries: [schnitzel] as never, main: 'de', today } })
    expect(wrapper.get('li').text()).toContain(price)
    wrapper.unmount()
  })
})
