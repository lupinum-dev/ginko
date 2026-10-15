// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, reactive, ref, shallowRef, type Component } from 'vue'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { BLOCKERS, GINKO_ASSETS, TRANSLATION, type GinkoAssets, type TranslationState } from '@lupinum/ginko-editor'
import type { Field, Json } from '@lupinum/ginko'
import FieldFrame from '../app/components/fields/FieldFrame.vue'
import GinkoField from '../app/components/fields/GinkoField.vue'
import GinkoFieldDate from '../app/components/fields/GinkoFieldDate.vue'
import GinkoFieldList from '../app/components/fields/GinkoFieldList.vue'
import GinkoFieldRef from '../app/components/fields/GinkoFieldRef.vue'
import { REFS, type RefOptions } from '../app/components/fields/refs'

// Only the toast (a third-party popup) is replaced; it records what the list asks it to show.
const shown: { text: string; action?: { label: string; run: () => void } }[] = []
vi.mock('../app/composables/useToast', () => ({
  useToast: () => ({ show: (text: string, options: { action?: { label: string; run: () => void } } = {}) => { shown.push({ text, action: options.action }) } }),
}))

beforeAll(() => {
  // reka-ui positions popups with these; happy-dom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => { shown.length = 0; document.body.innerHTML = '' })

describe('FieldFrame', () => {
  test('wires the label, the hint and the error to the control', () => {
    const wrapper = mount(FieldFrame, {
      props: { id: 'f-price', label: 'Preis', hint: 'In Euro.', optional: true, errors: ['Bitte einen Betrag angeben.'] },
      slots: { default: `<template #default="{ describedBy, invalid }"><input id="f-price" :aria-describedby="describedBy" :aria-invalid="invalid"></template>` },
    })
    expect(wrapper.get('label').attributes('for')).toBe('f-price')
    expect(wrapper.get('label').text()).toBe('Preis (optional)')
    expect(wrapper.get('#f-price-hint').text()).toBe('In Euro.')
    const error = wrapper.get('#f-price-err')
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('Bitte einen Betrag angeben.')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('f-price-hint f-price-err')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
  })
})

const speisen = [{ id: 'k1', title: 'Schnitzel' }, { id: 'k2', title: 'Gulasch' }, { id: 'k3', title: 'Strudel' }]
function refs(present = speisen): RefOptions {
  return { options: () => computed(() => present), brickLabel: () => 'Speisen' }
}
const refField = (extra: Partial<Extract<Field, { type: 'ref' }>> = {}) => ({ type: 'ref', label: 'Gericht', to: 'dishes', ...extra }) as Extract<Field, { type: 'ref' }>

function mountRef(field: Extract<Field, { type: 'ref' }>, modelValue: Json | undefined, present?: typeof speisen) {
  return mount(GinkoFieldRef, {
    props: { id: 'f-ref', field, modelValue, invalid: false },
    global: { provide: { [REFS as symbol]: refs(present) } },
    attachTo: document.body,
  })
}
const pickerItems = () => [...document.body.querySelectorAll<HTMLElement>('[data-slot="command-item"]')]

describe('ref picker', () => {
  test('a single ref lists the target entries by title and stores the chosen ID', async () => {
    const wrapper = mountRef(refField(), undefined)
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()
    expect(pickerItems().map((i) => i.textContent?.trim())).toEqual(['Schnitzel', 'Gulasch', 'Strudel'])
    pickerItems()[1]!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([['k2']])
    wrapper.unmount()
  })

  test('a multiple ref adds to the list, does not offer a chosen entry twice and stops at max', async () => {
    const wrapper = mountRef(refField({ multiple: true, max: 2 }), ['k1'])
    expect(wrapper.text()).toContain('Schnitzel')
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()
    expect(pickerItems().map((i) => i.textContent?.trim())).toEqual(['Gulasch', 'Strudel'])
    pickerItems()[0]!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[['k1', 'k2']]])

    await wrapper.setProps({ modelValue: ['k1', 'k2'] })
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Höchstens 2')
    wrapper.unmount()
  })

  test('an entry that is gone says so and can be removed', async () => {
    const single = mountRef(refField(), 'weg')
    expect(single.text()).toContain('Eintrag gibt es nicht mehr')
    await single.findAll('button').find((b) => b.text() === 'Entfernen')!.trigger('click')
    expect(single.emitted('update:modelValue')).toEqual([[undefined]])
    single.unmount()

    const several = mountRef(refField({ multiple: true }), ['k1', 'weg'])
    expect(several.text()).toContain('Eintrag gibt es nicht mehr')
    await several.get('[aria-label="Eintrag gibt es nicht mehr entfernen"]').trigger('click')
    expect(several.emitted('update:modelValue')).toEqual([[['k1']]])
    several.unmount()
  })
})

