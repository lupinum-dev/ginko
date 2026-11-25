// @vitest-environment happy-dom
// The quick-task sheet (TaskSheet) with the real form engine and the German catalog. Nuxt's auto-imports become
// globals; Convex, the writes and the toast are replaced, and each field is a plain input unless a test needs the real
// fields (languages).
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { addDays, collection, defineSite, f, single, todayIn } from '@lupinum/ginko/internal'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import SlashMenu from '../app/components/editor/SlashMenu.vue'

const { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, toValue, watch } = vue
Object.entries({ computed, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('onBeforeRouteLeave', () => {})
vi.stubGlobal('onBeforeRouteUpdate', () => {})
const toasts: string[] = []
vi.stubGlobal('useToast', () => ({ show: (text: string) => toasts.push(text) }))
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1' }) }))
vi.stubGlobal('useConvexConnectionState', () => ({ isConnected: ref(true) }))
vi.stubGlobal('useConvex', () => ({ query: async () => null }))
// The writes record what the form sends.
const ops = { opId: () => crypto.randomUUID(), createEntry: vi.fn(async () => ({ entry: 'new1' })), saveEntry: vi.fn(async () => ({ rev: 2 })) }
vi.stubGlobal('useOps', () => ops)

/**
 * The prefill query as Convex serves it: while the sheet asks for it (args, not 'skip') it is live and gets the
 * server's answers and errors; a skipped query gets nothing, and asking again runs it again.
 */
const prefill = { live: false, asked: 0, data: shallowRef<unknown>(), error: shallowRef<unknown>() }
vi.stubGlobal('useConvexQuery', (fn: unknown, args: unknown) => {
  // No own proposal on the entry (proposals.ownFor answers null): the form starts from the prefill.
  // A skipped query (no entry to ask for) hears nothing.
  if (String(fn) === 'datedChanges.list') return { data: computed(() => (toValue(args) === 'skip' ? undefined : datedRows.value)), error: ref(undefined) }
  if (String(fn) !== 'tasks.prefill') return { data: String(fn) === 'proposals.ownFor' ? ownProposal : ref(undefined), error: ref(undefined) }
  watch(() => toValue(args), (now) => {
    prefill.live = now !== 'skip'
    prefill.data.value = undefined
    prefill.error.value = undefined
    if (prefill.live) prefill.asked++
  }, { immediate: true, flush: 'sync' })
  return { data: prefill.data, error: prefill.error }
})
/** The entry's changes for a later day (datedChanges.list). */
const datedRows = shallowRef<unknown>([])
/** The person's own proposal on the entry (proposals.ownFor); null while there is none. */
const ownProposal = shallowRef<unknown>(null)
/** The server's answer to the live query; a skipped one never hears it. */
function answer(result: { data: unknown } | { error: unknown }) {
  if (!prefill.live) return
  if ('data' in result) prefill.data.value = result.data
  else prefill.error.value = result.error
}

const { useEntryForm } = await import('../app/composables/useEntryForm')
vi.stubGlobal('useEntryForm', useEntryForm)
const { default: TaskSheet } = await import('../app/components/TaskSheet.vue')

const schema = serializeSchema(defineSite({
  site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
  pages: { home: { de: '/' } },
  bricks: {
    notices: collection({
      label: 'Hinweise', max: 5, order: 'manual', listing: { title: 'text', detail: 'until' },
      fields: { text: f.text('Text', { translate: false }), until: f.date('Gilt bis', { optional: true }) },
      tasks: [{ id: 'add', label: 'Hinweis hinzufügen', kind: 'create' }],
    }),
  },
}))
const brick = schema.bricks.notices!

const fieldProps = { path: { type: String, required: true }, modelValue: { type: null, default: undefined } } as const
const input = (props: { path: string; modelValue: unknown }, emit: (event: 'update:modelValue', value: string) => void) =>
  h('input', { name: props.path, value: props.modelValue ?? '', onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) })
/** A field as a plain input named by its key. */
const FieldStub = defineComponent({ name: 'GinkoField', props: fieldProps, emits: ['update:modelValue'], setup: (props, { emit }) => () => input(props, emit) })

/** A field that also opens things over the form: a popover (as the Studio's lists, menus and pickers do) and the slash menu. */
const OverlayField = defineComponent({
  name: 'GinkoField',
  props: fieldProps,
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => props.path !== 'text' ? null : h('div', [
    input(props, emit),
    h(Popover, null, { default: () => [h(PopoverTrigger, null, { default: () => 'Liste öffnen' }), h(PopoverContent, { 'data-test': 'popover' }, { default: () => 'Liste' })] }),
    h(SlashMenu, { state: { open: true, items: [], selected: 0, choose: () => {} } as never }),
  ]),
})
const popover = () => document.querySelector<HTMLElement>('[data-test="popover"]')
/** Escape as the browser sends it; the returned event tells whether the page kept it from becoming a close request. */
function escape(on: Element) {
  const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  on.dispatchEvent(key)
  return key
}

function mountSheet(field = FieldStub) {
  return mount(TaskSheet, {
    props: { site: 'restaurant', brickKey: 'notices', brick, task: brick.tasks![0]!, main: 'de', locales: ['de'], schema },
    global: { stubs: { GinkoField: field } },
    attachTo: document.body,
  })
}

// reka-ui positions popups with it; happy-dom has none.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never

afterEach(() => {
  document.body.innerHTML = ''
  prefill.asked = 0
  ownProposal.value = null
  toasts.length = 0
  ops.createEntry.mockClear()
  ops.saveEntry.mockClear()
})

// Wrong behaviour caught (J4): a failed refresh of the prefill, long after the form loaded, replaced every field with
// "Deine Eingaben sind noch da", while the input was no longer visible and the next Escape offered "Verwerfen".
test('a failure after the form loaded leaves the fields and the typed input in place', async () => {
  const wrapper = mountSheet()
  answer({ data: {} })
  await flushPromises()
  await wrapper.get('input[name="text"]').setValue('Küche ab 18 Uhr')

  answer({ error: new Error('connection lost') })
  await flushPromises()
  expect((wrapper.get('input[name="text"]').element as HTMLInputElement).value).toBe('Küche ab 18 Uhr')
  expect(wrapper.text()).not.toContain('Deine Eingaben sind noch da')
  wrapper.unmount()
})

// Wrong behaviour caught: a first answer that failed left the sheet with an error and no way but closing it.
test('a prefill that fails to load says so and asks for it again with "Erneut versuchen"', async () => {
  vi.spyOn(console, 'error').mockImplementationOnce(() => {})
  const wrapper = mountSheet()
  answer({ error: new Error('connection lost') })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Das ließ sich nicht laden.')
  expect(wrapper.find('input[name="text"]').exists()).toBe(false)

  await wrapper.findAll('button').find((b) => b.text() === 'Erneut versuchen')!.trigger('click')
  await flushPromises()
  expect(prefill.asked).toBe(2)
  expect(wrapper.text()).toContain('Lädt …')
  answer({ data: { text: 'Heute Ruhetag' } })
  await flushPromises()
  expect((wrapper.get('input[name="text"]').element as HTMLInputElement).value).toBe('Heute Ruhetag')
  wrapper.unmount()
})

// Wrong behaviour caught (romi-1, J1, P4): the sheet is a modal <dialog> in the browser's top layer, and lists, menus,
// popovers and the slash menu opened from it rendered into <body> beneath it, unseen and not clickable.
test('what opens inside the sheet renders inside its <dialog>, above the page', async () => {
  const wrapper = mountSheet(OverlayField)
  answer({ data: {} })
  await flushPromises()
  await wrapper.findAll('button').find((b) => b.text() === 'Liste öffnen')!.trigger('click')
  await flushPromises()
  const dialog = wrapper.get('dialog').element
  const slash = [...document.querySelectorAll('[role="status"]')].find((p) => p.textContent === 'Nichts gefunden.')
  expect([popover() && dialog.contains(popover()), slash && dialog.contains(slash)]).toEqual([true, true])
  wrapper.unmount()
})

// Wrong behaviour caught (romi-2, J5): Escape that closed a popover in the sheet also reached the <dialog> as a close
// request and asked "Änderungen verwerfen?", one click from losing the input. After a few Escapes the browser closed the
// <dialog> on its own while the app still held the sheet open, and the task button did nothing until a reload.
test('Escape closes an open popover first, then asks before the typed input goes; a dialog the browser closes closes the sheet', async () => {
  const wrapper = mountSheet(OverlayField)
  answer({ data: {} })
  await flushPromises()
  await wrapper.get('input[name="text"]').setValue('Küche ab 18 Uhr')
  await wrapper.findAll('button').find((b) => b.text() === 'Liste öffnen')!.trigger('click')
  await flushPromises()

  const first = escape(popover()!)
  await flushPromises()
  expect([popover(), first.defaultPrevented, wrapper.text().includes('Änderungen verwerfen?')]).toEqual([null, true, false])

  const second = escape(wrapper.get('input[name="text"]').element)
  await flushPromises()
  expect([second.defaultPrevented, wrapper.text().includes('Änderungen verwerfen?')]).toEqual([true, true])
  expect(wrapper.emitted('close')).toBeUndefined()

  wrapper.get('dialog').element.dispatchEvent(new Event('close'))
  expect(wrapper.emitted('close')).toHaveLength(1)
  wrapper.unmount()
})

// Wrong behaviour caught: the browser closed the sheet itself while a save was on its way (a second back gesture), and
// when that save failed later nobody heard of it: the input was gone without a word.
test('a save on its way when the browser closes the sheet still reports its failure', async () => {
  const wrapper = mountSheet()
  answer({ data: {} })
  await flushPromises()
  await wrapper.get('input[name="text"]').setValue('Küche ab 18 Uhr')
  let fail!: (error: unknown) => void
  ops.createEntry.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  wrapper.get('dialog').element.dispatchEvent(new Event('close'))
  fail({ code: 'FORBIDDEN', message: 'Das darfst du nicht.' })
  await flushPromises()
  expect(wrapper.emitted('close')).toHaveLength(1)
  expect(toasts).toEqual(['Speichern läuft weiter. Ohne Verbindung wird es übernommen, sobald sie wieder da ist.', 'Nicht gespeichert: Das darfst du nicht.'])
  wrapper.unmount()
})

describe('own proposal', () => {
  const site = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
    pages: { home: { de: '/' } },
    bricks: { banner: single({ label: 'Banner', fields: { text: f.text('Text', { translate: false }), note: f.text('Notiz', { translate: false }) }, tasks: [{ id: 'say', label: 'Banner ändern', kind: 'edit', fields: ['text', 'note'] }] }) },
  }))
  const proposal = (status: 'open' | 'rejected', fits = true) =>
    ({ task: 'banner.say', status, fits, proposal: 'p1', fields: { text: 'Vorschlag' }, createdAt: 1_700_000_000_000, reason: 'Zu lang' })
  const entryOf = (text: string, rev = 1, note = 'Notiz') => ({ _id: 'b1', brick: 'banner', kind: 'single', order: 0, rev, lifeRev: rev, fieldRevs: {}, prints: {}, data: { text, note } })
  const mountEdit = () => {
    const brick = site.bricks.banner!
    const entry = entryOf('Gespeichert')
    return mount(TaskSheet, {
      props: { site: 'restaurant', brickKey: 'banner', brick, task: brick.tasks![0]!, entry: entry as never, main: 'de', locales: ['de'], schema: site },
      global: { stubs: { GinkoField: FieldStub, ProposalWithdraw: true } },
      attachTo: document.body,
    })
  }
  const text = (wrapper: ReturnType<typeof mountEdit>, name = 'text') => (wrapper.get(`input[name="${name}"]`).element as HTMLInputElement).value

  // Wrong behaviour caught: after the prefill query stopped, "Deinen Vorschlag wieder öffnen" did nothing.
  test('"Deinen Vorschlag wieder öffnen" puts the rejected values back in the form', async () => {
    ownProposal.value = proposal('rejected')
    const wrapper = mountEdit()
    answer({ data: { text: 'Gespeichert', note: 'Notiz' } })
    await flushPromises()
    expect(text(wrapper)).toBe('Gespeichert')
    const reopen = wrapper.findAll('button').find((b) => b.text() === 'Deinen Vorschlag wieder öffnen')!
    await reopen.trigger('click')
    expect(text(wrapper)).toBe('Vorschlag')
    wrapper.unmount()
  })

  // Wrong behaviour caught: after Zurückziehen the untouched form kept the withdrawn values, so Speichern sent them again.
  test('an untouched sheet goes back to the stored values when its open proposal goes away', async () => {
    ownProposal.value = proposal('open')
    const wrapper = mountEdit()
    answer({ data: { text: 'Gespeichert', note: 'Notiz' } })
    await flushPromises()
    expect(text(wrapper)).toBe('Vorschlag')
    ownProposal.value = null
    await flushPromises()
    expect(text(wrapper)).toBe('Gespeichert')
    wrapper.unmount()
  })

  // Wrong behaviour caught: the reset used the stored values from when the sheet opened, so a change someone else saved
  // meanwhile showed as the person's own edit, and Speichern would have undone it.
  test.each([
    ['is withdrawn', null],
    ['is decided', proposal('rejected')],
    ['stops fitting', proposal('open', false)],
  ])('an untouched sheet shows the current stored values, clean, when its open proposal %s', async (_, after) => {
    ownProposal.value = proposal('open')
    const wrapper = mountEdit()
    answer({ data: { text: 'Gespeichert', note: 'Notiz' } })
    await flushPromises()
    expect(text(wrapper)).toBe('Vorschlag')
    await wrapper.setProps({ entry: entryOf('Von anderen', 2, 'Neue Notiz') as never })
    ownProposal.value = after
    await flushPromises()
    expect(text(wrapper)).toBe('Von anderen')
    expect(text(wrapper, 'note')).toBe('Neue Notiz')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ops.saveEntry).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // Wrong behaviour caught: the reopened form started from the stored values of the time the sheet opened.
  test('"Deinen Vorschlag wieder öffnen" lays the rejected values over the current stored ones', async () => {
    ownProposal.value = proposal('rejected')
    const wrapper = mountEdit()
    answer({ data: { text: 'Gespeichert', note: 'Notiz' } })
    await flushPromises()
    await wrapper.setProps({ entry: entryOf('Gespeichert', 2, 'Neue Notiz') as never })
    await wrapper.findAll('button').find((b) => b.text() === 'Deinen Vorschlag wieder öffnen')!.trigger('click')
    expect(text(wrapper)).toBe('Vorschlag')
    expect(text(wrapper, 'note')).toBe('Neue Notiz')
    wrapper.unmount()
  })
})

