// @vitest-environment happy-dom
// The quick-task sheet (TaskSheet) with the real form engine and the German catalog. Nuxt's auto-imports become
// globals; Convex, the writes and the toast are replaced, and each field is a plain input unless a test needs the real
// fields (languages).
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { collection, defineSite, f, single } from '@lupinum/ginko'
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
// The writes record what the form sends.
const ops = { opId: () => crypto.randomUUID(), createEntry: vi.fn(async () => ({ entry: 'new1' })), saveEntry: vi.fn(async () => ({ rev: 2 })) }
vi.stubGlobal('useOps', () => ops)

/**
 * The prefill query as Convex serves it: while the sheet asks for it (args, not 'skip') it is live and gets the
 * server's answers and errors; a skipped query gets nothing, and asking again runs it again.
 */
const prefill = { live: false, asked: 0, data: shallowRef<unknown>(), error: shallowRef<unknown>() }
vi.stubGlobal('useConvexQuery', (fn: unknown, args: unknown) => {
  if (String(fn) !== 'tasks.prefill') return { data: ref(undefined), error: ref(undefined) }
  watch(() => toValue(args), (now) => {
    prefill.live = now !== 'skip'
    prefill.data.value = undefined
    prefill.error.value = undefined
    if (prefill.live) prefill.asked++
  }, { immediate: true, flush: 'sync' })
  return { data: prefill.data, error: prefill.error }
})
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
      label: 'Hinweise', max: 5, order: 'manual',
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

describe('languages', () => {
  const bilingual = serializeSchema(defineSite({
    site: 'restaurant', name: 'Restaurant', url: 'https://restaurant.test', timeZone: 'Europe/Vienna', locales: ['de', 'en'], currency: 'EUR',
    pages: { home: { de: '/', en: '/en' } },
    bricks: {
      dishes: collection({
        label: 'Speisen', max: 50, order: 'manual',
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
        fields: { days: f.list('Tage', { itemLabel: 'Tag', max: 5, fields: { dish: f.text('Gericht'), allergens: f.choices('Allergene', { options: [{ value: 'a', label: 'Gluten' }, { value: 'g', label: 'Milch' }] }) } }) },
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