describe('list rows', () => {
  const field = {
    type: 'list', label: 'Ausnahmen', itemLabel: 'Ausnahme', max: 10,
    of: { reason: { type: 'text', label: 'Grund' }, closed: { type: 'boolean', label: 'Geschlossen' }, from1: { type: 'time', label: 'Von', optional: true, showWhen: { field: 'closed', not: true } } },
  } as Extract<Field, { type: 'list' }>
  const rowsOf = (...reasons: string[]) => reasons.map((reason, i) => ({ _id: `r${i}`, reason, closed: false }))

  function host(initial: Json, opts: { locale?: string; translation?: TranslationState } = {}) {
    const value = shallowRef<Json | undefined>(initial)
    const Host = defineComponent({
      setup: () => () => h(GinkoFieldList, { id: 'f-ex', field, modelValue: value.value, path: 'ex', locale: opts.locale ?? 'de', locales: ['de', 'en'], issues: [], 'onUpdate:modelValue': (v: Json | undefined) => { value.value = v } }),
    })
    return { wrapper: mount(Host, { global: { provide: opts.translation ? { [TRANSLATION as symbol]: opts.translation } : {} } }), value }
  }

  test('removing a row offers "Rückgängig", which puts the row back at the same position', async () => {
    const { wrapper, value } = host(rowsOf('Winterpause', 'Hochzeit', 'Ruhetag'))
    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['Winterpause', 'Hochzeit', 'Ruhetag'])
    await wrapper.get('[aria-label="Hochzeit entfernen"]').trigger('click')
    expect((value.value as { reason: string }[]).map((r) => r.reason)).toEqual(['Winterpause', 'Ruhetag'])
    expect(shown.at(-1)?.text).toBe('Hochzeit entfernt')
    expect(shown.at(-1)?.action?.label).toBe('Rückgängig')

    shown.at(-1)!.action!.run()
    await flushPromises()
    expect((value.value as { reason: string }[]).map((r) => r.reason)).toEqual(['Winterpause', 'Hochzeit', 'Ruhetag'])
    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['Winterpause', 'Hochzeit', 'Ruhetag'])
  })

  test('the add button names the row, and a column with showWhen hides on a closed row', async () => {
    const { wrapper } = host([{ _id: 'a', reason: 'Winterpause', closed: true }, { _id: 'b', reason: 'Sonderzeit', closed: false }])
    expect(wrapper.findAll('button').some((b) => b.text() === 'Ausnahme hinzufügen')).toBe(true)
    const [closed, open] = wrapper.findAll('li')
    expect(closed!.find('input[type="time"]').exists()).toBe(false)
    expect(open!.find('input[type="time"]').exists()).toBe(true)
  })

  // Wrong behaviour caught: a row added on the English tab can get neither its German texts nor its pictures there,
  // so the form can never be saved; and a row removed there would remove the German row too (rows are shared).
  test('in another language rows are added, removed and moved in the main language', () => {
    const translation: TranslationState = { state: () => 'fine', source: () => '', confirm: vi.fn(), mainName: () => 'Deutsch', missingNote: () => '', changesUrl: () => undefined, address: () => undefined }
    const { wrapper } = host(rowsOf('Winterpause'), { locale: 'en', translation })
    expect(wrapper.findAll('button').some((b) => b.text() === 'Ausnahme hinzufügen')).toBe(false)
    expect(wrapper.text()).toContain('Zeilen hinzufügen, entfernen und verschieben kannst du auf Deutsch.')
    expect(wrapper.find('[aria-label="Winterpause entfernen"]').exists()).toBe(false)
  })
})

