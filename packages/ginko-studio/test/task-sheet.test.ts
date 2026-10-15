// @vitest-environment happy-dom
// The quick-task sheet (TaskSheet) with the real form engine and the German catalog. Nuxt's auto-imports become
// globals; Convex, the writes and the toast are replaced, and each field is a plain input.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { collection, defineSite, f } from '@lupinum/ginko'
import { serializeSchema } from '@lupinum/ginko/internal'
import { useI18n } from '#imports'

const { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, toValue, watch } = vue
Object.entries({ computed, inject, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('onBeforeRouteLeave', () => {})
vi.stubGlobal('onBeforeRouteUpdate', () => {})
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('useConvexAuth', () => ({ user: ref({ id: 'u1' }) }))
vi.stubGlobal('useConvexConnectionState', () => ({ isConnected: ref(true) }))
// Nothing is saved here: the writes are never called.
vi.stubGlobal('useOps', () => ({}))

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

/** A field as a plain input named by its key. */
const FieldStub = defineComponent({
  name: 'GinkoField',
  props: { path: { type: String, required: true }, modelValue: { type: null, default: undefined } },
  emits: ['update:modelValue'],
  setup: (props, { emit }) => () => h('input', { name: props.path, value: props.modelValue ?? '', onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }),
})

function mountSheet() {
  return mount(TaskSheet, {
    props: { site: 'restaurant', brickKey: 'notices', brick, task: brick.tasks![0]!, main: 'de', locales: ['de'], schema },
    global: { stubs: { GinkoField: FieldStub } },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  prefill.asked = 0
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
