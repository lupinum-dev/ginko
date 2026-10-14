// @vitest-environment happy-dom
// The form engine of Schnell ändern and Alles bearbeiten (useEntryForm), mounted in a small component. The Nuxt
// auto-imports are Vue's own; only the Studio's writes (useOps) are replaced, so the test sees every call.
import { mount } from '@vue/test-utils'
import * as vue from 'vue'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Entry } from '../app/composables/useSiteData'

for (const name of ['ref', 'shallowRef', 'computed', 'reactive', 'watch', 'nextTick', 'provide', 'onMounted', 'onBeforeUnmount'] as const) vi.stubGlobal(name, vue[name])
vi.stubGlobal('onBeforeRouteLeave', () => {})
vi.stubGlobal('onBeforeRouteUpdate', () => {})

const calls: unknown[] = []
const stored: Entry = {
  _id: 'e1', brick: 'dishes', kind: 'item', order: 1, rev: 5, lifeRev: 1, fieldRevs: { name: 2, description: 3 }, prints: {},
  data: { name: 'Wiener Schnitzel vom Kalb', description: 'Mit Petersilkartoffeln' },
}
/** The live list's view of the entry: undefined once someone removed it. */
const live = vue.shallowRef<Entry | undefined>(stored)
vi.stubGlobal('useOps', () => ({
  opId: () => 'op',
  saveEntry: async (args: { entry: string; baseRev: number; fields: unknown }) => {
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

const brick = {
  kind: 'collection', label: 'Gerichte',
  fields: { name: { type: 'text', label: 'Name' }, description: { type: 'longtext', label: 'Beschreibung' } },
} as never

/** The entry page: the entry from the live list, kept when it leaves it (as [entry].vue does). */
function mountForm() {
  let form!: ReturnType<typeof useEntryForm>
  mount(vue.defineComponent({
    setup() {
      const { entry, removed } = useKeptEntry(() => 'e1', () => live.value)
      form = useEntryForm({
        site: vue.ref('restaurant'), brickKey: () => 'dishes', brick: () => brick, fields: () => (brick as { fields: never }).fields,
        entry: () => entry.value, removed: () => removed.value, main: () => 'de', locale: () => 'de',
      })
      form.load({ ...stored.data })
      return () => vue.h('div')
    },
  }))
  return form
}

beforeEach(() => {
  calls.length = 0
  live.value = stored
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
})
