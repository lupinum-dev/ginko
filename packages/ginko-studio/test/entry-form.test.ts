// @vitest-environment happy-dom
// The form engine of Schnell ändern and Alles bearbeiten (useEntryForm), mounted in a small component. The Nuxt
// auto-imports are Vue's own; only the Studio's writes (useOps), the toast and the signed-in person are replaced.
// Browser storage is happy-dom's real localStorage.
import { mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Entry } from '../app/composables/useSiteData'
import type { EntryFormOptions } from '../app/composables/useEntryForm'

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
    name: { type: 'text', label: 'Name', pos: 0 }, description: { type: 'longtext', label: 'Beschreibung', pos: 1 },
    sides: { type: 'list', label: 'Beilagen', pos: 2, of: { name: { type: 'text', label: 'Name' } } },
  },
} as never

/** The entry page: the entry from the live list, kept when it leaves it (as [entry].vue does). `options`: a quick-task sheet's. */
function mountForm(options: Partial<EntryFormOptions> = {}) {
  let form!: ReturnType<typeof useEntryForm>
  mount(vue.defineComponent({
    setup() {
      const { entry, removed } = useKeptEntry(() => 'e1', () => live.value)
      form = useEntryForm({
        site: vue.ref('restaurant'), brickKey: () => 'dishes', brick: () => brick, fields: () => (brick as { fields: never }).fields,
        entry: () => entry.value, removed: () => removed.value, main: () => 'de', locale: () => 'de', ...options,
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
  // and overwrites what someone saved meanwhile; or the copy does not name its area and title, so Heute cannot list it.
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
    expect(after.localOffer.value).toMatchObject({ fields: { name: 'Schnitzel mit Preiselbeeren' }, brick: 'dishes', title: 'Schnitzel mit Preiselbeeren' })

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

// A quick-task sheet edits every language of its texts and saves them whole (allLanguages).
describe('a form that saves every language', () => {
  const named = (rev: number, name: Record<string, string>) => ({ ...stored, rev, fieldRevs: { ...stored.fieldRevs, name: rev }, data: { ...stored.data, name } })
  const before = named(5, { de: 'Kalbsschnitzel', en: 'Veal schnitzel' })
  /** The cook's English, saved in Alles bearbeiten while the sheet was open. */
  const theirs = named(6, { de: 'Kalbsschnitzel', en: 'Viennese veal schnitzel' })

  // Wrong behaviour caught: "Meine behalten" sent the person's whole text, with the English as it was when the sheet
  // opened, so the English someone saved meanwhile was gone without a word; also when a copy restored after a reload
  // met that change.
  test.each(['in the open form', 'after a reload'])('"Meine behalten" keeps the English someone else saved meanwhile (%s)', async (when) => {
    live.value = before
    let form = mountForm({ allLanguages: true })
    form.setField('name', { de: 'Wiener Schnitzel', en: 'Veal schnitzel' })
    if (when === 'after a reload') {
      await vue.nextTick()
      window.dispatchEvent(new Event('pagehide'))
      live.value = theirs
      form = mountForm({ allLanguages: true })
      await form.restoreLocal()
    } else {
      refuseNext = { code: 'CHANGED_SINCE', message: 'Inzwischen hat jemand das geändert.', details: { rev: 6, conflicts: ['name'], data: theirs.data } }
      expect(await form.save()).toBe(false)
    }
    expect(form.conflict.value?.fields).toEqual(['name'])

    expect(await form.keepMine()).toBe(true)
    expect(calls).toEqual([['save', { entry: 'e1', baseRev: 6, fields: { name: { de: 'Wiener Schnitzel', en: 'Viennese veal schnitzel' } } }]])
  })

  // Wrong behaviour caught: a copy from the sheet holds English typed there; Alles bearbeiten in German offered it and
  // saved only its German, and the English went for good with the copy.
  test.each([
    { typed: 'German only', name: { de: 'Wiener Schnitzel', en: 'Veal schnitzel' }, offered: true },
    { typed: 'English too', name: { de: 'Kalbsschnitzel', en: 'Viennese veal schnitzel' }, offered: false },
  ])('a copy from the sheet with $typed is offered in a German-only form: $offered', async ({ name, offered }) => {
    live.value = before
    mountForm({ allLanguages: true }).setField('name', name)
    await vue.nextTick()
    window.dispatchEvent(new Event('pagehide'))
    expect([!!mountForm().localOffer.value, !!mountForm({ allLanguages: true }).localOffer.value]).toEqual([offered, true])
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

  // Wrong behaviour caught: with the network gone, the button said "Wird gespeichert …" for up to a minute, because
  // the Convex socket notices a lost network only when it closes or after its 60 s check.
  test('the browser going offline during a save waits at once, also while the Convex socket still looks open', async () => {
    let land!: () => void
    landing = new Promise((resolve) => { land = resolve })
    const form = mountForm()
    form.setField('name', 'Kalbsschnitzel')
    const saving = form.save()
    // The save first hands over held input (flush), so it is on its way a few microtasks later.
    await vi.waitUntil(() => form.busy.value)
    window.dispatchEvent(new Event('offline'))
    expect([connected.value, form.busy.value, form.offline.value]).toEqual([true, true, true])
    window.dispatchEvent(new Event('online'))
    expect(form.offline.value).toBe(false)
    land()
    expect(await saving).toBe(true)
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

  // Wrong behaviour caught (R10): her own save from a second tab read "anna@lupinum.test hat inzwischen Beschreibung
  // geändert.", as if someone else had changed it; a colleague with a name was named by address.
  test.each([
    [{ self: true } as const, 'Du hast Name inzwischen in einem anderen Fenster geändert.'],
    [{ kind: 'member', name: 'Jonas' } as const, 'Jonas hat inzwischen Name geändert.'],
  ])('the heading for a save by %o', (who, heading) => {
    const panel = mount(ConflictPanel, {
      props: {
        conflict: { fields: ['name'], data: { ...stored.data, name: 'Schnitzel vom Schwein' }, by: { name: who } },
        draft: { ...stored.data, name: 'Schnitzel mit Preiselbeeren' }, baseline: stored.data,
        fields: (brick as { fields: never }).fields, locale: 'de', main: 'de', canKeepBoth: false,
      },
    })
    expect(panel.find('strong').text()).toBe(heading)
  })
})
