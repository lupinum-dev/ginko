// @vitest-environment happy-dom
// Heute with status lines (UI.md 3, `status` on a brick): the line under each heading in the server's words, the brick's
// `describe` as a lede, the filled first button of a due section, and the managers' line about waiting proposals. The
// German catalogs are the real ones; Nuxt's auto-imports become globals, and Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { collection, defineSite, f, single } from '@lupinum/ginko'
import { serializeSchema, type StatusLine } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import QuickPage from '../app/pages/s/[site]/index.vue'

const { computed, defineComponent, h, nextTick, onMounted, reactive, ref, Suspense, watch, watchEffect } = vue
Object.entries({ computed, nextTick, onMounted, reactive, ref, watch, watchEffect, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const TODAY = '2026-10-15'
const schema = serializeSchema(defineSite({
  site: 'linde', name: 'Linde', url: 'https://linde.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: {
    events: collection({
      label: 'Veranstaltungen', describe: 'Was bei uns los ist', max: 20, order: 'manual',
      fields: { title: f.text('Titel'), image: f.image('Bild', { optional: true }) },
      tasks: [{ id: 'add', label: 'Veranstaltung hinzufügen', kind: 'create' }, { id: 'edit', label: 'Veranstaltung ändern', kind: 'edit', pick: true, fields: ['title'] }],
    }),
    hours: single({
      label: 'Öffnungszeiten',
      fields: { closedOn: f.date('Geschlossen am', { optional: true }), closedNote: f.text('Grund für die Gäste', { optional: true }) },
      tasks: [{ id: 'closedToday', label: 'Heute geschlossen', kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } }],
    }),
  },
}))

let states: { brick: string; line: StatusLine | null; due: boolean }[] = []
let manager = true
let toReview: number | undefined = 0
let hoursEntry: Record<string, unknown> = {}

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('navigateTo', () => {})
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('useOps', () => ({}))
vi.stubGlobal('useConvex', () => ({ query: async () => [] }))
vi.stubGlobal('useRoute', () => reactive({ path: '/s/linde', query: {} }))
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1' }) }))
vi.stubGlobal('useKeptEntry', () => ({ entry: computed(() => undefined), removed: ref(false) }))
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('linde'), schema: ref(schema), site: ref({ name: 'Linde' }), main: ref('de'), today: ref(TODAY),
  isManager: ref(manager), may: () => true, bricks: computed(() => Object.entries(schema.bricks)),
}))
vi.stubGlobal('useConvexQuery', (fn: unknown, args: unknown) => {
  const name = String(fn)
  const skipped = () => (typeof args === 'function' ? args() : args) === 'skip'
  if (name === 'sites.today') return { data: ref(states) }
  if (name === 'proposals.count') return { data: computed(() => (skipped() ? undefined : toReview)) }
  if (name === 'proposals.mine') return { data: ref({ open: [], rejected: [], notLive: [] }) }
  if (name === 'entries.ofBricks') return { data: ref([{ _id: 'h1', brick: 'hours', kind: 'single', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: hoursEntry }]) }
  return { data: computed(() => undefined) }
})

