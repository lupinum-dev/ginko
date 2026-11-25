// @vitest-environment happy-dom
// The notices of an online entry's changes for a later day in Alles bearbeiten (D131): one per change, and its two steps.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko/internal'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import DatedNotices from '../app/components/DatedNotices.vue'

const { computed, nextTick, ref } = vue
Object.entries({ computed, nextTick, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
const rows = ref<unknown>([])
vi.stubGlobal('useConvexQuery', () => ({ data: rows, error: ref(undefined) }))
const ops = {
  dayText: (day: string) => `[${day}]`,
  cancelChange: vi.fn(async () => {}),
  moveChange: vi.fn(async () => {}),
  unpublishEntry: vi.fn(async () => {}),
}
vi.stubGlobal('useOps', () => ops)

const schema = serializeSchema(defineSite({
  site: 'cafe', name: 'Café', url: 'https://cafe.test', timeZone: 'Europe/Vienna', locales: ['de'], currency: 'EUR', week: { firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] },
  pages: { home: { de: '/' } },
  bricks: { items: collection({ label: 'Karte', max: 50, order: 'manual', listing: { title: 'name' }, fields: { name: f.text('Name', { translate: false }), price: f.money('Preis'), opens: f.time('Öffnet', { optional: true }), vegan: f.boolean('Vegan', { default: false }) } }) },
}))
const mountNotices = () => mount(DatedNotices, { props: { site: 'cafe', entry: 'i1', brick: schema.bricks.items!, main: 'de', timeZone: 'Europe/Vienna', currency: 'EUR', task: 'items.price' }, attachTo: document.body })
const press = async (wrapper: ReturnType<typeof mountNotices>, label: string) => {
  await wrapper.findAll('button').find((b) => b.text() === label)!.trigger('click')
  await flushPromises()
}
const change = (id: string, from: string, over: Record<string, unknown> = {}) => ({ id, from, fields: ['price'], values: { price: { amount: 1290 } }, by: null, at: 0, changedSince: [], ...over })

describe('the notices of changes for a later day', () => {
  // Wrong behaviour caught: a waiting change is not shown, the notice hides that the field changed since and will be
  // overwritten on the day, or it names only the fields, so nobody sees which price or time is planned (E2).
  test('one notice per change, with its values and what changed since', () => {
    rows.value = [
      change('d1', '2099-03-05', { changedSince: ['price'] }),
      change('d2', '2099-04-01', { fields: ['name', 'price', 'opens', 'vegan'], values: { name: 'Gulasch', price: { amount: 2290 }, opens: '11:30', vegan: true } }),
      change('d3', '2099-02-01', { stopped: { code: 'invalid', fields: ['price'] } }),
    ]
    const wrapper = mountNotices()
    expect(wrapper.findAll('[role="status"]').map((n) => n.find('p').text().replace(/\s/g, ' '))).toEqual([
      'Ab [2099-03-05]: Preis 12,90 €.',
      'Ab [2099-04-01]: Name, Preis 22,90 €, Öffnet 11:30, Vegan Ja.',
      'Die geplante Änderung für [2099-02-01] wurde nicht übernommen: Preis 12,90 €.',
    ])
    expect(wrapper.text()).toContain('Seit der Planung geändert: Preis.')
    wrapper.unmount()
  })

  // Wrong behaviour caught: "Änderung aufheben" takes the entry offline (unpublish) or cancels without asking, though
  // it cannot be undone.
  test('cancel asks first and cancels only the change', async () => {
    rows.value = [change('d1', '2099-03-05')]
    const wrapper = mountNotices()
    await press(wrapper, 'Änderung aufheben')
    expect(ops.cancelChange).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Diese geplante Änderung aufheben? Das lässt sich nicht rückgängig machen.')
    await press(wrapper, 'Behalten')
    expect(ops.cancelChange).not.toHaveBeenCalled()
    await press(wrapper, 'Änderung aufheben')
    await press(wrapper, 'Änderung aufheben')
    expect(ops.cancelChange).toHaveBeenCalledWith('d1', 'items.price')
    expect(ops.unpublishEntry).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  // Wrong behaviour caught: "Tag ändern" sends today (the server refuses it after the wait) or loses the new day.
  test('change day moves it to the day picked', async () => {
    rows.value = [change('d1', '2099-03-05')]
    const wrapper = mountNotices()
    await press(wrapper, 'Tag ändern')
    const field = wrapper.get('#dated-day-d1')
    expect((field.element as HTMLInputElement).value).toBe('2099-03-05')
    await field.setValue('2020-01-01')
    await press(wrapper, 'Tag speichern')
    expect(wrapper.text()).toContain('Der Tag muss nach heute liegen.')
    expect(ops.moveChange).not.toHaveBeenCalled()
    await field.setValue('2099-03-12')
    await press(wrapper, 'Tag speichern')
    expect(ops.moveChange).toHaveBeenCalledWith('d1', '2099-03-12', 'items.price')
    wrapper.unmount()
  })

  // Wrong behaviour caught (E9): a keyboard or screen reader user lost their place: the cancel question opened without
  // focus on its safe answer, closing a step dropped the focus to the page top, and a refused day was not tied to its
  // field.
  test('the steps move the focus and the day field carries its error', async () => {
    rows.value = [change('d1', '2099-03-05'), change('d2', '2099-04-01')]
    const wrapper = mountNotices()
    const active = () => document.activeElement?.textContent?.trim() ?? document.activeElement?.id
    await press(wrapper, 'Änderung aufheben')
    expect(active()).toBe('Behalten')
    await press(wrapper, 'Behalten')
    expect(document.activeElement?.id).toBe('dated-cancel-d1-open')

    await wrapper.get('#dated-day-d1-open').trigger('click')
    await flushPromises()
    expect(document.activeElement?.id).toBe('dated-day-d1')
    await wrapper.get('#dated-day-d1').setValue('2020-01-01')
    await press(wrapper, 'Tag speichern')
    expect([wrapper.get('#dated-day-d1').attributes('aria-invalid'), document.activeElement?.id]).toEqual(['true', 'dated-day-d1'])
    await press(wrapper, 'Abbrechen')
    expect(document.activeElement?.id).toBe('dated-day-d1-open')

    await wrapper.get('#dated-day-d1-open').trigger('click')
    await flushPromises()
    await wrapper.get('#dated-day-d1').setValue('2099-03-12')
    await press(wrapper, 'Tag speichern')
    expect(document.activeElement?.id).toBe('dated-day-d1-open')

    await wrapper.get('#dated-cancel-d1-open').trigger('click')
    await flushPromises()
    await press(wrapper, 'Änderung aufheben')
    expect(document.activeElement?.id).toBe('dated-day-d2-open')
    wrapper.unmount()
  })
})
