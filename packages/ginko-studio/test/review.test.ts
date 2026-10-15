// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { useI18n } from '#imports'
import { describe, expect, test, vi } from 'vitest'
import { computed, ref } from 'vue'
import ChangeDiff from '../app/components/ChangeDiff.vue'
import ChangeRows from '../app/components/ChangeRows.vue'
import OwnProposals from '../app/components/OwnProposals.vue'
import ReviewRow from '../app/components/ReviewRow.vue'
import type { Id } from '../../ginko-server/convex/_generated/dataModel'
import type { DiffField, ProposalRow } from '../app/utils/review'

/** What `uploads.urls` answers for the pictures of a rich text diff (the only query ChangeDiff asks). */
const pictureUrls = ref<Record<string, { url: string }>>({})
vi.stubGlobal('useConvexQuery', (_query: unknown, args: () => unknown) => ({ data: computed(() => (args() === 'skip' ? undefined : pictureUrls.value)) }))

const fields = {
  price: { type: 'money', label: 'Preis', currency: 'EUR' },
  text: { type: 'longtext', label: 'Beschreibung' },
} as never

const diff: DiffField[] = [
  { field: 'price', label: 'Preis', kind: 'money', before: { amount: 850, currency: 'EUR' }, after: { amount: 920, currency: 'EUR' } },
  {
    field: 'text', label: 'Beschreibung', kind: 'longtext',
    before: { de: 'Hausgemacht.\n\nMit Salat.' }, after: { de: 'Hausgemacht.\n\nMit Salat und Brot.' },
    locales: [{ locale: 'de', before: 'Hausgemacht.\n\nMit Salat.', after: 'Hausgemacht.\n\nMit Salat und Brot.' }],
  },
]

