// @vitest-environment happy-dom
// The form engine of Schnell ändern and Alles bearbeiten (useEntryForm), mounted in a small component. The Nuxt
// auto-imports are Vue's own; only the Studio's writes (useOps), the toast and the signed-in person are replaced.
// Browser storage is happy-dom's real localStorage.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Entry } from '../app/composables/useSiteData'

for (const name of ['ref', 'shallowRef', 'computed', 'reactive', 'watch', 'nextTick', 'provide', 'onMounted', 'onBeforeUnmount'] as const) vi.stubGlobal(name, vue[name])
vi.stubGlobal('onBeforeRouteLeave', () => {})
vi.stubGlobal('onBeforeRouteUpdate', () => {})
vi.stubGlobal('useConvexAuth', () => ({ user: vue.ref({ id: 'u1' }) }))
/** The Convex WebSocket, as useConvexConnectionState reports it. */
const connected = vue.ref(true)
vi.stubGlobal('useConvexConnectionState', () => ({ isConnected: connected }))
const toasts: string[] = []
vi.stubGlobal('useToast', () => ({ show: (text: string) => toasts.push(text) }))

const calls: unknown[] = []
const stored: Entry = {
  _id: 'e1', brick: 'dishes', kind: 'item', order: 1, rev: 5, lifeRev: 1, fieldRevs: { name: 2, description: 3 }, prints: {},
  data: { name: 'Wiener Schnitzel vom Kalb', description: 'Mit Petersilkartoffeln', sides: [{ _id: 'r1', name: 'Erdäpfelsalat' }] },
}
/** The next save is refused with this error (a conflict), as the server does. */
let refuseNext: unknown
/** While set, the next save waits for it, as a save on its way does. */
let landing: Promise<void> | undefined
/** The live list's view of the entry: undefined once someone removed it. */
const live = vue.shallowRef<Entry | undefined>(stored)
/** The opId of every save sent, also of refused ones; opIds are made in order: op1, op2, … */
const sentOps: string[] = []
let made = 0
vi.stubGlobal('useOps', () => ({
  opId: () => `op${++made}`,
  saveEntry: async (args: { entry: string; baseRev: number; fields: unknown; op: string }) => {
    sentOps.push(args.op)
    await landing
    const refused = refuseNext
    refuseNext = undefined
    if (refused) throw refused
    calls.push(['save', { entry: args.entry, baseRev: args.baseRev, fields: args.fields }])
    return { rev: 7 }
  },
  createEntry: async (args: { data: unknown }) => {
    calls.push(['create', args.data])
    return { entry: 'e2' }
  },
  restoreEntry: async (entry: string, lifeRev: number) => {
    calls.push(['restore', entry, lifeRev])
    // Convex applies the restored entry to the live list before the mutation resolves.
    live.value = { ...stored, rev: 6, lifeRev: 3 }
    return true
  },
}))

const { useEntryForm } = await import('../app/composables/useEntryForm')
const { useKeptEntry } = await import('../app/composables/useKeptEntry')
const { default: ConflictPanel } = await import('../app/components/ConflictPanel.vue')

const brick = {
  kind: 'collection', label: 'Gerichte',
  fields: {
    name: { type: 'text', label: 'Name' }, description: { type: 'longtext', label: 'Beschreibung' },
    sides: { type: 'list', label: 'Beilagen', of: { name: { type: 'text', label: 'Name' } } },
  },
} as never

/** The entry page: the entry from the live list, kept when it leaves it (as [entry].vue does). */
function mountForm() {
  let form!: ReturnType<typeof useEntryForm>
  mount(vue.defineComponent({
    setup() {
      const { entry, removed } = useKeptEntry(() => 'e1', () => live.value)
      form = useEntryForm({
        site: vue.ref('restaurant'), brickKey: () => 'dishes', brick: () => brick, fields: () => (brick as { fields: never }).fields,
        entry: () => entry.value, removed: () => removed.value, main: () => 'de', locale: () => 'de',
      })
      form.load({ ...entry.value!.data })
      return () => vue.h('div')
    },
  }))
  return form
}

