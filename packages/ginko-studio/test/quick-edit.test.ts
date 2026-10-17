// @vitest-environment happy-dom
// Schnell ändern with a timed collection: each listed entry has its own "Entfernen". The German catalog is the
// real one; Nuxt's auto-imports become globals, and Convex and the writes are replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { collection, defineSite, f, single } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import restaurant from '../../../sites/restaurant/ginko.config.ts'
import AllPage from '../app/pages/s/[site]/all/index.vue'
import QuickPage from '../app/pages/s/[site]/index.vue'
import PickSheet from '../app/components/PickSheet.vue'
import { localDraftKey, writeLocalDraft } from '../app/composables/useLocalDraft'
import { taskFields } from '../app/utils/content'

const { computed, defineComponent, h, nextTick, onMounted, reactive, ref, Suspense, watch, watchEffect } = vue
Object.entries({ computed, nextTick, onMounted, reactive, ref, watch, watchEffect, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))

const notices = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: {
    notices: collection({
      label: 'Hinweise', max: 20, order: 'manual',
      fields: { text: f.text('Text'), until: f.date('Gilt bis', { optional: true }) },
      visible: { mode: 'until', field: 'until' },
      tasks: [{ id: 'remove', label: 'Hinweis entfernen', kind: 'remove' }, { id: 'add', label: 'Hinweis hinzufügen', kind: 'create' }],
    }),
    hours: single({
      label: 'Öffnungszeiten',
      fields: { closedOn: f.date('Geschlossen am', { optional: true }), closedNote: f.text('Grund für die Gäste', { optional: true }) },
      tasks: [{ id: 'closedToday', label: 'Heute geschlossen', kind: 'edit', fields: ['closedOn', 'closedNote'], prefill: { closedOn: '@today' } }],
    }),
  },
}))
const notice = (id: string, text: string, until = '2026-10-20') => ({ _id: id, brick: 'notices', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { text, until } })
let listed: unknown[] = [notice('e1', 'Heute geschlossen'), notice('e2', 'Neue Karte')]
/** The site the page shows: the notices above, or the restaurant. */
let schema = notices

vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
const navigated: unknown[] = []
vi.stubGlobal('navigateTo', (to: unknown) => { navigated.push(to) })
vi.stubGlobal('useToast', () => ({ show: () => {} }))
let manager = false
vi.stubGlobal('useSiteData', async () => ({
  slug: ref('restaurant'), schema: ref(schema), site: ref({ name: 'Restaurant' }), main: ref('de'), today: ref('2026-10-15'),
  isManager: ref(manager), may: () => true, bricks: computed(() => Object.entries(schema.bricks)),
}))
/** The page's address: Verlauf and the rejection mail link here with ?task=&reopen=. */
const route = reactive({ path: '/s/restaurant', query: {} as Record<string, string> })
vi.stubGlobal('useRoute', () => route)
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1' }) }))
/** The person's own proposals (proposals.mine). */
let own: unknown = { open: [], rejected: [], notLive: [] }
vi.stubGlobal('useKeptEntry', (_id: unknown, live: () => unknown) => ({ entry: computed(live), removed: ref(false) }))
// The page's live reads: the listed entries, and the one entry a sheet opens on.
vi.stubGlobal('useConvexQuery', (fn: unknown, args: unknown) => ({
  data: String(fn) === 'entries.ofBricks' ? ref(listed) : String(fn) === 'proposals.mine' ? ref(own) : computed(() => {
    const a = typeof args === 'function' ? args() : args
    return String(fn) === 'entries.get' && a !== 'skip' ? listed.find((e) => (e as { _id: string })._id === (a as { entry: string }).entry) : undefined
  }),
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
  wrapper.unmount()
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

// Wrong behaviour caught: after a crash or reload the unsaved input waited on this device, but only the entry itself
// offered it, so people had to remember what they had been editing. Another person's or site's input must not show.
test('Heute lists this person\'s unsaved input on this site, newest first, and each row continues where it was typed', async () => {
  listed = []
  const now = Date.now()
  const draft = (site: string, user: string, target: string, minutesAgo: number, extra: { brick?: string; title?: string }) =>
    writeLocalDraft(localDraftKey(site, user, target), { v: 1, savedAt: now - minutesAgo * 60_000, baseRev: 1, locale: 'de', fields: { text: { de: 'x' } }, ...extra })
  draft('restaurant', 'u1', 'e7', 30, { brick: 'notices', title: 'Betriebsurlaub' })
  draft('restaurant', 'u1', 'task:notices.add', 5, { brick: 'notices' })
  draft('restaurant', 'u2', 'e8', 1, { brick: 'notices', title: 'Fremde Eingabe' })
  draft('andere-seite', 'u1', 'e9', 1, { brick: 'notices', title: 'Andere Website' })
  draft('restaurant', 'u1', 'e10', 15 * 24 * 60, { brick: 'notices', title: 'Zu alt' })
  try {
    const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
      global: { stubs: { TaskSheet: { name: 'TaskSheet', props: ['task', 'brickKey'], template: '<div />' }, PickSheet: true, I18nT: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    await flushPromises()
    const section = wrapper.get('section[aria-labelledby="local-drafts"]')
    expect(section.get('h2').text()).toBe('Noch nicht gespeichert')
    const rows = section.findAll('li')
    expect(rows.map((li) => li.find('span').text().replace(/ · .*/, ''))).toEqual(['Hinweise: Neuer Eintrag', '„Betriebsurlaub“'])
    expect(rows[1]!.get('a').attributes('href')).toBe('/s/restaurant/all/notices/e7')
    await rows[0]!.get('button').trigger('click')
    expect(wrapper.findComponent({ name: 'TaskSheet' }).props()).toMatchObject({ brickKey: 'notices', task: { id: 'add' } })
    wrapper.unmount()
  } finally {
    localStorage.clear()
  }
})

// Wrong behaviour caught: an owner or admin of a site without quick tasks is sent from Heute to Alles bearbeiten, so they
// never saw the unsaved input of the entries they edit there.
test('Alles bearbeiten lists the unsaved input too; input typed in a quick task\'s sheet stays on Heute', async () => {
  manager = true
  const draft = (target: string, extra: { brick?: string; title?: string }) =>
    writeLocalDraft(localDraftKey('restaurant', 'u1', target), { v: 1, savedAt: Date.now(), baseRev: 1, locale: 'de', fields: { text: { de: 'x' } }, ...extra })
  draft('e7', { brick: 'notices', title: 'Betriebsurlaub' })
  draft('task:notices.add', { brick: 'notices' })
  try {
    const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(AllPage) }) }), {
      global: { stubs: { AllShell: { template: '<div><slot /></div>' }, AllNav: true, RemovedList: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    await flushPromises()
    const rows = wrapper.get('section[aria-labelledby="local-drafts"]').findAll('li')
    expect(rows.map((li) => [li.find('span').text().replace(/ · .*/, ''), li.get('a').attributes('href')])).toEqual([['„Betriebsurlaub“', '/s/restaurant/all/notices/e7']])
    wrapper.unmount()
  } finally {
    localStorage.clear()
    manager = false
  }
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

describe('planning a week ahead (lunchPlans)', () => {
  const lunch = { _id: 'lunch1', brick: 'lunch', kind: 'single', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { weekOf: '2026-10-12', days: [] } }
  const plan = { _id: 'p19', brick: 'lunchPlans', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { weekOf: '2026-10-19' } }
  // Wrong behaviour caught: with next week already planned, "Nächste Woche planen" opened an empty new week, which saved
  // a second plan for the same week that the website never showed, and gave no way to the plan that was there. Without
  // a plan, the new week had no way to start from this week's days.
  test.each([
    ['next week planned', [lunch, plan], 'lunchPlans.edit on p19, copy from -'],
    ['next week not planned', [lunch], 'lunchPlans.planNext on -, copy from lunch1'],
  ])('"Nächste Woche planen", %s: opens %s', async (_name, entries, opened) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
    schema = serializeSchema(restaurant)
    listed = entries
    try {
      const sheet = { props: ['brickKey', 'task', 'entry', 'copyFrom'], template: '<p data-test="sheet">{{ brickKey }}.{{ task.id }} on {{ entry?._id ?? "-" }}, copy from {{ copyFrom ?? "-" }}</p>' }
      const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
        global: { stubs: { TaskSheet: sheet, PickSheet: true, I18nT: true, NuxtLink: true } },
      })
      await flushPromises()
      await wrapper.findAll('button').find((b) => b.text() === 'Nächste Woche planen')!.trigger('click')
      expect(wrapper.get('[data-test="sheet"]').text()).toBe(opened)
      wrapper.unmount()
    } finally {
      schema = notices
      vi.useRealTimers()
    }
  })
})

describe('own proposals on Schnell ändern', () => {
  const lunch = { _id: 'lunch1', brick: 'lunch', kind: 'single', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { weekOf: '2026-10-12', days: [] } }
  const proposal = (over: Record<string, unknown>) => ({
    proposal: 'p1', op: 'save', brick: 'lunch', entry: 'lunch1', task: 'lunch.lunchWeek', via: 'ui', sentence: 'Hinweis von „Mittagsmenü“ geändert', msg: null, status: 'open',
    createdAt: Date.UTC(2026, 9, 15, 8), decidedAt: null, decidedBy: null, reason: null, ...over,
  })
  const sheet = { props: ['brickKey', 'task', 'entry', 'reopen'], template: '<p data-test="sheet">{{ brickKey }}.{{ task.id }} on {{ entry?._id }}, reopen {{ reopen }}</p>' }
  async function page() {
    const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
      global: { stubs: { TaskSheet: sheet, PickSheet: true, I18nT: true, NuxtLink: true } },
    })
    await flushPromises()
    return wrapper
  }

  // Wrong behaviour caught: after sending, the cook's card still showed only the old week, so he thought nothing was
  // saved; a rejection was never shown to him, and fixing it meant typing the whole week again.
  test('a waiting proposal says so; a rejection shows the reason, and Korrigieren opens the task on it', async () => {
    schema = serializeSchema(restaurant)
    listed = [lunch]
    own = { open: [proposal({ proposal: 'p2', brick: 'menu', entry: 'm1', task: 'menu.price', sentence: 'Preis von „Saibling“ geändert' })], rejected: [proposal({ status: 'rejected', reason: 'Bitte mit Preis.' })], notLive: [] }
    try {
      const wrapper = await page()
      expect(wrapper.get('[data-test="own-waiting"]').text()).toBe('Preis von „Saibling“ geändert · Wartet auf Freigabe, eingereicht 15.10.2026, 10:00.')
      const rejected = wrapper.get('[data-test="own-rejected"]')
      expect(rejected.text()).toContain('Nicht freigegeben: „Bitte mit Preis.“')
      await rejected.get('button').trigger('click')
      expect(wrapper.get('[data-test="sheet"]').text()).toBe('lunch.lunchWeek on lunch1, reopen p1')
      wrapper.unmount()

      // The link from Verlauf or the rejection mail opens it at once, and only once.
      route.query = { task: 'lunch.lunchWeek', reopen: 'p1' }
      navigated.length = 0
      const linked = await page()
      expect(linked.get('[data-test="sheet"]').text()).toBe('lunch.lunchWeek on lunch1, reopen p1')
      expect(navigated).toEqual([{ path: '/s/restaurant', query: {} }])
      linked.unmount()
    } finally {
      schema = notices
      own = { open: [], rejected: [], notLive: [] }
      route.query = {}
    }
  })
})

// Wrong behaviour caught: "Heute geschlossen" saved for tomorrow showed no state at all, so the owner could not tell it
// was saved (and reopened it, which closed today instead); then the state of a later day named the task "Heute
// geschlossen" next to Friday's date, not the day's own field.
test.each([
  ['tomorrow', '2026-10-16', 'site.quick.dayDone', 'Geschlossen am Freitag, 16. Oktober'],
  ['today', '2026-10-15', 'site.quick.todayDone', undefined],
  ['yesterday', '2026-10-14', undefined, undefined],
])('a closure set for %s: the flag says so', async (_when, closedOn, key, date) => {
  listed = [{ _id: 'h1', brick: 'hours', kind: 'single', order: 0, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { closedOn } } as never]
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
    global: { stubs: { TaskSheet: true, PickSheet: true, NuxtLink: true, I18nT: { props: ['k', 'params'], template: '<span class="flag" :data-k="k">{{ params.field }} {{ params.date }}</span>' } } },
  })
  await flushPromises()
  const flag = wrapper.find('.flag')
  expect(flag.exists() ? [flag.attributes('data-k'), flag.text() || undefined] : [undefined, undefined]).toEqual([key, date])
  wrapper.unmount()
})

