// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { useI18n } from '#imports'
import { describe, expect, test, vi } from 'vitest'
import { computed, ref } from 'vue'
import ChangeDiff from '../app/components/ChangeDiff.vue'
import OwnProposals from '../app/components/OwnProposals.vue'
import ReviewRow from '../app/components/ReviewRow.vue'
import type { Id } from '../../ginko-server/convex/_generated/dataModel'
import type { DiffField, ProposalRow } from '../app/utils/review'

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

  // Wrong behaviour caught: the owner approves a lunch menu change without seeing which day or dish changed.
  test('a list shows each changed row by name with old → new cells, added rows with + and removed rows with −', () => {
    const days = { days: { type: 'list', label: 'Tage', itemLabel: 'Tag', max: 5, of: { day: { type: 'choice', label: 'Tag', options: [{ value: 'tu', label: 'Dienstag' }, { value: 'we', label: 'Mittwoch' }, { value: 'th', label: 'Donnerstag' }] }, dish: { type: 'text', label: 'Gericht' } } } } as never
    const tue = { _id: 'a', day: 'tu', dish: 'Tafelspitz' }
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
      'Dienstag', 'Gericht: Tafelspitz → Kürbisgulasch',
      '+ Mittwoch', 'Gericht: Schnitzel',
      '− Donnerstag', 'Gericht: Fisch',
    ])
  })

  test('the list field no longer shows a count as Vorher and Nachher', () => {
    const days = { days: { type: 'list', label: 'Tage', itemLabel: 'Tag', max: 5, of: { dish: { type: 'text', label: 'Gericht' } } } } as never
    const rows: DiffField[] = [{ field: 'days', label: 'Tage', kind: 'list', before: null, after: null, rows: [{ id: 'r', change: 'added', before: null, after: { dish: 'Suppe' } }] }]
    expect(mount(ChangeDiff, { props: { diff: rows, fields: days, locale: 'de' } }).text()).not.toContain('Vorher')
  })
})

const row = (over: Partial<ProposalRow> = {}): ProposalRow => ({
  proposal: 'p1' as Id<'proposals'>, op: 'save', brick: 'menu', entry: null, sentence: 'Preis geändert', msg: null, status: 'open', author: { email: 'a@b.at' }, mine: false, via: 'ui', agent: null,
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
    const wrapper = mount(OwnProposals, { props: { site: 's', schema: { timeZone: 'Europe/Vienna', locales: ['de'], bricks: {} } as never, filter: 'all' } })
    const [a, b] = wrapper.findAll('button')
    await a!.trigger('click')
    await b!.trigger('click')
    finish[0]!()
    await flushPromises()
    expect(wrapper.findAll('button').map((button) => button.attributes('disabled') !== undefined)).toEqual([false, true])
    vi.unstubAllGlobals()
  })
})
