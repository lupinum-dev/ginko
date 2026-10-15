// @vitest-environment happy-dom
// "Mit KI verbinden": the lead's examples and what each key's changes do. The German catalog is the real one; Nuxt's
// auto-imports become globals, and Convex is replaced.
import { flushPromises, mount } from '@vue/test-utils'
import * as vue from 'vue'
import { expect, test, vi } from 'vitest'
import { useI18n } from '#imports'
import AiPage from '../app/pages/s/[site]/ai/index.vue'

const { computed, defineComponent, h, ref, Suspense } = vue
Object.entries({ computed, ref, useI18n }).forEach(([name, fn]) => vi.stubGlobal(name, fn))
vi.stubGlobal('definePageMeta', () => {})
vi.stubGlobal('useHead', () => {})
vi.stubGlobal('useToast', () => ({ show: () => {} }))
vi.stubGlobal('useConvexConfig', () => ({ siteUrl: 'https://convex.test' }))
vi.stubGlobal('useConvexMutation', () => ({ pending: ref(false), mutate: async () => ({}) }))
const keys = ref<unknown[]>([])
vi.stubGlobal('useConvexQuery', () => ({ data: keys, error: ref(undefined) }))

interface Task { id: string; kind: string; label: { de: string }; needsApproval?: boolean }
const task = (id: string, kind: string, de: string, needsApproval?: boolean): Task => ({ id, kind, label: { de }, ...(needsApproval ? { needsApproval } : {}) })
// An agency site: removing comes first in the schema, but the examples name creating and editing first.
const bricks: [string, { tasks: Task[] }][] = [
  ['team', { tasks: [task('remove', 'remove', 'Person entfernen')] }],
  ['posts', { tasks: [task('write', 'create', 'Beitrag schreiben')] }],
  ['faq', { tasks: [task('add', 'create', 'Frage hinzufügen', true)] }],
]
const key = (id: string, reviewEffective: boolean) => ({ id, label: id, createdAt: Date.UTC(2026, 9, 1), lastUsedAt: null, revokedAt: null, review: null, reviewEffective })

// Wrong behaviour caught: an agency site read "zum Beispiel „Setz Heute ausgebucht“ oder „Trag das Mittagsmenü vom
// Foto ein“", and nothing said whether the assistant's changes go online at once or wait for approval; a cook whose
// lunch menu needs approval read "sofort online".
test.each([
  {
    name: 'an owner: her own tasks as examples, and each key says whether it waits',
    role: 'owner', grants: [], keys: [key('Claude Code', false), key('ChatGPT', true)],
    examples: 'zum Beispiel „Beitrag schreiben“ oder „Frage hinzufügen“.',
    lines: ['Änderungen gehen sofort online.', 'Änderungen warten auf Freigabe.'],
  },
  {
    name: 'staff with one task that needs approval: the generic examples, and the key waits where she would',
    role: 'staff', grants: ['faq.add'], keys: [key('Claude Code', false)],
    examples: 'zum Beispiel „Korrigier einen Tippfehler“ oder „Kürz den ersten Absatz“.',
    lines: ['Was bei dir auf Freigabe wartet, wartet auch hier. Alles andere geht sofort online.'],
  },
])('$name', async ({ role, grants, keys: rows, examples, lines }) => {
  keys.value = rows
  vi.stubGlobal('useSiteData', async () => ({
    slug: ref('lupinum'), schema: ref({ timeZone: 'Europe/Vienna', locales: ['de'] }), site: ref({ name: 'Lupinum' }), main: ref('de'),
    bricks: ref(bricks), role: ref(role), may: (brick: string, t: Task) => role !== 'staff' || grants.includes(`${brick}.${t.id}`),
  }))
  const wrapper = mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(AiPage) }) }))
  await flushPromises()
  expect(wrapper.get('h1 + p').text()).toContain(examples)
  expect(wrapper.findAll('section[aria-labelledby="keys-title"] li').map((li) => li.findAll('p').at(-1)!.text())).toEqual(lines)
})