// Wrong behaviour caught: translating a lunch dish asked "Noch richtig?" about its allergens and blocked Speichern, and
// the English view could add a row that lacks its required German dish.
describe('a list in a foreign language', () => {
  const days = {
    type: 'list', label: 'Tage', itemLabel: 'Tag', max: 5,
    of: { dish: { type: 'text', label: 'Gericht' }, allergens: { type: 'choices', label: 'Allergene', options: [{ value: 'a', label: 'Gluten' }, { value: 'g', label: 'Milch' }] } },
  } as Extract<Field, { type: 'list' }>
  const stored = [{ _id: 'd1', dish: { de: 'Kürbissuppe' }, allergens: ['g'] }]

  test.each<{ locale: string; typed: Record<string, string>; allergens: boolean; buttons: boolean; blocked: boolean }>([
    { locale: 'en', typed: { de: 'Kürbissuppe', en: 'Pumpkin soup' }, allergens: false, buttons: false, blocked: false },
    { locale: 'de', typed: { de: 'Kürbiscremesuppe' }, allergens: true, buttons: true, blocked: true },
  ])('$locale: allergens shown $allergens, row buttons $buttons, "Noch richtig?" $blocked', async ({ locale, typed, allergens, buttons, blocked }) => {
    const blockers = reactive(new Map<string, string>())
    const value = shallowRef<Json | undefined>(stored)
    const Host = defineComponent({
      setup: () => () => h(GinkoFieldList, { id: 'f-days', field: days, modelValue: value.value, baseline: stored, path: 'days', locale, locales: ['de', 'en'], issues: [], 'onUpdate:modelValue': (v: Json | undefined) => { value.value = v } }),
    })
    const wrapper = mount(Host, { global: { provide: { [BLOCKERS as symbol]: blockers } } })
    value.value = [{ ...stored[0]!, dish: typed }]
    await flushPromises()
    expect([wrapper.text().includes('Gericht'), wrapper.text().includes('Allergene')]).toEqual([true, allergens])
    expect([wrapper.find('[data-remove]').exists(), wrapper.find('[data-add]').exists()]).toEqual([buttons, buttons])
    expect(blockers.size > 0).toBe(blocked)
  })
})

