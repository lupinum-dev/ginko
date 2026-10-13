// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, shallowRef } from 'vue'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { TRANSLATION, type TranslationState } from '@lupinum/ginko-editor'
import type { Field, Json } from '@lupinum/ginko'
import FieldFrame from '../app/components/fields/FieldFrame.vue'
import GinkoField from '../app/components/fields/GinkoField.vue'
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
  return { options: () => present, brickLabel: () => 'Speisen' }
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

  function host(initial: Json) {
    const value = shallowRef<Json | undefined>(initial)
    const Host = defineComponent({
      setup: () => () => h(GinkoFieldList, { id: 'f-ex', field, modelValue: value.value, path: 'ex', locale: 'de', locales: ['de'], issues: [], 'onUpdate:modelValue': (v: Json | undefined) => { value.value = v } }),
    })
    return { wrapper: mount(Host), value }
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
})

describe('translation side by side', () => {
  const field = { type: 'text', label: 'Gericht' } as Field
  function translated(state: 'stale' | 'fine' | 'missing') {
    const confirm = vi.fn()
    const translation: TranslationState = { state: () => state, source: () => 'Kürbissuppe', confirm, mainName: () => 'Deutsch' }
    const wrapper = mount(GinkoField, {
      props: { field, modelValue: { de: 'Kürbissuppe', en: 'Pumpkin soup' }, path: 'dish', locale: 'en', locales: ['de', 'en'], issues: [] },
      global: { provide: { [TRANSLATION as symbol]: translation } },
    })
    return { wrapper, confirm }
  }

  test('shows the main-language value next to the input; a changed value gets the badge and "Passt so"', async () => {
    const { wrapper, confirm } = translated('stale')
    const box = wrapper.get('[data-slot="translation-source"]')
    expect(box.text()).toContain('Deutsch')
    expect(box.text()).toContain('Kürbissuppe')
    expect(box.text()).toContain('Deutsch geändert seit Übersetzung')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Pumpkin soup')
    await box.findAll('button').find((b) => b.text() === 'Passt so')!.trigger('click')
    expect(confirm).toHaveBeenCalledWith('dish')
  })

  test('an unchanged translation shows the source without the badge', () => {
    const { wrapper } = translated('fine')
    expect(wrapper.get('[data-slot="translation-source"]').text()).toContain('Kürbissuppe')
    expect(wrapper.text()).not.toContain('geändert seit Übersetzung')
  })
})
