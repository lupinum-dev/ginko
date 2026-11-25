// @vitest-environment happy-dom
// The notices of an online entry's changes for a later day in Alles bearbeiten (D131): one per change, and its two steps.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { describe, expect, test, vi } from 'vitest'
import { addDays, collection, defineSite, f, todayIn } from '@lupinum/ginko/internal'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'
import DatedNotices from '../app/components/DatedNotices.vue'

const { computed, nextTick, ref, watch } = vue
Object.entries({ computed, nextTick, ref, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
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
const change = (id: string, from: string, over: Record<string, unknown> = {}) => ({ id, from, fields: ['price'], values: { price: { amount: 1290 } }, by: null, at: 0, changedSince: [], mayCancel: true, mayMove: true, ...over })

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
      'Ab [2099-04-01]: Name, Preis 22,90 €, Öffnet 11:30, Vegan: ja.',
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

  // Wrong behaviour caught (H1.11): cancelling the last notice dropped the focus to the page top.
  test('a cancel that leaves no notice gives the focus to the entry\'s title', async () => {
    const title = document.createElement('h1')
    Object.assign(title, { id: 'entry-title', tabIndex: -1 })
    document.body.append(title)
    rows.value = [change('d1', '2099-03-05')]
    const wrapper = mount(DatedNotices, { props: { site: 'cafe', entry: 'i1', brick: schema.bricks.items!, main: 'de', timeZone: 'Europe/Vienna', currency: 'EUR', lastFocus: 'entry-title' }, attachTo: document.body })
    await press(wrapper, 'Änderung aufheben')
    await press(wrapper, 'Änderung aufheben')
    expect(document.activeElement).toBe(title)
    wrapper.unmount()
    title.remove()
  })

  // Wrong behaviour caught (G7): a step the server refuses this person (staff whose change needs a yes, someone else's
  // change) was offered and failed only after the click.
  test('only the steps the person may take are offered', () => {
    rows.value = [change('d1', '2099-03-05', { mayMove: false }), change('d2', '2099-04-01', { mayMove: false, mayCancel: false })]
    const wrapper = mountNotices()
    expect(wrapper.findAll('[data-notice]').map((n) => n.findAll('button').map((b) => b.text()))).toEqual([['Änderung aufheben'], []])
    wrapper.unmount()
  })
})

