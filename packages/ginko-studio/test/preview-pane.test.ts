// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import type { Schema } from '@lupinum/ginko/internal'
import PreviewPane from '../app/components/PreviewPane.vue'
import { focusText, previewPageOf } from '../app/utils/previewPage'

afterEach(() => vi.useRealTimers())

// Wrong behaviour caught: a site that never answers (down, refuses framing, no preview route) leaves an empty white box.
test('a preview that never gets ready says so after 8 s and links to the website', async () => {
  vi.useFakeTimers()
  const site = { slug: 'restaurant', url: 'https://linde.test', previewOrigins: [], schemaRev: 1, contentRev: 1 }
  const wrapper = mount(PreviewPane, { props: { site, schema: { locales: ['de'], timeZone: 'Europe/Vienna', bricks: {} } as unknown as Schema, entries: [], locale: 'de', path: '/speisekarte' } })
  vi.advanceTimersByTime(7_000)
  await flushPromises()
  expect(wrapper.text()).not.toContain('Die Vorschau lädt nicht')
  vi.advanceTimersByTime(1_000)
  await flushPromises()
  expect(wrapper.text()).toContain('Die Vorschau lädt nicht. Speichern funktioniert trotzdem wie gewohnt.')
  expect(wrapper.get('a').attributes()).toMatchObject({ href: 'https://linde.test/speisekarte', target: '_blank' })
})

// Wrong behaviour caught: a dish (a brick without a route) previewed the events page, the first key of `pages` as
// Convex stores it (keys sorted), instead of the menu page.
test.each([
  ['menu', 'de', '/speisekarte'],
  ['menu', 'en', '/en/menu'],
  ['lunchPlans', 'de', '/mittagsmenue'],
  ['hourPlans', 'de', '/'],
  ['notices', 'en', '/en'],
])('the preview of a %s entry opens %s %s', (brick, locale, page) => {
  const schema = {
    locales: ['de', 'en'],
    pages: { events: { de: '/veranstaltungen', en: '/en/events' }, gallery: { de: '/galerie' }, home: { de: '/', en: '/en' }, lunch: { de: '/mittagsmenue' }, menu: { de: '/speisekarte', en: '/en/menu' } },
    bricks: {
      hours: { kind: 'single', status: { hours: { plans: 'hourPlans' } }, fields: {} },
      hourPlans: { kind: 'collection', fields: {} },
      notices: { kind: 'collection', fields: {} },
      lunch: { kind: 'single', fields: {} },
      lunchPlans: { kind: 'collection', plans: { brick: 'lunch', field: 'weekOf' }, fields: {} },
      menu: { kind: 'collection', fields: {} },
    },
  } as unknown as Schema
  expect(previewPageOf(schema, brick, locale)).toBe(page)
})

// Wrong behaviour caught: the page shows Markdown without its marks, one paragraph per element, so the raw source is
// found nowhere; a choice key or a number found as a word in another text would outline the wrong place.
test.each([
  ['text', { de: 'Wiener Schnitzel', en: 'Schnitzel' }, 'Wiener Schnitzel'],
  ['markdown', { de: '::hero\n## Unser **Garten**\n\nSeit 1890' }, 'Unser Garten'],
  ['longtext', 'Frisch vom Markt.\nJeden Tag.', 'Frisch vom Markt.'],
  ['markdown', { de: 'Siehe [die Karte](/speisekarte).' }, 'Siehe die Karte.'],
  ['choice', 'vegan', ''],
  ['number', 12, ''],
])('a focused %s field is outlined by %j', (type, value, text) => {
  expect(focusText(type, value, 'de')).toBe(text)
})