describe('languages', () => {
  const bilingual = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: {
      dishes: collection({
        label: 'Speisen', max: 50, order: 'manual', listing: { title: 'name', detail: 'price' },
        fields: { name: f.text('Name'), price: f.money('Preis') },
        tasks: [{ id: 'add', label: 'Gericht hinzufügen', kind: 'create' }],
      }),
      hours: single({
        label: 'Öffnungszeiten',
        fields: { exceptions: f.list('Ausnahmen', { itemLabel: 'Ausnahme', max: 10, fields: { reason: f.text('Grund'), from: f.date('Ab', { optional: true }), closed: f.boolean('Geschlossen') } }) },
        tasks: [{ id: 'holiday', label: 'Betriebsurlaub', kind: 'edit', fields: ['exceptions'] }],
      }),
      lunch: single({
        label: 'Mittagsmenü',
        fields: { days: f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht'), allergens: f.choices('Allergene', { options: [{ value: 'a', label: 'Gluten' }, { value: 'g', label: 'Milch' }], askAgainWhen: 'dish' }) } }) },
        tasks: [{ id: 'week', label: 'Mittagsmenü dieser Woche', kind: 'edit', fields: ['days'] }],
      }),
    },
  }))
  const sheet = (brickKey: 'dishes' | 'hours' | 'lunch', entry?: unknown) => {
    const brick = bilingual.bricks[brickKey]!
    return mount(TaskSheet, {
      props: { site: 'restaurant', brickKey, brick, task: brick.tasks![0]!, entry: entry as never, main: 'de', locales: ['de', 'en'], schema: bilingual },
      attachTo: document.body,
    })
  }
  const value = (wrapper: ReturnType<typeof sheet>, id: string) => (wrapper.get(`#${id}`).element as HTMLInputElement).value
  const language = (wrapper: ReturnType<typeof sheet>, name: string) => wrapper.findAll('[role="group"] button, [role="radio"]').find((b) => b.text().startsWith(name))!
  /** The stored hours with one exception that has both languages. */
  const hours = () => {
    const data = { exceptions: [{ _id: 'r1', reason: { de: 'Betriebsurlaub', en: 'Company holiday' }, closed: true }] }
    return { data, entry: { _id: 'h1', brick: 'hours', kind: 'single', order: 0, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data } }
  }

  // Wrong behaviour caught (WD-4, WS-8, F6): a quick task stored German only, so a new dish showed German on the English
  // site; with a switch, input typed in one language must not land in the other or get lost on the way.
  test('"Gericht hinzufügen" stores the German and the English name in one Speichern', async () => {
    const wrapper = sheet('dishes')
    answer({ data: {} })
    await flushPromises()
    await wrapper.get('#f-name').setValue('Kürbissuppe')
    expect(language(wrapper, 'Englisch').text()).toContain('Übersetzung unvollständig')

    await language(wrapper, 'Englisch').trigger('click')
    await flushPromises()
    // Only texts to translate: the price applies to every language.
    expect([value(wrapper, 'f-name'), wrapper.find('#f-price').exists()]).toEqual(['', false])
    expect(wrapper.text()).toContain('Kürbissuppe')
    await wrapper.get('#f-name').setValue('Pumpkin soup')
    expect(language(wrapper, 'Englisch').text()).not.toContain('Übersetzung unvollständig')

    await language(wrapper, 'Deutsch').trigger('click')
    await flushPromises()
    expect(value(wrapper, 'f-name')).toBe('Kürbissuppe')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ops.createEntry).toHaveBeenCalledTimes(1)
    expect((ops.createEntry.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data.name).toEqual({ de: 'Kürbissuppe', en: 'Pumpkin soup' })
    wrapper.unmount()
  })

  // Wrong behaviour caught: the save went out with the German locale, and the server kept only the German of each text,
  // silently dropping the English typed in the sheet.
  test('an English reason typed in an edit task is saved with every language, not in German only', async () => {
    const stored = { exceptions: [{ _id: 'r1', reason: { de: 'Betriebsurlaub' }, closed: true }] }
    const wrapper = sheet('hours', { _id: 'h1', brick: 'hours', kind: 'single', order: 0, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: stored })
    answer({ data: stored })
    await flushPromises()
    await language(wrapper, 'Englisch').trigger('click')
    await flushPromises()
    await wrapper.get('#f-exceptions-r1-reason').setValue('Company holiday')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const [sent] = ops.saveEntry.mock.calls[0] as unknown as [Record<string, unknown> & { fields: { exceptions: { reason: unknown }[] } }]
    expect(['locale' in sent, sent.fields.exceptions[0]!.reason]).toEqual([false, { de: 'Betriebsurlaub', en: 'Company holiday' }])
    wrapper.unmount()
  })

  // Wrong behaviour caught: the English view does not show the allergens, so a changed German dish went out from there
  // without "Noch richtig?"; or a "Ja, stimmt" given in German was asked for again after a look at the English.
  test('"Noch richtig?" about a changed German dish is asked in German before an English Speichern, and only once', async () => {
    const stored = { days: [{ _id: 'd1', dish: { de: 'Kürbissuppe' }, allergens: ['g'] }] }
    const wrapper = sheet('lunch', { _id: 'l1', brick: 'lunch', kind: 'single', order: 0, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: stored })
    answer({ data: stored })
    await flushPromises()
    await wrapper.get('#f-days-d1-dish').setValue('Kürbiscremesuppe')
    await language(wrapper, 'Englisch').trigger('click')
    await flushPromises()
    await wrapper.get('#f-days-d1-dish').setValue('Pumpkin cream soup')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const confirm = () => wrapper.findAll('.check button').find((b) => b.text() === 'Ja, stimmt')
    expect([ops.saveEntry.mock.calls.length, value(wrapper, 'f-days-d1-dish'), document.activeElement === confirm()?.element]).toEqual([0, 'Kürbiscremesuppe', true])

    await confirm()!.trigger('click')
    await language(wrapper, 'Englisch').trigger('click')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const [sent] = ops.saveEntry.mock.calls[0] as unknown as [{ fields: { days: { dish: unknown }[] } }]
    expect(sent.fields.days[0]!.dish).toEqual({ de: 'Kürbiscremesuppe', en: 'Pumpkin cream soup' })
    wrapper.unmount()
  })

  // Wrong behaviour caught: an error on a column the English view does not show, or on the German text, stayed in the
  // English view: "Bitte prüfe die markierten Felder." with nothing marked, or the German error on the English input.
  // And an English error after a switch back to German showed on the German input.
  test.each([
    { path: 'exceptions.r1.from', from: 'Englisch', view: 'Deutsch', input: 'f-exceptions-r1-from' },
    { path: 'exceptions.r1.reason.de', from: 'Englisch', view: 'Deutsch', input: 'f-exceptions-r1-reason' },
    { path: 'exceptions.r1.reason.en', from: 'Deutsch', view: 'Englisch', input: 'f-exceptions-r1-reason' },
  ])('an error at $path, saved in the $from view, shows once in the $view view with its input focused', async ({ path, from, view, input }) => {
    const { data, entry } = hours()
    const wrapper = sheet('hours', entry)
    answer({ data })
    await flushPromises()
    await wrapper.get('#f-exceptions-r1-reason').setValue('Winterpause')
    if (from === 'Englisch') {
      await language(wrapper, 'Englisch').trigger('click')
      await flushPromises()
    }
    ops.saveEntry.mockRejectedValueOnce({ code: 'INVALID', message: 'Bitte prüfe die markierten Felder.', details: { errors: [{ path, code: 'FORMAT', message: 'Das passt so nicht.' }] } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect([language(wrapper, view).attributes('data-state'), document.activeElement?.id, wrapper.text().split('Das passt so nicht.').length - 1]).toEqual(['on', input, 1])
    wrapper.unmount()
  })

  // Wrong behaviour caught: a German text changed in the sheet left its English looking current, with no dot on
  // Englisch, although the save makes that English outdated.
  test('a German reason changed in the sheet marks its English as outdated until the English changes too', async () => {
    const { data, entry } = hours()
    const wrapper = sheet('hours', entry)
    answer({ data })
    await flushPromises()
    const gap = () => language(wrapper, 'Englisch').text().includes('Übersetzung unvollständig')
    expect(gap()).toBe(false)
    await wrapper.get('#f-exceptions-r1-reason').setValue('Winterpause')
    expect(gap()).toBe(true)

    await language(wrapper, 'Englisch').trigger('click')
    await flushPromises()
    const source = wrapper.get('[data-slot="translation-source"]')
    // No "Englisch stimmt noch": the sheet saves every language at once, and that confirmation belongs to Alles bearbeiten.
    expect([source.text().includes('Deutsch geändert seit Übersetzung'), source.findAll('button').length]).toEqual([true, 0])
    await wrapper.get('#f-exceptions-r1-reason').setValue('Winter break')
    expect([wrapper.text().includes('geändert seit Übersetzung'), gap()]).toEqual([false, false])
    wrapper.unmount()
  })
})