async function page() {
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
    global: { stubs: { TaskSheet: true, PickSheet: true, I18nT: { props: ['k'], template: '<span :data-k="k" />' }, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}
const section = (wrapper: Awaited<ReturnType<typeof page>>, key: string) => wrapper.get(`section[aria-labelledby="b-${key}"]`)

// Wrong behaviour caught: a status line says the wrong thing (wrong plural, raw date, field name instead of its label,
// the brick label lost for an untitled entry), or "<n> online" shows while the list is not folded.
test.each<[string, StatusLine, string | null]>([
  ['next', { kind: 'next', title: 'Lesung', date: '2026-10-20' }, 'Als Nächstes: Lesung · 20.10.2026'],
  ['next without a title', { kind: 'next', title: null, date: '2026-10-20' }, 'Als Nächstes: Veranstaltungen · 20.10.2026'],
  ['count with ends', { kind: 'count', ending: 2, online: 5 }, '2 enden in den nächsten 7 Tagen'],
  ['count with one end', { kind: 'count', ending: 1, online: 5 }, '1 endet in den nächsten 7 Tagen'],
  ['count without ends on an unfolded list', { kind: 'count', ending: 0, online: 5 }, null],
  ['missing', { kind: 'missing', count: 1, field: 'image' }, '1 Eintrag ohne Bild'],
  ['age', { kind: 'age', title: 'Lesung', date: '2026-09-20', weeks: 3 }, 'Neuester Eintrag: Lesung · vor 3 Wochen'],
  ['age this week', { kind: 'age', title: 'Lesung', date: '2026-10-13', weeks: 0 }, 'Neuester Eintrag: Lesung · diese Woche'],
  ['drafts', { kind: 'drafts', drafts: 2, scheduled: 1 }, '2 Entwürfe · 1 geplant'],
])('status line: %s', async (_name, line, text) => {
  states = [{ brick: 'events', line, due: false }]
  const wrapper = await page()
  const status = section(wrapper, 'events').find('[data-test="status"]')
  expect(status.exists() ? status.text() : null).toBe(text)
  wrapper.unmount()
})

// Wrong behaviour caught: `describe`, declared "shown in the Studio", is not shown, or wraps into a paragraph.
test('describe is the section\'s one-line lede under its heading', async () => {
  states = []
  const wrapper = await page()
  const lede = section(wrapper, 'events').get('[data-test="lede"]')
  expect(lede.text()).toBe('Was bei uns los ist')
  expect(lede.classes()).toEqual(expect.arrayContaining(['truncate', 'text-muted-foreground']))
  expect(section(wrapper, 'hours').find('[data-test="lede"]').exists()).toBe(false)
  wrapper.unmount()
})

// Wrong behaviour caught: every first button shouts (or none does), so the one section that needs doing is lost.
test.each([[true, 'default'], [false, 'secondary']])('a section due: %s fills its first button: %s', async (due, variant) => {
  states = [{ brick: 'events', line: { kind: 'missing', count: due ? 2 : 0, field: 'image' }, due }]
  const wrapper = await page()
  const buttons = section(wrapper, 'events').findAll('button[data-slot="button"]')
  expect(buttons.map((b) => b.attributes('data-variant'))).toEqual([variant, 'secondary'])
  expect(section(wrapper, 'hours').get('button[data-slot="button"]').attributes('data-variant')).toBe('secondary')
  wrapper.unmount()
})

// Wrong behaviour caught: staff see a line about proposals they cannot approve, or managers see "0 waiting".
test.each<[boolean, number | undefined, string | null]>([
  [true, 2, '2 Änderungen warten auf Freigabe · Prüfen'],
  [true, 1, '1 Änderung wartet auf Freigabe · Prüfen'],
  [true, 0, null],
  [false, 3, null],
])('manager %s with %s proposals: %s', async (isManager, count, text) => {
  manager = isManager
  toReview = count
  states = []
  const wrapper = await page()
  const line = wrapper.find('[data-test="to-review"]')
  expect(line.exists() ? line.text().replace(/\s+/g, ' ') : null).toBe(text)
  if (text) expect(line.get('a').attributes('href')).toBe('/s/linde/review')
  wrapper.unmount()
  manager = true
  toReview = 0
})

// Wrong behaviour caught: with "Heute geschlossen" set for today the page says it twice (flag sentence and hours line),
// or the hours line takes "Aufheben" with it.
test('the hours line replaces the today flag sentence and keeps Aufheben', async () => {
  states = [{ brick: 'hours', line: { kind: 'hours', today: { closed: true } }, due: false }]
  hoursEntry = { closedOn: TODAY, closedNote: 'Wasserrohrbruch' }
  const wrapper = await page()
  const hours = section(wrapper, 'hours')
  expect(hours.findAll('[data-test="status"]').map((x) => x.text())).toEqual(['Heute geschlossen'])
  expect(hours.find('[data-k="site.quick.todayDone"]').exists()).toBe(false)
  expect(hours.text()).toContain('„Wasserrohrbruch“')
  expect(hours.findAll('button').map((b) => b.text())).toContain('Aufheben')
  wrapper.unmount()
  // Without the flag the hours line stands under the heading.
  states = [{ brick: 'hours', line: { kind: 'hours', today: { ranges: [['11:30', '14:30'], ['17:30', '22:00']] } }, due: false }]
  hoursEntry = {}
  const open = await page()
  expect(section(open, 'hours').get('[data-test="status"]').text()).toBe('Heute geöffnet 11:30–14:30, 17:30–22:00')
  open.unmount()
})