beforeEach(() => {
  calls.length = 0
  sentOps.length = 0
  made = 0
  toasts.length = 0
  live.value = stored
  refuseNext = undefined
  landing = undefined
  connected.value = true
  localStorage.clear()
})

describe('useEntryForm', () => {
  // Wrong behaviour caught: someone removes the entry while she types; the form loses her input, or Speichern
  // silently creates a new partial entry instead of saving onto the restored one.
  test('an entry removed meanwhile keeps the input, saves nothing, and "Wiederherstellen und speichern" saves it onto the entry', async () => {
    const form = mountForm()
    form.setField('description', 'Mit Erdäpfelsalat')
    live.value = undefined
    await vue.nextTick()

    expect(form.draft.value.description).toBe('Mit Erdäpfelsalat')
    expect(form.isCreate.value).toBe(false)
    expect(await form.save()).toBe(false)
    expect(calls).toEqual([])

    expect(await form.restoreAndSave(2)).toBe(true)
    expect(calls).toEqual([
      ['restore', 'e1', 2],
      ['save', { entry: 'e1', baseRev: 6, fields: { description: 'Mit Erdäpfelsalat' } }],
    ])
    expect(form.dirty.value).toBe(false)
  })

  // Wrong behaviour caught: a reload, crash or closed tab loses the typed input; or the copy comes back silently
  // and overwrites what someone saved meanwhile.
  test('after a reload the typed name is offered back; "Wiederherstellen" restores it and a name saved meanwhile is a conflict', async () => {
    const before = mountForm()
    before.setField('name', 'Schnitzel mit Preiselbeeren')
    await vue.nextTick()
    // The tab goes away: the copy is written at once, not after the pause.
    window.dispatchEvent(new Event('pagehide'))
    // Meanwhile the cook saves another name.
    live.value = { ...stored, rev: 6, fieldRevs: { ...stored.fieldRevs, name: 6 }, data: { ...stored.data, name: 'Kalbsschnitzel' } }

    const after = mountForm()
    expect(after.draft.value.name).toBe('Kalbsschnitzel')
    expect(after.localOffer.value?.fields).toEqual({ name: 'Schnitzel mit Preiselbeeren' })

    await after.restoreLocal()
    expect(after.draft.value.name).toBe('Schnitzel mit Preiselbeeren')
    expect(after.conflict.value).toEqual({ fields: ['name'], data: live.value.data, rev: 6 })
    expect(toasts).toEqual(['Wiederhergestellt. Inzwischen hat jemand Name geändert, bitte unten entscheiden.'])
  })
  // Wrong behaviour caught: two people each add a row to the same list at once; the conflict only offers to keep
  // one person's list, so the other row is lost.
  test('both add a row to the same list: "Beides behalten" saves both rows onto the new state', async () => {
    const form = mountForm()
    const salad = { _id: 'r1', name: 'Erdäpfelsalat' }
    form.setField('sides', [salad, { _id: 'r3', name: 'Kaspressknödel' }])
    refuseNext = {
      code: 'CHANGED_SINCE', message: 'Inzwischen hat jemand das geändert.',
      details: { rev: 6, conflicts: ['sides'], data: { ...stored.data, sides: [salad, { _id: 'r2', name: 'Frittatensuppe' }] }, by: { sides: { email: 'koch@example.com' } } },
    }
    expect(await form.save()).toBe(false)

    expect(await form.mergeLists()).toBe(true)
    expect(calls).toEqual([
      ['save', { entry: 'e1', baseRev: 6, fields: { sides: [salad, { _id: 'r2', name: 'Frittatensuppe' }, { _id: 'r3', name: 'Kaspressknödel' }] } }],
    ])
  })
})

describe('the opId of a save', () => {
  // Wrong behaviour caught: "Speichern" again after a save whose answer was lost (a sign-out meanwhile) writes a
  // second time; or a changed input reuses the old opId, which the server refuses as OP_REUSED.
  test('a retried save with the same input reuses its opId; a changed input gets a new one', async () => {
    const signedOut = { code: 'IDENTITY_CHANGED', message: 'Du wurdest abgemeldet. Melde dich wieder an und versuche es noch einmal.' }
    const form = mountForm()
    form.setField('name', 'Kalbsschnitzel')
    refuseNext = signedOut
    expect(await form.save()).toBe(false)
    refuseNext = signedOut
    expect(await form.save()).toBe(false)
    form.setField('name', 'Schweinsschnitzel')
    expect(await form.save()).toBe(true)
    form.setField('description', 'Mit Reis')
    expect(await form.save()).toBe(true)
    expect(sentOps).toEqual(['op1', 'op1', 'op2', 'op3'])
  })
})