// Slice 3: the notices of a change with an end in Alles bearbeiten.
describe('the notices of a change with an end', () => {
  // The Studio formats German as the site's de-AT, as the shim does.
  const fmt = (day: string) => new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  const offer = (id: string, from: string, until: string, over: Record<string, unknown> = {}) => change(id, from, { until, values: { price: { amount: 990 } }, normal: { price: { amount: 1290 } }, ...over })

  // Rows "save" (waits, holds) and "Änderung aufheben / Jetzt beenden". Wrong behaviour caught: an offer is shown as a
  // change for good; a holding offer offers "aufheben" (as if it had not started) or does not say what comes back.
  test('a waiting offer names both days; a holding one says what the website shows and what comes back', () => {
    rows.value = [offer('d1', '2099-12-06', '2099-12-31'), offer('d2', '2026-11-01', '2099-12-31', { holds: true })]
    const wrapper = mountNotices()
    expect(wrapper.findAll('[data-notice]').map((n) => [n.find('p').text().replace(/\s/g, ' '), n.findAll('button').map((b) => b.text())])).toEqual([
      [`Von ${fmt('2099-12-06')} bis ${fmt('2099-12-31')}: Preis 9,90 €`, ['Tage ändern', 'Änderung aufheben']],
      [`Bis ${fmt('2099-12-31')} zeigt die Website: Preis 9,90 € (sonst 12,90 €)`, ['Tage ändern', 'Jetzt beenden']],
    ])
    wrapper.unmount()
  })

  // Round L11, rows "overlap with another exception" and "a change without an end inside". Wrong behaviour caught: the
  // editor showed two offers on the same days with no word which one the website shows, and a new normal price inside
  // an offer as if it started on its day (only the task sheet said so).
  test('an overlap says which offer the website shows; a normal change inside an offer says it waits for the end', () => {
    const short = (day: string) => new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
    rows.value = [offer('d1', '2099-12-01', '2099-12-20'), offer('d2', '2099-12-10', '2099-12-31'), change('d3', '2099-12-15')]
    const wrapper = mountNotices()
    expect([wrapper.get('[data-notice="d2"] [data-test="dated-overlap"]').text(), wrapper.get('[data-notice="d3"] [data-test="dated-after-end"]').text(), wrapper.find('[data-notice="d1"] [data-test^="dated-"]').exists()])
      .toEqual([`Von ${short('2099-12-10')} bis ${short('2099-12-20')} gelten beide. Die Website zeigt die Änderung ab ${short('2099-12-10')}.`, 'Gilt, sobald die befristete Änderung endet', false])
    wrapper.unmount()
  })

  // Row "Tage ändern". Wrong behaviour caught: a move of a waiting offer loses its end; a holding offer's start can be
  // moved (decision 4).
  test('"Tage ändern" moves both days of a waiting offer and only the end of a holding one', async () => {
    rows.value = [offer('d1', '2099-12-06', '2099-12-31'), offer('d2', '2026-11-01', '2099-12-31', { holds: true })]
    const wrapper = mountNotices()
    await wrapper.get('#dated-day-d1-open').trigger('click')
    await flushPromises()
    expect([(wrapper.get('#dated-day-d1').element as HTMLInputElement).value, (wrapper.get('#dated-until-d1').element as HTMLInputElement).value]).toEqual(['2099-12-06', '2099-12-31'])
    await wrapper.get('#dated-until-d1').setValue('2100-01-06')
    await press(wrapper, 'Tage speichern')
    expect(ops.moveChange).toHaveBeenLastCalledWith('d1', '2099-12-06', 'items.price', '2100-01-06', false)

    await wrapper.get('#dated-day-d2-open').trigger('click')
    await flushPromises()
    expect([wrapper.find('#dated-day-d2').exists(), (wrapper.get('#dated-until-d2').element as HTMLInputElement).value]).toEqual([false, '2099-12-31'])
    await wrapper.get('#dated-until-d2').setValue('2100-01-10')
    await press(wrapper, 'Tage speichern')
    expect(ops.moveChange).toHaveBeenLastCalledWith('d2', '2026-11-01', 'items.price', '2100-01-10', false)
    wrapper.unmount()
  })

  // Round N6: "Tage ändern" has the limits of the sheet. Wrong behaviour caught: a waiting season moved to days that hold
  // today (a start some days back, allowed for a yearly change) is refused as "before today".
  test('"Tage ändern" moves a waiting season to days that hold today', async () => {
    const today = todayIn('Europe/Vienna')
    rows.value = [offer('d1', addDays(today, 10), addDays(today, 40), { yearly: true, name: 'Sommer' })]
    const wrapper = mountNotices()
    await wrapper.get('#dated-day-d1-open').trigger('click')
    await flushPromises()
    await wrapper.get('#dated-day-d1').setValue(addDays(today, -3))
    await press(wrapper, 'Tage speichern')
    expect([wrapper.find('[role="alert"]').exists(), ops.moveChange.mock.lastCall]).toEqual([false, ['d1', addDays(today, -3), 'items.price', addDays(today, 40), true]])
    wrapper.unmount()
  })

  // Row "Jetzt beenden". Wrong behaviour caught: one press ends the offer without asking (it cannot be undone), or the
  // entry goes offline.
  test('"Jetzt beenden" asks first and then ends only the offer', async () => {
    ops.cancelChange.mockClear()
    rows.value = [offer('d2', '2026-11-01', '2099-12-31', { holds: true })]
    const wrapper = mountNotices()
    await press(wrapper, 'Jetzt beenden')
    expect(ops.cancelChange).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await press(wrapper, 'Jetzt beenden')
    expect(ops.cancelChange).toHaveBeenCalledWith('d2', 'items.price')
    expect(ops.unpublishEntry).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('the notices of a change that comes back every year, and of a named one (slice 4)', () => {
  const fmt = (day: string) => new Intl.DateTimeFormat('de-AT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  const short = (day: string) => new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  const offer = (id: string, from: string, until: string, over: Record<string, unknown> = {}) => change(id, from, { until, values: { price: { amount: 990 } }, normal: { price: { amount: 1290 } }, ...over })

  // Rows "save" (notices) and "a name only". Wrong behaviour caught: a season reads like a one-off change (with a year, or
  // without "every year"), a holding one does not say it comes back, or the name does not lead.
  test('the name leads; a season names its days without a year and says it comes back', () => {
    rows.value = [
      offer('d1', '2099-06-01', '2099-08-31', { yearly: true, name: 'Sommer' }),
      offer('d2', '2026-11-01', '2099-12-31', { yearly: true, holds: true }),
      offer('d3', '2099-02-03', '2099-02-17', { name: 'Betriebsurlaub' }),
      offer('d4', '2026-11-01', '2099-11-30', { name: 'Herbst', yearly: true, holds: true }),
    ]
    const wrapper = mountNotices()
    expect(wrapper.findAll('[data-notice]').map((n) => n.find('p').text().replace(/\s/g, ' '))).toEqual([
      `Sommer: jedes Jahr von ${short('2099-06-01')} bis ${short('2099-08-31')}: Preis 9,90 €`,
      `Bis ${fmt('2099-12-31')} zeigt die Website: Preis 9,90 € (sonst 12,90 €). Kommt jedes Jahr wieder.`,
      `Betriebsurlaub: von ${fmt('2099-02-03')} bis ${fmt('2099-02-17')}: Preis 9,90 €`,
      `Herbst: bis ${fmt('2099-11-30')} zeigt die Website: Preis 9,90 € (sonst 12,90 €). Kommt jedes Jahr wieder.`,
    ])
    wrapper.unmount()
  })

  // Row "Änderung aufheben" and decision 2. Wrong behaviour caught: a holding season offers "Jetzt beenden" (as if it
  // ended only this year), or its question hides that it does not come back next year.
  test('a holding season offers "Änderung aufheben", not "Jetzt beenden"; the question names next year', async () => {
    ops.cancelChange.mockClear()
    rows.value = [offer('d2', '2026-11-01', '2099-12-31', { yearly: true, holds: true })]
    const wrapper = mountNotices()
    expect(wrapper.get('[data-notice="d2"]').findAll('button').map((b) => b.text())).toEqual(['Tage ändern', 'Änderung aufheben'])
    await press(wrapper, 'Änderung aufheben')
    expect(ops.cancelChange).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('Diese Änderung aufheben? Sie kommt dann auch nächstes Jahr nicht wieder.')
    await press(wrapper, 'Änderung aufheben')
    expect(ops.cancelChange).toHaveBeenCalledWith('d2', 'items.price')
    wrapper.unmount()
  })
})