describe('ChangeDiff', () => {
  test('a price shows Vorher and Nachher; a long text shows only the changed paragraphs with − and +', () => {
    const text = mount(ChangeDiff, { props: { diff, fields, locale: 'de' } }).text()
    expect(text).toMatch(/Vorher\s*8,50/)
    expect(text).toMatch(/Nachher\s*9,20/)
    expect(text).toContain('− Mit Salat.')
    expect(text).toContain('+ Mit Salat und Brot.')
    expect(text).not.toContain('Hausgemacht')
  })

  // Wrong behaviour caught: the owner approves a lunch menu change without seeing which day or dish changed, or
  // approves a new dish without seeing the allergens that stay on its day.
  test('a list shows each changed row by name with old → new cells and its other cells, added rows with + and removed rows with −', () => {
    const days = {
      days: {
        type: 'list', label: 'Tage', itemLabel: 'Tag', max: 5,
        of: {
          day: { pos: 0, type: 'choice', label: 'Tag', options: [{ value: 'tu', label: 'Dienstag' }, { value: 'we', label: 'Mittwoch' }, { value: 'th', label: 'Donnerstag' }, { value: 'fr', label: 'Freitag' }] },
          dish: { pos: 1, type: 'text', label: 'Gericht' },
          allergens: { pos: 2, type: 'choices', label: 'Allergene', options: [{ value: 'A', label: 'A Gluten' }, { value: 'C', label: 'C Eier' }] },
          fish: { pos: 3, type: 'text', label: 'Fisch der Woche', optional: true, showWhen: { field: 'day', is: 'fr' } },
          side: { pos: 4, type: 'text', label: 'Beilage', optional: true },
        },
      },
    } as never
    const tue = { _id: 'a', day: 'tu', dish: 'Tafelspitz', allergens: ['A', 'C'], fish: 'Forelle' }
    const wed = { _id: 'b', day: 'we', dish: 'Schnitzel' }
    const thu = { _id: 'c', day: 'th', dish: 'Fisch' }
    const rows: DiffField[] = [{
      field: 'days', label: 'Tage', kind: 'list', before: [tue, thu] as never, after: [{ ...tue, dish: 'Kürbisgulasch' }, wed] as never,
      rows: [
        { id: 'a', change: 'changed', before: tue, after: { ...tue, dish: 'Kürbisgulasch' }, fields: ['dish'] },
        { id: 'b', change: 'added', before: null, after: wed },
        { id: 'c', change: 'removed', before: thu, after: null },
      ],
    }]
    const lines = mount(ChangeDiff, { props: { diff: rows, fields: days, locale: 'de' } }).findAll('li p').map((p) => p.text().replace(/\s+/g, ' '))
    expect(lines).toEqual([
      'Dienstag', 'Gericht: Tafelspitz → Kürbisgulasch', 'Allergene: A Gluten, C Eier',
      '+ Mittwoch', 'Gericht: Schnitzel',
      '− Donnerstag', 'Gericht: Fisch',
    ])
  })

  // Wrong behaviour caught: a rich text showed its Markdown codes ("## …", "- …") and internal file ids to editors who
  // do not know Markdown, so they could not tell which heading, bullet or picture was lost (R9, A8, romi-16).
  test('a rich text shows its changed blocks formatted: a heading as a heading, a bullet as a bullet, a picture as a thumbnail', async () => {
    pictureUrls.value = { f1: { url: 'https://files.test/wald.jpg' } }
    const body = { body: { type: 'markdown', label: 'Text' } } as never
    const before = '## Was ihr bekommt\n\n- Konzeption\n- Dreh\n\n![Wald im Gesäuse]($file.f1)'
    const rich: DiffField[] = [{ field: 'body', label: 'Text', kind: 'markdown', before: { de: before }, after: { de: '- Konzeption' }, locales: [{ locale: 'de', before, after: '- Konzeption' }] }]
    const wrapper = mount(ChangeDiff, { props: { diff: rich, fields: body, locale: 'de', site: 'restaurant' } })
    await flushPromises()
    expect(wrapper.get('del h2').text()).toBe('Was ihr bekommt')
    expect(wrapper.get('del li').text()).toBe('Dreh')
    expect(wrapper.get('del img').attributes('src')).toBe('https://files.test/wald.jpg')
    expect(wrapper.text()).toContain('Wald im Gesäuse')
    expect(wrapper.text()).not.toContain('Konzeption')
    expect(wrapper.text()).not.toMatch(/##|- |\$file\./)
  })

  test('the list field no longer shows a count as Vorher and Nachher', () => {
    const days = { days: { type: 'list', label: 'Tage', itemLabel: 'Tag', max: 5, of: { dish: { type: 'text', label: 'Gericht' } } } } as never
    const rows: DiffField[] = [{ field: 'days', label: 'Tage', kind: 'list', before: null, after: null, rows: [{ id: 'r', change: 'added', before: null, after: { dish: 'Suppe' } }] }]
    expect(mount(ChangeDiff, { props: { diff: rows, fields: days, locale: 'de' } }).text()).not.toContain('Vorher')
  })
})

const row = (over: Partial<ProposalRow> = {}): ProposalRow => ({
  proposal: 'p1' as Id<'proposals'>, op: 'save', brick: 'menu', entry: null, task: null, sentence: 'Preis geändert', msg: null, status: 'open', author: { email: 'a@b.at' }, mine: false, via: 'ui', agent: null,
  createdAt: Date.UTC(2026, 9, 8, 10), at: null, release: null, decidedBy: null, decidedAt: null, reason: null, reasonMsg: null, change: null,
  canDecide: true, conflict: null, conflictMsg: null, ...over,
})
const mountRow = (proposal: ProposalRow, detail?: { diff: DiffField[] }, inRelease = false) =>
  mount(ReviewRow, { props: { proposal, detail, open: true, busy: false, error: '', fields, locale: 'de', timeZone: 'Europe/Vienna', inRelease } })
/** Labels of the action buttons (the first button is the row's own expand toggle). */
const actions = (wrapper: ReturnType<typeof mountRow>) => wrapper.findAll('button').map((b) => b.text()).slice(1)

describe('ReviewRow actions', () => {
  test('an open proposal of someone else can be approved, approved for later or rejected', () => {
    expect(actions(mountRow(row()))).toEqual(['Freigeben', 'Für später freigeben…', 'Ablehnen…'])
  })

  test('a release member is decided with the release: only Reject', () => {
    expect(actions(mountRow(row({ release: 'r1' as Id<'releases'> }), undefined, true))).toEqual(['Ablehnen…'])
  })

  test('your own proposal says so and has no actions', () => {
    const wrapper = mountRow(row({ mine: true, canDecide: false }))
    expect(wrapper.text()).toContain('Du hast das vorgeschlagen')
    expect(actions(wrapper)).toEqual([])
  })

  // Wrong behaviour caught: a member who calls themselves like a colleague ("Maria Huber") is shown to the owner who
  // decides only by that name; the verified address that named them before is gone.
  test('a proposal names its author by the name they set and, for the owner, their address', () => {
    expect(mountRow(row({ author: { email: 'koch@b.at', name: 'Maria Huber' } })).text()).toContain('Maria Huber (koch@b.at)')
  })

  test('a proposal that no longer fits can only be rejected, and shows why', () => {
    const wrapper = mountRow(row({ conflict: 'Inzwischen hat jemand das geändert.', conflictMsg: null }), { diff })
    expect(actions(wrapper)).toEqual(['Ablehnen…'])
    expect(wrapper.text()).toContain('Passt nicht mehr')
    expect(wrapper.text()).toContain('Inzwischen hat jemand das geändert.')
  })
})

describe('OwnProposals', () => {
  // Wrong behaviour caught: Withdraw on row A, then on row B; when A finishes, B's button turns on again while B still runs.
  test('each Withdraw stays disabled while its own call runs', async () => {
    const waiting = [row({ proposal: 'a' as Id<'proposals'>, mine: true }), row({ proposal: 'b' as Id<'proposals'>, mine: true })]
    const finish: (() => void)[] = []
    // The components use Nuxt's auto-imports.
    for (const [name, fn] of Object.entries({ computed, ref, useI18n })) vi.stubGlobal(name, fn)
    vi.stubGlobal('useToast', () => ({ show: () => {} }))
    vi.stubGlobal('useConvexQuery', () => ({ data: computed(() => ({ open: waiting, rejected: [], notLive: [] })) }))
    // Like the library: `pending` is true while the newest call of this mutation runs.
    vi.stubGlobal('useConvexMutation', () => {
      const pending = ref(false)
      return {
        pending: computed(() => pending.value),
        mutate: () => {
          pending.value = true
          return new Promise((resolve) => finish.push(() => { pending.value = false; resolve({}) }))
        },
      }
    })
    const wrapper = mount(OwnProposals, { props: { site: 's', schema: { timeZone: 'Europe/Vienna', locales: ['de'], bricks: {} } as never, filter: 'all', manager: false, grants: new Set<string>() } })
    const [a, b] = wrapper.findAll('button')
    await a!.trigger('click')
    await b!.trigger('click')
    finish[0]!()
    await flushPromises()
    expect(wrapper.findAll('button').map((button) => button.attributes('disabled') !== undefined)).toEqual([false, true])
    vi.unstubAllGlobals()
  })

  // Wrong behaviour caught: an owner's rejected assistant proposal offered "Korrigieren", which opened the task on the
  // stored values: the Studio reopens only its own proposals.
  test('"Korrigieren" is offered for a rejected proposal made in the Studio, not for an assistant\'s', () => {
    const rejected = (proposal: string, via: 'ui' | 'agent') => row({ proposal: proposal as Id<'proposals'>, status: 'rejected', mine: true, via, entry: 'm1' as Id<'entries'>, task: 'menu.price', reason: 'Nein.', decidedAt: Date.UTC(2026, 9, 8, 11) })
    for (const [name, fn] of Object.entries({ computed, ref, useI18n })) vi.stubGlobal(name, fn)
    vi.stubGlobal('useConvexQuery', () => ({ data: computed(() => ({ open: [], rejected: [rejected('ui1', 'ui'), rejected('ai1', 'agent')], notLive: [] })) }))
    const wrapper = mount(OwnProposals, {
      props: { site: 's', schema: { timeZone: 'Europe/Vienna', locales: ['de'], bricks: {} } as never, filter: 'all', manager: true, grants: new Set<string>() },
      global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).toEqual(['/s/s?task=menu.price&reopen=ui1'])
    vi.unstubAllGlobals()
  })
})

describe('ChangeRows', () => {
  // Wrong behaviour caught: Verlauf showed an approved change with only the cook's name, and offered the cook a
  // "Rückgängig" that the server refuses for a task that needs approval.
  test('an approved change names the approver; staff whose task needs approval go back with a new version, not Rückgängig', () => {
    for (const [name, fn] of Object.entries({ computed, ref, onMounted: () => {}, onUnmounted: () => {}, useI18n })) vi.stubGlobal(name, fn)
    vi.stubGlobal('useOps', () => ({}))
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
    const change = {
      _id: 'c1', kind: 'save', brick: 'lunch', entry: 'l1', fields: ['note'], at: Date.now(), sentence: 'Hinweis von „Mittagsmenü“ geändert', msg: null,
      who: { email: 'koch@example.com' }, agent: null, approver: { email: 'wirtin@example.com' }, undoBlocked: null,
    }
    vi.stubGlobal('useConvexPaginatedQuery', () => ({ data: computed(() => [change]), error: ref(null), status: ref('success'), canLoadMore: ref(false), isLoadingMore: ref(false), loadMore: () => {} }))
    const schema = { timeZone: 'Europe/Vienna', locales: ['de'], bricks: { lunch: { tasks: [{ id: 'lunchWeek', label: 'Mittagsmenü dieser Woche', kind: 'edit', fields: ['weekOf', 'days', 'note'], needsApproval: true }] } } }
    const wrapper = mount(ChangeRows, { props: { site: 's', schema: schema as never, manager: false, grants: new Set(['lunch.lunchWeek']), filter: 'all' }, global: { stubs: { ChangeDetail: true } } })
    expect(wrapper.get('li p.text-\\[13px\\]').text()).toBe('koch@example.com · Freigabe: wirtin@example.com · gerade eben')
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Änderungen anzeigen', 'Zurück zu dieser Version'])
    vi.unstubAllGlobals()
  })
})

describe('ChangeRows', () => {
  // Wrong behaviour caught: the cook adds an event with "Veranstaltung hinzufügen" (no edit task exists for events),
  // changes its date, and finds no Rückgängig in the history, although the server and the agent door allow it.
  test.each([
    { own: true, undo: true },
    { own: false, undo: false },
  ])('staff with only a create task undo a save of an entry they created (own: $own)', async ({ own, undo }) => {
    const save = { _id: 'c1', kind: 'save', brick: 'events', entry: 'e1', fields: ['when'], at: Date.now(), who: { self: true }, agent: null, undoBlocked: null, sentence: 'Datum geändert', ...(own ? { own } : {}) }
    for (const [name, fn] of Object.entries({ computed, ref, useI18n, onMounted: () => {}, onUnmounted: () => {} })) vi.stubGlobal(name, fn)
    vi.stubGlobal('useConvexPaginatedQuery', () => ({ data: ref([save]), error: ref(undefined), status: ref('success'), canLoadMore: ref(false), isLoadingMore: ref(false) }))
    vi.stubGlobal('useOps', () => ({}))
    vi.stubGlobal('useConvexQuery', () => ({ data: ref(undefined), error: ref(undefined) }))
    const schema = { timeZone: 'Europe/Vienna', locales: ['de'], bricks: { events: { kind: 'collection', label: 'Veranstaltungen', fields: {}, tasks: [{ id: 'add', label: 'Veranstaltung hinzufügen', kind: 'create' }] } } }
    try {
      const wrapper = mount(ChangeRows, { props: { site: 's', schema: schema as never, manager: false, grants: new Set(['events.add']) } })
      expect(wrapper.findAll('button').some((button) => button.text() === 'Rückgängig')).toBe(undo)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