describe('saving while the connection is down', () => {
  // Wrong behaviour caught: a slow save on a working connection says "Wartet auf Verbindung …", or a save sent
  // while the connection is down says "Wird gespeichert …".
  test('the button waits for the connection only while a save is on its way and the connection is down', async () => {
    vi.useFakeTimers()
    try {
      let land!: () => void
      landing = new Promise((resolve) => { land = resolve })
      const form = mountForm()
      form.setField('name', 'Kalbsschnitzel')
      const saving = form.save()
      await vi.advanceTimersByTimeAsync(5000)
      expect([form.busy.value, form.offline.value]).toEqual([true, false])
      connected.value = false
      expect(form.offline.value).toBe(true)
      land()
      expect(await saving).toBe(true)
      expect(form.offline.value).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ConflictPanel', () => {
  // Wrong behaviour caught: the server says who saved the name meanwhile, but the panel says "jemand", so she
  // cannot ask that person before choosing a version.
  test('one person changed every conflicting field: the heading names them', () => {
    const data = { ...stored.data, name: 'Schnitzel vom Schwein' }
    const panel = mount(ConflictPanel, {
      props: {
        conflict: { fields: ['name'], data, by: { name: { email: 'koch@example.com' } } },
        draft: { ...stored.data, name: 'Schnitzel mit Preiselbeeren' }, baseline: stored.data,
        fields: (brick as { fields: never }).fields, locale: 'de', main: 'de', canKeepBoth: false,
      },
    })
    expect(panel.find('strong').text()).toBe('koch@example.com hat inzwischen Name geändert.')
  })
})

describe('TaskSheet', () => {
  /** This week's lunch as stored: Montag with its dish and allergens. */
  const thisWeek = {
    weekOf: '2026-10-12', note: { de: 'Suppe inklusive' },
    days: [{ _id: 'ldmo000000', day: 'mo', dish: { de: 'Gulasch' }, allergens: ['A'] }, { _id: 'ldtu000000', day: 'tu', dish: { de: 'Fisch' }, allergens: ['D'] }],
  }

  /**
   * A sheet of the restaurant: `task` of `brickKey`, on `data` as the stored entry (none for a create task); the
   * server's prefill is `prefill`, other queries answer from `answers` by function name, and a one-off read
   * (`useConvex().query`) gets this week's lunch.
   */
  async function sheetOf(o: { brickKey: string; task: string; data?: Record<string, unknown>; prefill: Record<string, unknown>; answers?: Record<string, unknown>; copyFrom?: string; reopen?: string }) {
    const { serializeSchema } = await import('@lupinum/ginko/internal')
    const { default: restaurant } = await import('../../../sites/restaurant/ginko.config.ts')
    const { useI18n } = await import('#imports')
    const { useEntryForm } = await import('../app/composables/useEntryForm')
    const { default: TaskSheet } = await import('../app/components/TaskSheet.vue')
    vi.stubGlobal('useI18n', useI18n)
    vi.stubGlobal('useEntryForm', useEntryForm)
    // No own proposal unless the test gives one.
    const answers: Record<string, unknown> = { 'proposals.ownFor': null, ...o.answers }
    vi.stubGlobal('useConvexQuery', (fn: unknown) => ({ data: vue.ref(String(fn) === 'tasks.prefill' ? o.prefill : answers[String(fn)]), error: vue.ref(undefined) }))
    vi.stubGlobal('useConvexMutation', () => ({ pending: vue.ref(false), mutate: async () => ({}) }))
    vi.stubGlobal('useConvex', () => ({ query: async (fn: unknown) => (String(fn) === 'entries.get' ? { ...stored, _id: 'l1', brick: 'lunch', kind: 'single', data: thisWeek } : undefined) }))
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true }
    const schema = serializeSchema(restaurant)
    const brick = schema.bricks[o.brickKey]!
    const entry = o.data ? { ...stored, _id: 'l1', brick: o.brickKey, kind: brick.kind === 'single' ? 'single' : 'item', data: o.data } as Entry : undefined
    const sheet = mount(TaskSheet, {
      props: { site: 'restaurant', brickKey: o.brickKey, brick, task: brick.tasks!.find((t) => t.id === o.task)!, entry, main: 'de', locales: ['de', 'en'], schema, copyFrom: o.copyFrom, reopen: o.reopen },
      attachTo: document.body,
    })
    await flushPromises()
    return sheet
  }
  /** "Mittagsmenü dieser Woche" on a lunch entry of `storedWeek`; the server's prefill gives this week (12.10.2026). */
  const lunchSheet = (storedWeek: string, answers: Record<string, unknown> = {}, reopen?: string) => sheetOf({
    brickKey: 'lunch', task: 'lunchWeek', data: { weekOf: storedWeek, days: [], note: { de: 'Suppe inklusive' } }, prefill: { weekOf: '2026-10-12', days: [], note: { de: 'Suppe inklusive' } }, answers, reopen,
  })
  /** The cook's own proposal for this week's lunch (proposals.ownFor), sent on Monday 12.10.2026 at 10:00 in Vienna. */
  const ownProposal = (over: Record<string, unknown> = {}) => ({
    proposal: 'p1', status: 'open', task: 'lunch.lunchWeek', fields: { weekOf: '2026-10-12', note: { de: 'Suppe und Salat inklusive' } },
    createdAt: Date.UTC(2026, 9, 12, 8), decidedAt: null, decidedBy: null, reason: null, fits: true, ...over,
  })
  const noteOf = (sheet: Awaited<ReturnType<typeof sheetOf>>) => (sheet.get('#f-note').element as HTMLInputElement).value

  // Wrong behaviour caught: after sending, the cook's sheet opened on the old week again, so he thought nothing was
  // saved and typed the whole week a second time.
  test('with an open own proposal the sheet starts from it and says it waits for approval', async () => {
    const sheet = await lunchSheet('2026-10-05', { 'proposals.ownFor': ownProposal() })
    expect(noteOf(sheet)).toBe('Suppe und Salat inklusive')
    expect(sheet.get('[data-test="own-proposal"]').text()).toBe('Wartet auf Freigabe, eingereicht 12.10.2026, 10:00. Wenn du speicherst, ersetzt das deinen Vorschlag.Zurückziehen')
    // The days are the proposal's, not last week's.
    expect(sheet.text()).not.toContain('Das ist noch die Woche ab')
    sheet.unmount()
  })

  // Wrong behaviour caught: the sheet started from a waiting proposal whose note the owner had changed since, so Speichern
  // proposed the cook's old note again over the owner's newer one.
  test('an open own proposal that no longer fits: the sheet starts from the stored values and says why', async () => {
    const sheet = await lunchSheet('2026-10-12', { 'proposals.ownFor': ownProposal({ fits: false }) })
    expect(noteOf(sheet)).toBe('Suppe inklusive')
    expect(sheet.get('[data-test="own-proposal"]').text()).toBe('Dein Vorschlag (eingereicht 12.10.2026, 10:00) passt nicht mehr: Inzwischen hat jemand das geändert. Hier siehst du den aktuellen Stand.Zurückziehen')
    sheet.unmount()
  })

  // Wrong behaviour caught: a proposal of last week's lunch, still undecided on Monday, filled this week's sheet with
  // last week's dishes and allergens, and nothing said they were old.
  test.each([
    ['for the week stored then', '2026-10-05', { note: { de: 'Suppe und Salat inklusive' } }],
    ['with its own week', '2026-09-28', { weekOf: '2026-10-05', note: { de: 'Suppe und Salat inklusive' } }],
  ])('an own proposal sent last week %s: the sheet says its days are that week\'s', async (_name, storedWeek, fields) => {
    const sheet = await lunchSheet(storedWeek, { 'proposals.ownFor': ownProposal({ fields, createdAt: Date.UTC(2026, 9, 8, 8) }) })
    expect(noteOf(sheet)).toBe('Suppe und Salat inklusive')
    expect(sheet.text()).toContain('Das ist noch die Woche ab 5.10.2026. Prüfe jeden Tag, bevor du speicherst.')
    sheet.unmount()
  })

  // Wrong behaviour caught: a rejection was a dead end: the cook had to type the whole week again to fix one dish.
  test('a rejected own proposal shows the reason and reopens with its values, at once when the sheet is opened for it', async () => {
    const rejected = ownProposal({ status: 'rejected', decidedAt: Date.UTC(2026, 9, 12, 9), decidedBy: { kind: 'member' }, reason: 'Bitte mit Preis.' })
    const sheet = await lunchSheet('2026-10-12', { 'proposals.ownFor': rejected })
    expect(noteOf(sheet)).toBe('Suppe inklusive')
    expect(sheet.get('[data-test="own-proposal"]').text()).toContain('Ein Mitglied hat abgelehnt: „Bitte mit Preis.“')
    await sheet.findAll('button').find((b) => b.text() === 'Deinen Vorschlag wieder öffnen')!.trigger('click')
    expect(noteOf(sheet)).toBe('Suppe und Salat inklusive')
    sheet.unmount()

    const opened = await lunchSheet('2026-10-12', { 'proposals.ownFor': rejected }, 'p1')
    expect(noteOf(opened)).toBe('Suppe und Salat inklusive')
    opened.unmount()
  })

  // Wrong behaviour caught: "Mittagsmenü dieser Woche" offered "Folgende Arbeitswoche" and a free date, so saving
  // before Monday moved the website's lunch menu to next week and the rest of this week was gone.
  test('the weekly task shows its week as text, with no date to change', async () => {
    const sheet = await lunchSheet('2026-10-05')
    expect(sheet.find('input[type="date"]').exists()).toBe(false)
    expect(sheet.get('[data-test="fixed-week"]').text()).toBe('Woche ab12.10.2026Diese Aufgabe gilt immer für die laufende Woche.')
    sheet.unmount()
  })

  // Wrong behaviour caught: the sheet opened with this week's date and last week's dishes and allergens, and nothing
  // said they were old, so a rushed cook published last week's allergens as this week's.
  test.each([
    ['last week', '2026-10-05', true],
    ['this week', '2026-10-12', false],
  ])('a stored week from %s (%s): the sheet says the days are still that week\'s: %s', async (_name, storedWeek, notice) => {
    const sheet = await lunchSheet(storedWeek)
    expect(sheet.text().includes('Das ist noch die Woche ab 5.10.2026. Prüfe jeden Tag, bevor du speicherst.')).toBe(notice)
    sheet.unmount()
  })

  // Wrong behaviour caught: "Nächste Woche planen" could not take over this week, so the owner retyped every dish; and a
  // new dish in a new week went out with the old or "Keine" allergens because nothing asked about them.
  test('"Von dieser Woche übernehmen" fills next week\'s days; a changed dish with unchanged allergens blocks Speichern', async () => {
    calls.length = 0
    const sheet = await sheetOf({ brickKey: 'lunchPlans', task: 'planNext', prefill: { weekOf: '2026-10-19' }, copyFrom: 'l1' })
    await sheet.findAll('button').find((b) => b.text() === 'Von dieser Woche übernehmen')!.trigger('click')
    await flushPromises()
    const dish = (row: string) => sheet.get(`[data-row="${row}"] input[type="text"]`)
    expect((dish('ldmo000000').element as HTMLInputElement).value).toBe('Gulasch')
    expect((sheet.get('input[type="date"]').element as HTMLInputElement).value).toBe('2026-10-19')
    await dish('ldmo000000').setValue('Schnitzel')
    await sheet.get('form').trigger('submit')
    await flushPromises()
    expect(sheet.get('[role="alert"]').text()).toBe('Bitte bestätige bei „Montag“: Sind die Allergene noch richtig?')
    expect(calls).toEqual([])
    sheet.unmount()
  })
})