// Wrong behaviour caught: the pressed button went away with what it removed and the focus fell to <body>, outside the
// quick-task sheet, so keyboard and screen-reader users lost their place (WCAG 2.4.3).
describe('the focus after a remove button goes', () => {
  const list = { type: 'list', label: 'Ausnahmen', itemLabel: 'Ausnahme', max: 10, of: { reason: { type: 'text', label: 'Grund' } } } as Extract<Field, { type: 'list' }>
  const rows = (...reasons: string[]) => reasons.map((reason, i) => ({ _id: `r${i}`, reason }))
  const listProps = { id: 'f-ex', field: list, path: 'ex', locale: 'de', locales: ['de'], issues: [] }
  /** The field with its value fed back, as a form does. */
  function hosted(component: Component, props: Record<string, unknown>, initial: Json) {
    const value = shallowRef<Json | undefined>(initial)
    const Host = defineComponent({ setup: () => () => h(component, { ...props, modelValue: value.value, 'onUpdate:modelValue': (v: Json | undefined) => { value.value = v } }) })
    return mount(Host, { global: { provide: { [REFS as symbol]: refs() } }, attachTo: document.body })
  }
  const byText = (text: string) => () => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
  const byLabel = (label: string) => () => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
  const byId = (id: string) => () => document.getElementById(id)!

  test.each([
    { case: 'Leeren in an optional date', component: GinkoFieldDate, props: { id: 'f-day', invalid: false, optional: true }, value: '2026-10-20', press: byText('Leeren'), focus: byId('f-day') },
    { case: 'Leeren in an optional ref', component: GinkoFieldRef, props: { id: 'f-ref', field: refField({ optional: true }), invalid: false }, value: 'k1', press: byText('Leeren'), focus: byId('f-ref') },
    { case: 'Entfernen of an entry that is gone', component: GinkoFieldRef, props: { id: 'f-ref', field: refField(), invalid: false }, value: 'weg', press: byText('Entfernen'), focus: byId('f-ref') },
    { case: 'a chip of a full ref list', component: GinkoFieldRef, props: { id: 'f-ref', field: refField({ multiple: true, max: 2 }), invalid: false }, value: ['k1', 'k2'], press: byLabel('Schnitzel entfernen'), focus: byId('f-ref') },
    { case: 'the first of two list rows', component: GinkoFieldList, props: listProps, value: rows('Winterpause', 'Hochzeit'), press: byLabel('Winterpause entfernen'), focus: byLabel('Hochzeit entfernen') },
    { case: 'the last of two list rows', component: GinkoFieldList, props: listProps, value: rows('Winterpause', 'Hochzeit'), press: byLabel('Hochzeit entfernen'), focus: byLabel('Winterpause entfernen') },
    { case: 'the only list row', component: GinkoFieldList, props: listProps, value: rows('Winterpause'), press: byLabel('Winterpause entfernen'), focus: byText('Ausnahme hinzufügen') },
  ])('$case: the focus moves on to a control that stays', async ({ component, props, value, press, focus }) => {
    const wrapper = hosted(component as Component, props, value)
    const button = press()
    button.focus()
    button.click()
    await flushPromises()
    expect(document.activeElement).toBe(focus())
    wrapper.unmount()
  })
})