// The publish step (TEMPLATES 7.3, D60): what a create task and an edit of a live entry offer, and the save each button makes.
describe('publish step', () => {
  const posts = serializeSchema(defineSite({
    site: 'blog', name: 'Blog', url: 'https://blog.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
    pages: { home: { de: '/' } },
    bricks: {
      posts: collection({
        label: 'Beiträge', max: 50, order: 'manual', listing: { title: 'title' }, fields: { title: f.text('Titel', { translate: false }) },
        tasks: [{ id: 'write', label: 'Beitrag schreiben', kind: 'create' }, { id: 'fix', label: 'Beitrag ändern', kind: 'edit', fields: ['title'], pick: true }],
      }),
    },
  }))
  const mountStep = (key: 'posts', opts: { task?: number; approval?: boolean; entry?: unknown } = {}) => {
    const brick = posts.bricks[key]!
    return mount(TaskSheet, {
      props: { site: 'blog', brickKey: key, brick, task: brick.tasks![opts.task ?? 0]!, main: 'de', locales: ['de'], schema: posts, approval: opts.approval, entry: opts.entry as never },
      global: { stubs: { GinkoField: FieldStub } },
      attachTo: document.body,
    })
  }
  const footer = (wrapper: ReturnType<typeof mountStep>) => wrapper.get('footer').findAll('button').map((b) => b.text())
  const press = (wrapper: ReturnType<typeof mountStep>, label: string) => wrapper.get('footer').findAll('button').find((b) => b.text() === label)!.trigger('click')
  const open = async (wrapper: ReturnType<typeof mountStep>) => {
    answer({ data: {} })
    await flushPromises()
    await wrapper.get('input[name="title"]').setValue('Neuer Beitrag')
  }
  /** What the last save sent: the publish argument of the create call. */
  const sentPublish = () => (ops.createEntry.mock.calls.at(-1) as unknown as [{ publish?: { at?: number } }])[0].publish

  const stored = (state?: 'draft') => ({ _id: 'p1', brick: 'posts', kind: 'item', order: 1, rev: 1, lifeRev: 1, fieldRevs: {}, prints: {}, data: { title: 'Alt' }, ...(state ? { state } : {}) })

  // Wrong behaviour caught: a create keeps one "Speichern" that quietly makes a draft nobody finds, a quick edit of a
  // live entry has no one-press way online, or a draft's edit offers to publish it from the task.
  test.each([
    ['of a create task', 0, false, undefined, ['Veröffentlichen', 'Als Entwurf speichern', 'Später veröffentlichen', 'Abbrechen']],
    ['of a create task with needsApproval', 0, true, undefined, ['Zur Prüfung senden', 'Als Entwurf speichern', 'Später veröffentlichen', 'Abbrechen']],
    ['of an edit of a live entry', 1, false, 'live', ['Veröffentlichen', 'Speichern', 'Abbrechen']],
    ['of an edit of a draft', 1, false, 'draft', ['Speichern', 'Abbrechen']],
  ] as const)('the footer %s', async (_, task, approval, state, buttons) => {
    const wrapper = mountStep('posts', { task, approval, entry: state ? stored(state === 'draft' ? 'draft' : undefined) : undefined })
    answer({ data: {} })
    await flushPromises()
    expect(footer(wrapper)).toEqual(buttons)
    wrapper.unmount()
  })

  // Wrong behaviour caught: "Als Entwurf speichern" published, or "Veröffentlichen" left the entry a draft.
  test.each([
    ['Veröffentlichen', false, {}],
    ['Zur Prüfung senden', true, {}],
    ['Als Entwurf speichern', false, undefined],
    ['Als Entwurf speichern', true, undefined],
  ] as const)('"%s" (needsApproval: %s) creates with publish %j', async (label, approval, publish) => {
    const wrapper = mountStep('posts', { approval })
    await open(wrapper)
    await press(wrapper, label)
    await flushPromises()
    expect(ops.createEntry).toHaveBeenCalledTimes(1)
    expect(sentPublish()).toEqual(publish)
    expect(ops.createEntry.mock.calls[0]).toMatchObject([{ brick: 'posts', data: { title: 'Neuer Beitrag' }, timeZone: 'Europe/Vienna' }])
    wrapper.unmount()
  })

  // Wrong behaviour caught: the time was read in the browser's zone, or "Später veröffentlichen" went online at once.
  test.each([
    ['without approval', false, 'Planen'],
    ['with needsApproval (the proposal stores the time)', true, 'Zur Prüfung senden'],
  ] as const)('"Später veröffentlichen" asks for date and time in the site zone and sends them %s', async (_, approval, confirm) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-10-15T10:00:00Z'))
    try {
      const wrapper = mountStep('posts', { approval })
      await open(wrapper)
      expect(wrapper.find('input[type="datetime-local"]').exists()).toBe(false)
      await press(wrapper, 'Später veröffentlichen')
      await wrapper.get('input[type="datetime-local"]').setValue('2026-10-16T09:00')
      await press(wrapper, confirm)
      await flushPromises()
      expect(sentPublish()).toEqual({ at: Date.parse('2026-10-16T07:00:00Z') }) // 09:00 in Vienna, summer time
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  // Wrong behaviour caught: a time in the past reached the server, which refused it after the person had left the sheet.
  test('a planned time that has passed is named and nothing is sent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-10-15T10:00:00Z'))
    try {
      const wrapper = mountStep('posts')
      await open(wrapper)
      await press(wrapper, 'Später veröffentlichen')
      await wrapper.get('input[type="datetime-local"]').setValue('2026-10-14T09:00')
      await press(wrapper, 'Planen')
      await flushPromises()
      expect(wrapper.get('[data-test="publish-later"] [role="alert"]').text()).toBe('Bitte einen Zeitpunkt in der Zukunft wählen.')
      expect(ops.createEntry).not.toHaveBeenCalled()
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  // Wrong behaviour caught: Enter in the title field published the entry (implicit form submit hit the primary button).
  test('Enter in a field keeps the entry a draft', async () => {
    const wrapper = mountStep('posts')
    await open(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(ops.createEntry).toHaveBeenCalledTimes(1)
    expect(sentPublish()).toBeUndefined()
    wrapper.unmount()
  })

  // Wrong behaviour caught: with the time open, the big button still published at once next to a second, look-alike confirm.
  test('with the time open the footer has one primary, which plans', async () => {
    const wrapper = mountStep('posts')
    await open(wrapper)
    await press(wrapper, 'Später veröffentlichen')
    expect(footer(wrapper)).toEqual(['Planen', 'Als Entwurf speichern', 'Später veröffentlichen', 'Abbrechen'])
    expect(wrapper.get('[data-test="publish-later"]').findAll('button')).toHaveLength(0)
    wrapper.unmount()
  })

  // Wrong behaviour caught: a task's Veröffentlichen left the change waiting unpublished, or its Speichern (and Ctrl+S)
  // put it on the website.
  test.each([['Veröffentlichen', true], ['Speichern', undefined], ['Ctrl+S', undefined]] as const)('"%s" on an edit of a live entry saves with publish %j', async (how, publish) => {
    const wrapper = mountStep('posts', { task: 1, entry: stored() })
    await open(wrapper)
    if (how === 'Ctrl+S') await wrapper.get('form').trigger('keydown', { key: 's', ctrlKey: true })
    else await press(wrapper, how)
    await flushPromises()
    expect(ops.saveEntry).toHaveBeenCalledTimes(1)
    const [sent] = ops.saveEntry.mock.calls[0] as unknown as [{ publish?: true; fields: unknown }]
    expect([sent.fields, sent.publish]).toEqual([{ title: 'Neuer Beitrag' }, publish])
    wrapper.unmount()
  })

  // Wrong behaviour caught: Ctrl+S on the publish step put the entry on the website.
  test('Ctrl+S keeps the entry a draft', async () => {
    const wrapper = mountStep('posts')
    await open(wrapper)
    await wrapper.get('form').trigger('keydown', { key: 's', ctrlKey: true })
    await flushPromises()
    expect(ops.createEntry).toHaveBeenCalledTimes(1)
    expect(sentPublish()).toBeUndefined()
    wrapper.unmount()
  })
})

describe('"Gilt ab" of a task that asks for the day (D131)', () => {
  const menu = serializeSchema(defineSite({
    site: 'cafe', name: 'Café', url: 'https://cafe.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
    pages: { home: { de: '/' } },
    bricks: {
      items: collection({
        label: 'Karte', max: 50, order: 'manual', listing: { title: 'title' }, timeline: { public: ['title'] },
        fields: { title: f.text('Titel', { translate: false }) },
        tasks: [{ id: 'price', label: 'Preis ändern', kind: 'edit', fields: ['title'], pick: true, when: { from: 'ask' } }],
      }),
    },
  }))
  const brick = menu.bricks.items!
  const stored = { _id: 'i1', brick: 'items', kind: 'item', order: 1, rev: 4, lifeRev: 1, fieldRevs: {}, prints: {}, data: { title: 'Alt' } }
  const mountAsk = () => mount(TaskSheet, {
    props: { site: 'cafe', brickKey: 'items', brick, task: brick.tasks![0]!, main: 'de', locales: ['de'], schema: menu, entry: stored as never },
    global: { stubs: { GinkoField: FieldStub } },
    attachTo: document.body,
  })
  const footer = (wrapper: ReturnType<typeof mountAsk>) => wrapper.get('footer').findAll('button').map((b) => b.text())
  const press = (wrapper: ReturnType<typeof mountAsk>, label: string) => wrapper.get('footer').findAll('button').find((b) => b.text() === label)!.trigger('click')
  // Days are counted from the site's today, not the UTC one: near midnight they differ (E10).
  const inDays = (n: number) => addDays(todayIn('Europe/Vienna'), n)
  const ready = async (wrapper: ReturnType<typeof mountAsk>) => {
    answer({ data: {} })
    await flushPromises()
    await wrapper.get('input[name="title"]').setValue('Neu')
  }
  afterEach(() => { datedRows.value = [] })

  // Wrong behaviour caught: the field is missing, an empty field plans a change (instead of saving as today), or a day
  // goes out as a publish now, without `from`, or with "Speichern" still offered beside it (it would drop the day).
  test('empty saves as today; a day saves with from', async () => {
    const wrapper = mountAsk()
    await ready(wrapper)
    expect(wrapper.get('label[for="sheet-starts-on"]').text()).toContain('Gilt ab')
    expect(wrapper.text()).toContain('Leer: ab sofort')
    await press(wrapper, 'Veröffentlichen')
    await flushPromises()
    const [now] = ops.saveEntry.mock.calls[0] as unknown as [{ publish?: true; from?: string }]
    expect([now.publish, now.from]).toEqual([true, undefined])
    wrapper.unmount()

    ops.saveEntry.mockClear()
    const second = mountAsk()
    await ready(second)
    const day = inDays(10)
    await second.get('#sheet-starts-on').setValue(day)
    const [primary] = footer(second)
    expect(primary).toMatch(/^Ab .+ veröffentlichen$/)
    expect(footer(second)).not.toContain('Speichern')
    await press(second, primary!)
    await flushPromises()
    const [later] = ops.saveEntry.mock.calls[0] as unknown as [{ publish?: true; from?: string; fields: unknown }]
    expect([later.fields, later.publish, later.from]).toEqual([{ title: 'Neu' }, undefined, day])
    expect(second.emitted('close')).toHaveLength(1)
    second.unmount()
  })

  // Wrong behaviour caught: today goes to the server as a day (it refuses it after the person waited) instead of the
  // field saying so at once.
  test('today is refused in the field', async () => {
    const wrapper = mountAsk()
    await ready(wrapper)
    await wrapper.get('#sheet-starts-on').setValue(inDays(0))
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    expect(ops.saveEntry).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Der Tag muss nach heute liegen.')
    wrapper.unmount()
  })

  // Wrong behaviour caught (E1): a day typed by keyboard and not finished leaves the input empty, which read as "no day",
  // so the button, Enter or Ctrl+S put the value online now, although it was meant for a later day.
  test.each([['the button'], ['Enter'], ['Ctrl+S']] as const)('a day typed and not finished is refused (%s)', async (how) => {
    const wrapper = mountAsk()
    await ready(wrapper)
    const day = wrapper.get('#sheet-starts-on')
    Object.defineProperty(day.element, 'validity', { value: { badInput: true } })
    await day.trigger('keyup')
    if (how === 'the button') await press(wrapper, 'Veröffentlichen')
    else if (how === 'Enter') await wrapper.get('form').trigger('submit')
    else await wrapper.get('input[name="title"]').trigger('keydown', { key: 's', ctrlKey: true })
    await flushPromises()
    expect(ops.saveEntry).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Das ist kein Datum. Bitte wähle einen Tag oder leere das Feld.')
    expect(document.activeElement).toBe(day.element)
    wrapper.unmount()
  })

  // Wrong behaviour caught (H1.5): a date typed and not finished had no "Leeren" (the model is empty), so the person had
  // to delete each part of it by hand to save as today.
  test('"Leeren" empties a day typed and not finished', async () => {
    const wrapper = mountAsk()
    await ready(wrapper)
    const day = wrapper.get('#sheet-starts-on')
    Object.defineProperty(day.element, 'validity', { value: { badInput: true }, configurable: true })
    await day.trigger('keyup')
    await wrapper.findAll('button').find((b) => b.text() === 'Leeren')!.trigger('click')
    await flushPromises()
    expect([(day.element as HTMLInputElement).value, wrapper.text().includes('Das ist kein Datum.'), document.activeElement === day.element]).toEqual(['', false, true])
    wrapper.unmount()
  })

  // Wrong behaviour caught (E1): a reload brought back the typed values without their day, and the next press of the
  // button put them online now.
  test('the local copy brings the day back with the values', async () => {
    localStorage.clear()
    const day = inDays(10)
    const first = mountAsk()
    await ready(first)
    await first.get('#sheet-starts-on').setValue(day)
    first.unmount()

    const second = mountAsk()
    answer({ data: {} })
    await flushPromises()
    await second.findAll('button').find((b) => b.text() === 'Wiederherstellen')!.trigger('click')
    await flushPromises()
    expect([(second.get('input[name="title"]').element as HTMLInputElement).value, (second.get('#sheet-starts-on').element as HTMLInputElement).value]).toEqual(['Neu', day])
    second.unmount()
    localStorage.clear()
  })

  // Wrong behaviour caught (H1.2): restoring a copy without a day emptied the day already typed, so the next press put
  // the values online now.
  test('a local copy without a day keeps the day typed', async () => {
    localStorage.clear()
    const first = mountAsk()
    await ready(first)
    first.unmount()

    const second = mountAsk()
    answer({ data: {} })
    await flushPromises()
    const day = inDays(10)
    await second.get('#sheet-starts-on').setValue(day)
    await second.findAll('button').find((b) => b.text() === 'Wiederherstellen')!.trigger('click')
    await flushPromises()
    expect([(second.get('input[name="title"]').element as HTMLInputElement).value, (second.get('#sheet-starts-on').element as HTMLInputElement).value]).toEqual(['Neu', day])
    second.unmount()
    localStorage.clear()
  })

  // Wrong behaviour caught: someone plans over a waiting change of the same field without being told.
  test('a waiting change of a form field is announced', async () => {
    datedRows.value = [{ id: 'd1', from: '2099-03-05', fields: ['title'], values: { title: 'Später' }, by: null, at: 0, changedSince: [] }]
    const wrapper = mountAsk()
    await ready(wrapper)
    expect(wrapper.get('[data-test="dated-waiting"]').text()).toBe('Ab Donnerstag, 5. März: Titel.')
    wrapper.unmount()
  })

  // Wrong behaviour caught (E3): to change a planned price, the person had to know the day and retype every value, and
  // putting a field back to its online value left the old planned value in that day's change.
  test('"Bearbeiten" fills the day and the values, and the save replaces that day\'s change', async () => {
    const day = inDays(20)
    datedRows.value = [{ id: 'd1', from: day, fields: ['title'], values: { title: 'Später' }, by: null, at: 0, changedSince: [] }]
    const wrapper = mountAsk()
    answer({ data: {} })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Bearbeiten')!.trigger('click')
    await flushPromises()
    const day_ = wrapper.get('#sheet-starts-on').element as HTMLInputElement
    expect([(wrapper.get('input[name="title"]').element as HTMLInputElement).value, day_.value, document.activeElement === day_]).toEqual(['Später', day, true])
    await wrapper.get('input[name="title"]').setValue('Alt')
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    const [sent] = ops.saveEntry.mock.calls[0] as unknown as [{ fields: unknown; from?: string }]
    expect([sent.fields, sent.from]).toEqual([{ title: 'Alt' }, day])
    wrapper.unmount()
  })

  // Wrong behaviour caught (H1.6): a half-typed day stayed "not a date" after "Bearbeiten" put a day into the field, so
  // the save of that day was refused.
  test('"Bearbeiten" over a day typed and not finished saves with its day', async () => {
    const day = inDays(20)
    datedRows.value = [{ id: 'd1', from: day, fields: ['title'], values: { title: 'Später' }, by: null, at: 0, changedSince: [] }]
    const wrapper = mountAsk()
    answer({ data: {} })
    await flushPromises()
    const field = wrapper.get('#sheet-starts-on')
    Object.defineProperty(field.element, 'validity', { value: { badInput: true }, configurable: true })
    await field.trigger('keyup')
    Object.defineProperty(field.element, 'validity', { value: { badInput: false }, configurable: true })
    await wrapper.findAll('button').find((b) => b.text() === 'Bearbeiten')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Das ist kein Datum.')
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    expect(sent().map((s) => s.from)).toEqual([day])
    wrapper.unmount()
  })

  // Wrong behaviour caught (H1.4): after "Bearbeiten" another day silently planned a second change, and the person
  // believed the edited one was moved.
  test('after "Bearbeiten" another day says the edited change stays', async () => {
    const day = inDays(20)
    datedRows.value = [{ id: 'd1', from: day, fields: ['title'], values: { title: 'Später' }, by: null, at: 0, changedSince: [] }]
    const wrapper = mountAsk()
    answer({ data: {} })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Bearbeiten')!.trigger('click')
    await flushPromises()
    const status = () => wrapper.find('#sheet-starts-on-status')
    expect(status().exists()).toBe(false)
    await wrapper.get('#sheet-starts-on').setValue(inDays(21))
    const long = new Intl.DateTimeFormat('de', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
    expect([status().text(), status().attributes('role'), wrapper.get('#sheet-starts-on').attributes('aria-invalid')]).toEqual([`Die geplante Änderung ab ${long} bleibt bestehen. Das hier wird eine zweite Änderung.`, 'status', 'false'])
    await wrapper.get('#sheet-starts-on').setValue(day)
    expect(status().exists()).toBe(false)
    await wrapper.get('#sheet-starts-on').setValue('')
    expect(status().exists()).toBe(false)
    wrapper.unmount()
  })

  // Wrong behaviour caught (E4): the sheet of a draft (an entry taken offline) said nothing of its planned changes.
  test('the sheet of a draft announces its planned changes', async () => {
    datedRows.value = [{ id: 'd1', from: '2099-03-05', fields: ['title'], values: { title: 'Später' }, by: null, at: 0, changedSince: [] }]
    const wrapper = mount(TaskSheet, {
      props: { site: 'cafe', brickKey: 'items', brick, task: brick.tasks![0]!, main: 'de', locales: ['de'], schema: menu, entry: { ...stored, state: 'draft' } as never },
      global: { stubs: { GinkoField: FieldStub } },
      attachTo: document.body,
    })
    answer({ data: {} })
    await flushPromises()
    expect(wrapper.get('[data-test="dated-waiting"]').text()).toBe('Ab Donnerstag, 5. März: Titel.')
    wrapper.unmount()
  })

  // Wrong behaviour caught (E5): under approval the button said "Zur Prüfung senden" without the day, so staff could
  // not tell the request was for a later day, or the day was dropped from the call.
  test('under approval the button names the day and the request carries it', async () => {
    const wrapper = mount(TaskSheet, {
      props: { site: 'cafe', brickKey: 'items', brick, task: brick.tasks![0]!, main: 'de', locales: ['de'], schema: menu, entry: stored as never, approval: true },
      global: { stubs: { GinkoField: FieldStub } },
      attachTo: document.body,
    })
    await ready(wrapper)
    const day = inDays(10)
    await wrapper.get('#sheet-starts-on').setValue(day)
    const [primary] = footer(wrapper)
    expect(primary).toMatch(/^Ab .+ zur Prüfung senden$/)
    await press(wrapper, primary!)
    await flushPromises()
    const [sent] = ops.saveEntry.mock.calls[0] as unknown as [{ from?: string; publish?: true }]
    expect([sent.from, sent.publish]).toEqual([day, undefined])
    wrapper.unmount()
  })

  // Wrong behaviour caught (E6): a day set and nothing changed (or only values the day already holds) closed the sheet
  // with "Gespeichert. Auf der Website ab …", so the person believed a change was planned that was not.
  test.each([
    ['no field changed', false],
    ['the server answers that the day already holds the values', true],
  ] as const)('a day with nothing new keeps the sheet open and says so: %s', async (_case, typed) => {
    if (typed) ops.saveEntry.mockImplementationOnce(async () => ({ rev: 4, unchanged: true }) as never)
    const wrapper = mountAsk()
    // The prefill holds the stored values of the task's fields.
    answer({ data: { title: 'Alt' } })
    await flushPromises()
    if (typed) await wrapper.get('input[name="title"]').setValue('Später')
    await wrapper.get('#sheet-starts-on').setValue(inDays(10))
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    expect(ops.saveEntry).toHaveBeenCalledTimes(typed ? 1 : 0)
    expect(wrapper.text()).toContain('Es ist noch nichts geändert. Ändere zuerst einen Wert.')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('#sheet-starts-on').element)
    wrapper.unmount()
  })

  // Wrong behaviour caught (E8): a value typed while a save with a day was on its way was lost, because the form goes
  // back to the entry when that save lands.
  test('the fields cannot be typed in while a save with a day is on its way', async () => {
    let land!: (value: unknown) => void
    ops.saveEntry.mockImplementationOnce(() => new Promise((resolve) => { land = resolve }) as never)
    const wrapper = mountAsk()
    await ready(wrapper)
    await wrapper.get('#sheet-starts-on').setValue(inDays(10))
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    const fields = () => wrapper.get('[data-test="sheet-fields"]').attributes('inert')
    expect(fields()).toBeDefined()
    land({ rev: 4 })
    await flushPromises()
    expect(fields()).toBeUndefined()
    wrapper.unmount()
  })

  // Wrong behaviour caught (E10): with a day set, Enter in a field or Ctrl+S saved the input without its day (as an
  // unpublished change, or online now), instead of leaving the plan to the button that names the day.
  test.each([['Enter'], ['Ctrl+S']] as const)('%s with a day saves nothing and points to the button', async (how) => {
    const wrapper = mountAsk()
    await ready(wrapper)
    await wrapper.get('#sheet-starts-on').setValue(inDays(10))
    if (how === 'Enter') await wrapper.get('form').trigger('submit')
    else await wrapper.get('input[name="title"]').trigger('keydown', { key: 's', ctrlKey: true })
    await flushPromises()
    expect(ops.saveEntry).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('sheet-primary')
    wrapper.unmount()
  })

  // Wrong behaviour caught (E10): "Meine Eingaben speichern" after a conflict sent the input again without its day, so
  // the value went online now.
  test('the conflict answer saves again with the day', async () => {
    ops.saveEntry.mockImplementationOnce(async () => { throw { code: 'CHANGED_SINCE', message: 'Geändert.', details: { data: { title: 'Fremd' }, rev: 5, conflicts: ['title'] } } })
    const wrapper = mountAsk()
    await ready(wrapper)
    const day = inDays(10)
    await wrapper.get('#sheet-starts-on').setValue(day)
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Meine Eingaben speichern')!.trigger('click')
    await flushPromises()
    const [, again] = ops.saveEntry.mock.calls as unknown as [unknown, [{ from?: string; publish?: true; baseRev: number; fields: unknown }]]
    expect([again[0].from, again[0].publish, again[0].baseRev, again[0].fields]).toEqual([day, undefined, 5, { title: 'Neu' }])
    wrapper.unmount()
  })

  // H1: a conflict answer saves through the sheet's own step, which reads the day field at that moment, never the day of
  // the first try.
  const clash = (data: Record<string, unknown> = { title: 'Fremd' }, conflicts = ['title']) =>
    ops.saveEntry.mockImplementationOnce(async () => { throw { code: 'CHANGED_SINCE', message: 'Geändert.', details: { data, rev: 5, conflicts } } })
  const keepMine = (wrapper: ReturnType<typeof mountAsk>) => wrapper.findAll('button').find((b) => b.text() === 'Meine Eingaben speichern')!.trigger('click')
  type Sent = { from?: string; publish?: true; baseRev: number }
  const sent = (): Sent[] => ops.saveEntry.mock.calls.map((c) => (c as unknown as [Sent])[0])

  // Wrong behaviour caught (H1 a, b): "Meine Eingaben speichern" repeated the first try, so a day typed after the conflict
  // was dropped and the value went online now while the field showed the day; or a day cleared after it was still sent.
  test.each([
    ['a day set after the conflict is sent', '', 10],
    ['a day cleared after the conflict is not sent', 10, ''],
  ] as const)('the conflict answer reads the day field: %s', async (_case, first, then) => {
    clash()
    const wrapper = mountAsk()
    await ready(wrapper)
    if (first !== '') await wrapper.get('#sheet-starts-on').setValue(inDays(first))
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    await wrapper.get('#sheet-starts-on').setValue(then === '' ? '' : inDays(then))
    await keepMine(wrapper)
    await flushPromises()
    const again = sent()[1]!
    expect([again.from, again.publish, again.baseRev]).toEqual(then === '' ? [undefined, true, 5] : [inDays(then), undefined, 5])
    wrapper.unmount()
  })

  // Wrong behaviour caught (H1 c): the conflict answer saved past a day typed and not finished, as "no day".
  test('the conflict answer refuses a day typed and not finished', async () => {
    clash()
    const wrapper = mountAsk()
    await ready(wrapper)
    await press(wrapper, 'Veröffentlichen')
    await flushPromises()
    const day = wrapper.get('#sheet-starts-on')
    Object.defineProperty(day.element, 'validity', { value: { badInput: true } })
    await day.trigger('keyup')
    await keepMine(wrapper)
    await flushPromises()
    expect(ops.saveEntry).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Das ist kein Datum. Bitte wähle einen Tag oder leere das Feld.')
    wrapper.unmount()
  })

  // Wrong behaviour caught (H1 d): a restored local copy whose field someone saved meanwhile opens the conflict, and the
  // answer saved the copy's values without its day (online now).
  test('the conflict answer after restoring a local copy keeps its day', async () => {
    localStorage.clear()
    const day = inDays(10)
    const first = mountAsk()
    await ready(first)
    await first.get('#sheet-starts-on').setValue(day)
    first.unmount()

    const second = mount(TaskSheet, {
      props: { site: 'cafe', brickKey: 'items', brick, task: brick.tasks![0]!, main: 'de', locales: ['de'], schema: menu, entry: { ...stored, rev: 5, fieldRevs: { title: 5 }, data: { title: 'Fremd' } } as never },
      global: { stubs: { GinkoField: FieldStub } },
      attachTo: document.body,
    })
    answer({ data: {} })
    await flushPromises()
    await second.findAll('button').find((b) => b.text() === 'Wiederherstellen')!.trigger('click')
    await flushPromises()
    await keepMine(second)
    await flushPromises()
    expect(sent().map((s) => [s.from, s.publish, s.baseRev])).toEqual([[day, undefined, 5]])
    second.unmount()
    localStorage.clear()
  })

  // Wrong behaviour caught (H1 e): "Beides behalten" repeated the first try, as "Meine Eingaben speichern" did (a).
  test('"Beides behalten" reads the day field too', async () => {
    const listed = serializeSchema(defineSite({
      site: 'cafe', name: 'Café', url: 'https://cafe.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR',
      pages: { home: { de: '/' } },
      bricks: {
        items: collection({
          label: 'Karte', max: 50, order: 'manual', listing: { title: 'title' },
          fields: { title: f.text('Titel', { translate: false }), sides: f.list('Beilagen', { of: { name: f.text('Name', { translate: false }) } }) },
          tasks: [{ id: 'sides', label: 'Beilagen ändern', kind: 'edit', fields: ['sides'], pick: true, when: { from: 'ask' } }],
        }),
      },
    }))
    const salad = { _id: 'r1', name: 'Salat' }
    // The list as typed: the stored row and one row more.
    const ListStub = defineComponent({ props: fieldProps, emits: ['update:modelValue'], setup: (props, { emit }) => () => h('input', { name: props.path, onInput: (e: Event) => emit('update:modelValue', [salad, { _id: 'r3', name: (e.target as HTMLInputElement).value }]) }) })
    clash({ title: 'Alt', sides: [salad, { _id: 'r2', name: 'Suppe' }] }, ['sides'])
    const wrapper = mount(TaskSheet, {
      props: { site: 'cafe', brickKey: 'items', brick: listed.bricks.items!, task: listed.bricks.items!.tasks![0]!, main: 'de', locales: ['de'], schema: listed, entry: { ...stored, data: { title: 'Alt', sides: [salad] } } as never },
      global: { stubs: { GinkoField: ListStub } },
      attachTo: document.body,
    })
    answer({ data: { sides: [salad] } })
    await flushPromises()
    await wrapper.get('input[name="sides"]').setValue('Knödel')
    await press(wrapper, 'Veröffentlichen')
    await flushPromises()
    await wrapper.get('#sheet-starts-on').setValue(inDays(10))
    await wrapper.findAll('button').find((b) => b.text() === 'Beides behalten')!.trigger('click')
    await flushPromises()
    const again = sent()[1]!
    expect([again.from, again.publish, again.baseRev]).toEqual([inDays(10), undefined, 5])
    wrapper.unmount()
  })

  // Wrong behaviour caught (E10): in the English view the day field is not shown, and a press there put the German
  // input online now instead of on its day.
  const both = serializeSchema(defineSite({
    site: 'cafe', name: 'Café', url: 'https://cafe.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: {
      items: collection({
        label: 'Karte', max: 50, order: 'manual', listing: { title: 'name' },
        fields: { name: f.text('Name'), price: f.money('Preis') },
        tasks: [{ id: 'price', label: 'Preis ändern', kind: 'edit', fields: ['name', 'price'], pick: true, when: { from: 'ask' } }],
      }),
    },
  }))
  /** A sheet in German and English, the price typed (or not) and the day set in German, then the English view. */
  const inEnglish = async (price: string | undefined, day: string) => {
    const items = both.bricks.items!
    const wrapper = mount(TaskSheet, {
      props: { site: 'cafe', brickKey: 'items', brick: items, task: items.tasks![0]!, main: 'de', locales: ['de', 'en'], schema: both, entry: { ...stored, data: { name: { de: 'Suppe', en: 'Soup' }, price: { amount: 900 } } } as never },
      global: { stubs: { GinkoField: FieldStub } },
      attachTo: document.body,
    })
    answer({ data: { name: { de: 'Suppe', en: 'Soup' }, price: { amount: 900 } } })
    await flushPromises()
    if (price !== undefined) await wrapper.get('input[name="price"]').setValue(price)
    await wrapper.get('#sheet-starts-on').setValue(day)
    await wrapper.findAll('[role="group"] button, [role="radio"]').find((b) => b.text().startsWith('Englisch'))!.trigger('click')
    await flushPromises()
    return wrapper
  }

  test('the second language view keeps the day', async () => {
    const day = inDays(10)
    const wrapper = await inEnglish('990', day)
    expect(wrapper.find('#sheet-starts-on').exists()).toBe(false)
    const [primary] = footer(wrapper)
    expect(primary).toMatch(/^Ab .+ veröffentlichen$/)
    await press(wrapper, primary!)
    await flushPromises()
    const [sent] = ops.saveEntry.mock.calls[0] as unknown as [{ from?: string; publish?: true }]
    expect([sent.from, sent.publish]).toEqual([day, undefined])
    wrapper.unmount()
  })

  // Wrong behaviour caught (H1.7): in the English view a refused day said nothing, because the day field with its message
  // shows only in German and the focus went nowhere.
  test.each([
    ['today', '990', 0, 'Der Tag muss nach heute liegen.'],
    ['nothing changed', undefined, 10, 'Es ist noch nichts geändert. Ändere zuerst einen Wert.'],
  ] as const)('a refused day in the English view goes back to German: %s', async (_case, price, days, message) => {
    const wrapper = await inEnglish(price, inDays(days))
    await press(wrapper, footer(wrapper)[0]!)
    await flushPromises()
    expect(ops.saveEntry).not.toHaveBeenCalled()
    expect([wrapper.text().includes(message), document.activeElement?.id]).toEqual([true, 'sheet-starts-on'])
    wrapper.unmount()
  })

  // Wrong behaviour caught (E10): the earliest day came from the browser's (or UTC's) today, so shortly after midnight
  // at the site the site's today passed as a later day, and "Morgen" set the site's today.
  test('the earliest day is tomorrow in the site\'s zone, whatever the browser\'s zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 23:30 UTC on 25 November is 00:30 on 26 November in Vienna.
    vi.setSystemTime(new Date('2026-11-25T23:30:00Z'))
    try {
      const wrapper = mountAsk()
      await ready(wrapper)
      await wrapper.get('#sheet-starts-on').setValue('2026-11-26')
      await press(wrapper, footer(wrapper)[0]!)
      await flushPromises()
      expect(ops.saveEntry).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Der Tag muss nach heute liegen.')
      await wrapper.findAll('button').find((b) => b.text() === 'Morgen')!.trigger('click')
      expect((wrapper.get('#sheet-starts-on').element as HTMLInputElement).value).toBe('2026-11-27')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
