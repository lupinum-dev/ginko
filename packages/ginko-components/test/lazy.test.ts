import { describe, expect, test, vi } from 'vitest'
import { GINKO_COMPONENTS_KEY } from '@lupinum/ginko/internal'
import { componentMap } from '../src/runtime/components/index.ts'

vi.mock('#imports', () => ({
  defineNuxtPlugin: (plugin: unknown) => plugin,
  useI18n: () => ({ t: () => '' }),
  useRuntimeConfig: () => ({ public: {} }),
}))

describe('plugin component map', () => {
  test('provides every tag as an async component, so a page loads only the components its Markdown uses', async () => {
    const plugin = (await import('../src/runtime/plugin.ts')).default as unknown as { setup: (app: unknown) => void }
    const provided = new Map<unknown, unknown>()
    plugin.setup({ vueApp: { provide: (key: unknown, value: unknown) => provided.set(key, value) } })
    const map = provided.get(GINKO_COMPONENTS_KEY) as Record<string, { __asyncLoader?: unknown }>
    expect(Object.keys(map).sort()).toEqual(Object.keys(componentMap).sort())
    expect(Object.entries(map).filter(([, c]) => typeof c.__asyncLoader !== 'function').map(([tag]) => tag)).toEqual([])
  })
})