describe('translation side by side', () => {
  const field = { type: 'text', label: 'Gericht' } as Field
  // Alles bearbeiten passes what the stored entry says; a quick-task sheet passes only `hiddenWithout`.
  const editorView: Partial<TranslationState> = {
    missingNote: (leaf) => (leaf === 'dish' ? 'Noch nicht übersetzt. Ohne diesen Text erscheint die Seite nicht auf Englisch.' : ''),
    changesUrl: () => '/s/wirt/history?entry=e1', address: () => undefined,
  }
  function translated(state: 'stale' | 'fine' | 'missing', view: Partial<TranslationState> = editorView) {
    const confirm = vi.fn()
    const translation: TranslationState = { state: () => state, source: () => 'Kürbissuppe', confirm, mainName: () => 'Deutsch', ...view }
    const wrapper = mount(GinkoField, {
      props: { field, modelValue: { de: 'Kürbissuppe', en: 'Pumpkin soup' }, path: 'dish', locale: 'en', locales: ['de', 'en'], issues: [] },
      global: { provide: { [TRANSLATION as symbol]: translation } },
    })
    return { wrapper, confirm }
  }

  test('shows the main-language value next to the input; a changed value gets the badge and "Englisch stimmt noch"', async () => {
    const { wrapper, confirm } = translated('stale')
    const box = wrapper.get('[data-slot="translation-source"]')
    expect(box.text()).toContain('Deutsch')
    expect(box.text()).toContain('Kürbissuppe')
    expect(box.text()).toContain('Deutsch geändert seit Übersetzung')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Pumpkin soup')
    await box.findAll('button').find((b) => b.text() === 'Englisch stimmt noch')!.trigger('click')
    expect(confirm).toHaveBeenCalledWith('dish')
  })

  test('an unchanged translation shows the source without the badge', () => {
    const { wrapper } = translated('fine')
    expect(wrapper.get('[data-slot="translation-source"]').text()).toContain('Kürbissuppe')
    expect(wrapper.text()).not.toContain('geändert seit Übersetzung')
  })

  // Wrong behaviour caught: every missing translation said "Die Website zeigt hier den Text auf Deutsch", also on a page that is not online in English (romi-4).
  test('a missing translation shows what the editor says the website does without it', () => {
    const { wrapper } = translated('missing')
    expect(wrapper.get('[data-slot="translation-source"]').text()).toContain('Ohne diesen Text erscheint die Seite nicht auf Englisch.')
    expect(wrapper.text()).not.toContain('zeigt hier den Text')
  })

  // Wrong behaviour caught: the German text beside a translation was raw Markdown cut at 400 characters, so translators
  // missed its end, links and pictures, and rebuilt every heading by hand (romi-8, P9). Copying must fill only English.
  test('a Markdown text shows whole and formatted; a missing translation can start from it', async () => {
    const german = `## Anfahrt\n\n${'Mit dem Bus fährst du bis zur Haltestelle am Ötscher. '.repeat(10).trim()}\n\nDer letzte Satz steht ganz am Ende.\n`
    const translation: TranslationState = { state: () => 'missing', source: () => german, confirm: vi.fn(), mainName: () => 'Deutsch', missingNote: () => 'Noch nicht übersetzt.', changesUrl: () => undefined, address: () => undefined }
    const ClientOnly = defineComponent((_, { slots }) => () => slots.default?.())
    const wrapper = mount(GinkoField, {
      props: { field: { type: 'markdown', label: 'Text', profile: 'basic' } as Field, modelValue: { de: german }, path: 'body', locale: 'en', locales: ['de', 'en'], issues: [] },
      global: { provide: { [TRANSLATION as symbol]: translation }, components: { ClientOnly } },
      attachTo: document.body,
    })
    const box = () => wrapper.get('[data-slot="translation-source"]')
    for (let i = 0; i < 100 && !box().find('h2').exists(); i++) { await new Promise((r) => setTimeout(r, 20)); await flushPromises() }
    expect(german.length).toBeGreaterThan(400)
    expect(box().get('h2').text()).toBe('Anfahrt')
    expect(box().text()).toContain('Der letzte Satz steht ganz am Ende.')
    expect(box().text()).not.toContain('##')
    await box().findAll('button').find((b) => b.text() === 'Text auf Deutsch übernehmen')!.trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([{ de: german, en: german }])
    wrapper.unmount()
  })

  // Wrong behaviour caught: a picture replaced on the English tab drops its German description, which that tab cannot fix (media-16).
  test('a picture in another language offers only its description; the picture itself is changed in the main language', () => {
    const translation: TranslationState = { state: () => 'missing', source: () => 'Wald', confirm: vi.fn(), mainName: () => 'Deutsch', missingNote: () => 'Noch nicht übersetzt.', changesUrl: () => undefined, address: () => undefined }
    const assets: GinkoAssets = { state: () => ref(undefined), details: () => ref(undefined), upload: async () => 'unused' }
    const wrapper = mount(GinkoField, {
      props: { field: { type: 'image', label: 'Foto' } as Field, modelValue: { file: 'f1', alt: { de: 'Wald' } }, path: 'photo', locale: 'en', locales: ['de', 'en'], issues: [] },
      global: { provide: { [TRANSLATION as symbol]: translation, [GINKO_ASSETS as symbol]: assets } },
    })
    expect(wrapper.text()).toContain('Das Bild selbst änderst du auf Deutsch.')
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual([])
    expect(wrapper.find('#f-photo-alt').exists()).toBe(true)
  })

  // Wrong behaviour caught (WS-8): an event without its English title said the website shows the German text there,
  // while the English site leaves the whole event out.
  test.each([
    ['a part of a page shows the main language', undefined, 'Noch nicht übersetzt. Die Website zeigt hier den Text auf Deutsch.'],
    ['a page is left out of the language', () => ({ title: 'Krampuslauf', language: 'Englisch' }), 'Noch nicht übersetzt. Ohne diesen Text fehlt „Krampuslauf“ auf der Website auf Englisch.'],
  ] as const)('a missing translation where %s says so', (_, hiddenWithout, text) => {
    const { wrapper } = translated('missing', { hiddenWithout })
    expect(wrapper.get('[data-slot="translation-source"] p.text-warning').text()).toBe(text)
  })
})