// Wrong behaviour caught: on a drafts collection that also expires its entries, a draft sat in the list of what is
// on the website, and nothing on Heute offered to publish it (or, for staff, showed someone else's draft).
test('a drafts collection lists its drafts apart from what is on the website, staff only their own', async () => {
  const withDrafts = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
    pages: { home: { de: '/' } },
    bricks: {
      notices: collection({
        label: 'Hinweise', max: 20, order: 'manual', drafts: true,
        fields: { text: f.text('Text'), until: f.date('Gilt bis', { optional: true }) },
        visible: { mode: 'until', field: 'until' },
        tasks: [{ id: 'add', label: 'Hinweis hinzufügen', kind: 'create' }],
      }),
    },
  }))
  schema = withDrafts
  const since = Date.parse('2026-10-14T07:00:00Z')
  listed = [
    notice('e1', 'Online'),
    { ...notice('d1', 'Mein Entwurf'), state: 'draft', own: true, since },
    { ...notice('d2', 'Fremder Entwurf'), state: 'draft', since },
  ]
  try {
    const page = () => mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(QuickPage) }) }), {
      global: { stubs: { TaskSheet: true, PickSheet: true, I18nT: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    const staff = page()
    await flushPromises()
    expect(staff.findAll('li').map((li) => li.text())).toEqual(['Onlinebis 20.10.2026', 'Mein EntwurfEntwurf seit Mi., 14. Okt., 09:00Veröffentlichen'])
    staff.unmount()

    manager = true
    const owner = page()
    await flushPromises()
    expect(owner.findAll('[data-test="today-drafts"] li span.font-medium').map((el) => el.text())).toEqual(['Mein Entwurf', 'Fremder Entwurf'])
    owner.unmount()
  } finally {
    manager = false
    schema = notices
  }
})
