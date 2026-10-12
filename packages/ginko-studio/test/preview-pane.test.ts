// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import type { Schema } from '@lupinum/ginko/internal'
import PreviewPane from '../app/components/PreviewPane.vue'

afterEach(() => vi.useRealTimers())

// Wrong behaviour caught: a site that never answers (down, refuses framing, no preview route) leaves an empty white box.
test('a preview that never gets ready says so after 8 s and links to the website', async () => {
  vi.useFakeTimers()
  const site = { slug: 'restaurant', url: 'https://linde.test', previewOrigins: [], schemaRev: 1, contentRev: 1 }
  const wrapper = mount(PreviewPane, { props: { site, schema: { locales: ['de'], timezone: 'Europe/Vienna', bricks: {} } as unknown as Schema, entries: [], locale: 'de', path: '/speisekarte' } })
  vi.advanceTimersByTime(7_000)
  await flushPromises()
  expect(wrapper.text()).not.toContain('Die Vorschau lädt nicht')
  vi.advanceTimersByTime(1_000)
  await flushPromises()
  expect(wrapper.text()).toContain('Die Vorschau lädt nicht. Speichern funktioniert trotzdem wie gewohnt.')
  expect(wrapper.get('a').attributes()).toMatchObject({ href: 'https://linde.test/speisekarte', target: '_blank' })
})
