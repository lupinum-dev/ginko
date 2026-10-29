// @vitest-environment happy-dom
// The drafts list on Heute (TEMPLATES 7.2): whose drafts show, how many, in what order, and the step each row offers.
import { mount } from '@vue/test-utils'
import * as vue from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import TodayDrafts from '../app/components/TodayDrafts.vue'

const { computed, reactive } = vue
Object.entries({ computed, reactive, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('useToast', () => ({ show: () => {} }))
const ops = { publishEntry: vi.fn(async () => ({})), publishChanges: vi.fn(async () => ({})) }
vi.stubGlobal('useOps', () => ops)

const schema = serializeSchema(defineSite({
  site: 'blog', name: 'Blog', url: 'https://blog.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: { posts: collection({ label: 'Beiträge', max: 50, order: 'manual', fields: { title: f.text('Titel', { translate: false }) }, tasks: [{ id: 'write', label: 'Beitrag schreiben', kind: 'create' }] }) },
}))
const brick = schema.bricks.posts as Extract<(typeof schema.bricks)[string], { kind: 'collection' }>
const [create] = brick.tasks!
const needsReview = { ...create!, needsApproval: true }

const HOUR = 3_600_000
const BASE = Date.parse('2026-10-14T07:00:00Z') // 09:00 in Vienna
const entry = (id: string, title: string, over: Record<string, unknown> = {}) =>
  ({ _id: id, brick: 'posts', kind: 'item', order: 1, rev: 1, lifeRev: 3, fieldRevs: {}, prints: {}, data: { title }, state: 'draft', since: BASE, ...over })

function mountDrafts(entries: unknown[], opts: { isManager?: boolean; tasks?: unknown[] } = {}) {
  return mount(TodayDrafts, {
    props: { slug: 'blog', brickKey: 'posts', brick, entries: entries as never, tasks: (opts.tasks ?? [create]) as never, isManager: opts.isManager ?? false, main: 'de', timeZone: 'Europe/Vienna' },
    global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
}
const titles = (wrapper: ReturnType<typeof mountDrafts>) => wrapper.findAll('li').map((li) => li.find('.font-medium').text())

describe('whose drafts show', () => {
  const all = [
    entry('a', 'Mein erster', { own: true, since: BASE }),
    entry('b', 'Von der Chefin', { since: BASE + HOUR }),
    entry('c', 'Mein zweiter', { own: true, since: BASE + 2 * HOUR }),
    entry('live', 'Online', { state: undefined, own: true, since: undefined }),
    entry('gone', 'Gelöscht', { own: true, deleted: true, since: BASE + 3 * HOUR }),
  ]

  // Wrong behaviour caught: staff see drafts of colleagues (and the owner's), or live entries and removed ones appear as drafts.
  test.each([
    ['staff', false, ['Mein zweiter', 'Mein erster']],
    ['an owner or admin', true, ['Mein zweiter', 'Von der Chefin', 'Mein erster']],
  ])('%s: newest first', (_, isManager, expected) => {
    expect(titles(mountDrafts(all, { isManager }))).toEqual(expected)
  })

  // Wrong behaviour caught: eleven drafts make Heute a long page and hide the buttons below; or the link shows with nothing more to see.
  test.each([[5, false], [6, true], [12, true]])('%i drafts: five rows at most, "Alle Entwürfe in Inhalte" only when there are more (%s)', (count, link) => {
    const wrapper = mountDrafts(Array.from({ length: count }, (_, i) => entry(`d${i}`, `Entwurf ${i}`, { own: true, since: BASE + i * HOUR })), { isManager: false })
    expect(titles(wrapper)).toEqual(Array.from({ length: Math.min(count, 5) }, (_, i) => `Entwurf ${count - 1 - i}`))
    const anchor = wrapper.find('a[href="/s/blog/all/posts"]')
    expect(anchor.exists()).toBe(link)
    if (link) expect(anchor.text()).toBe('Alle Entwürfe in Inhalte')
  })

  test('nothing renders without a draft of the person', () => {
    expect(mountDrafts([entry('b', 'Von der Chefin')], { isManager: false }).find('[data-test="today-drafts"]').exists()).toBe(false)
  })
})

// Wrong behaviour caught: a scheduled draft says "Entwurf seit" and looks forgotten; the time is shown in the browser's zone.
test.each([
  ['a draft', {}, 'Entwurf seit Mi., 14. Okt., 09:00'],
  ['a scheduled draft', { publishAt: Date.parse('2026-10-17T15:30:00Z') }, 'Geht online Sa., 17. Okt., 17:30'],
])('%s reads "%s" in the site zone', (_, over, text) => {
  const wrapper = mountDrafts([entry('a', 'Beitrag', { own: true, ...over })])
  expect(wrapper.get('li').text()).toBe(`Beitrag${text}Veröffentlichen`)
})

describe('the step of a row', () => {
  // Wrong behaviour caught: staff whose task needs approval get "Veröffentlichen", or an owner is told to send for review.
  test.each([
    ['staff without approval', false, [create], 'Veröffentlichen'],
    ['staff with needsApproval', false, [needsReview], 'Zur Prüfung senden'],
    ['an owner whose task would need approval for staff', true, [needsReview], 'Veröffentlichen'],
  ])('%s: "%s"', async (_, isManager, tasks, label) => {
    ops.publishEntry.mockClear()
    const wrapper = mountDrafts([entry('a', 'Beitrag', { own: true })], { isManager, tasks })
    const button = wrapper.get('li button')
    expect(button.text()).toBe(label)
    await button.trigger('click')
    expect(ops.publishEntry).toHaveBeenCalledWith('a', 3, { task: 'posts.write', timeZone: 'Europe/Vienna', main: 'de' })
  })
})

// Wrong behaviour caught: a live page with saved, unpublished changes is forgotten (not listed), listed for staff who did
// not save it, or its button takes the page offline by the draft path instead of publishing the changes.
test('a live entry with unpublished changes is listed with its own line and publishes the changes', async () => {
  const changed = entry('p', 'Über uns', { state: undefined, since: undefined, rev: 7, pending: { since: BASE + HOUR, at: BASE + HOUR, fields: ['title'], own: true } })
  const other = entry('q', 'Kontakt', { state: undefined, since: undefined, pending: { since: BASE, at: BASE, fields: ['title'] } })
  expect(titles(mountDrafts([changed, other], { isManager: false }))).toEqual(['Über uns'])
  const wrapper = mountDrafts([changed, other], { isManager: true })
  expect(titles(wrapper)).toEqual(['Über uns', 'Kontakt'])
  expect(wrapper.get('li').text()).toBe('Über unsUnveröffentlichte Änderungen seit Mi., 14. Okt., 10:00Veröffentlichen')
  ops.publishEntry.mockClear()
  await wrapper.get('li button').trigger('click')
  expect(ops.publishChanges).toHaveBeenCalledWith('p', 3, 7, expect.anything())
  expect(ops.publishEntry).not.toHaveBeenCalled()
})
