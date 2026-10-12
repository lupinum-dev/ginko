// @vitest-environment happy-dom
// Client-side behaviour: the components mounted in a DOM, driven by clicks and keys.
import { createApp, h, nextTick, Suspense } from 'vue'
import { afterEach, describe, expect, test } from 'vitest'
import { parseMarkdown } from '@lupinum/ginko/internal'
import { GinkoMarkdown } from '@lupinum/ginko/vue'
import { components } from '../src/registry.ts'
import { componentMap } from '../src/runtime/components/index.ts'

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  document.body.innerHTML = ''
})

async function mount(markdown: string): Promise<HTMLElement> {
  const parsed = await parseMarkdown(markdown, { profile: 'page', components })
  expect(parsed.problems).toEqual([])
  const el = document.createElement('div')
  document.body.append(el)
  // <GinkoMarkdown> has an async setup.
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(GinkoMarkdown, { value: parsed.value, components: componentMap }) }) })
  app.mount(el)
  unmount = () => app.unmount()
  await new Promise((resolve) => setTimeout(resolve))
  await nextTick()
  return el
}

const settle = async () => { await nextTick(); await nextTick() }
const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
/** The visible button with this text (the quiz keeps its other questions in the page, `hidden`). */
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => !b.closest('[hidden]') && b.textContent?.trim() === text)!

describe('client interaction', () => {
  test('tabs: arrow keys, Home and End move the selection and the focus, and wrap around', async () => {
    const root = await mount('::::tabs\n:::tab{label="A"}\nEins\n:::\n:::tab{label="B"}\nZwei\n:::\n:::tab{label="C"}\nDrei\n:::\n::::')
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')]
    const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
    const selected = () => tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')
    const step = async (key: string, expected: number) => {
      press(tabs[selected()]!, key)
      await settle()
      expect(selected()).toBe(expected)
      expect(document.activeElement).toBe(tabs[expected])
      expect(panels.map((p) => p.hidden)).toEqual(panels.map((_, i) => i !== expected))
      expect(tabs.map((t) => t.tabIndex)).toEqual(tabs.map((_, i) => (i === expected ? 0 : -1)))
    }
    await step('ArrowRight', 1)
    await step('End', 2)
    await step('ArrowRight', 0)
    await step('ArrowLeft', 2)
    await step('Home', 0)
  })

  test('quiz: "next" waits for a checked answer, and the result counts the right ones', async () => {
    const root = await mount(':::quiz\n::quiz-question{question="Eins?"}\n- [ ] Falsch\n- [x] Richtig\n::\n::quiz-question{question="Zwei?"}\n- [x] Richtig\n- [ ] Falsch\n::\n:::')
    const visible = () => [...root.querySelectorAll<HTMLElement>('.ginko-quiz-question')].findIndex((q) => !q.closest('[hidden]'))
    const answer = async (label: string) => {
      const option = [...root.querySelectorAll('label')].find((l) => !l.closest('[hidden]') && l.textContent?.includes(label))!
      option.querySelector('input')!.click()
      await settle()
      button(root, 'Antwort prüfen').click()
      await settle()
    }

    button(root, 'Weiter').click()
    await settle()
    expect(visible()).toBe(0)

    await answer('Richtig')
    button(root, 'Weiter').click()
    await settle()
    expect(visible()).toBe(1)

    await answer('Falsch')
    button(root, 'Ergebnis anzeigen').click()
    await settle()
    expect(root.querySelector('.ginko-quiz-score')?.textContent).toBe('1 von 2 richtig')
    expect(document.activeElement).toBe(button(root, 'Erneut versuchen'))
  })

  test('code block: a copy the browser refuses says so in the live region', async () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
    try {
      const root = await mount('```ts\nconst a = 1\n```')
      root.querySelector<HTMLButtonElement>('.ginko-code-copy')!.click()
      await new Promise((resolve) => setTimeout(resolve))
      expect(root.querySelector('.ginko-code-status')?.textContent).toBe('Kopieren nicht möglich')
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
      else Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  test('collapse: "show more" removes the clip and moves the focus to the content', async () => {
    // happy-dom has no layout: make the content taller than its clip.
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 1000 } })
    try {
      const root = await mount('::collapse\nLanger Text.\n::')
      await settle()
      const clip = root.querySelector('.ginko-clip')!
      expect(clip.hasAttribute('data-clipped')).toBe(true)
      button(root, 'Mehr anzeigen').click()
      await settle()
      expect(clip.hasAttribute('data-clipped')).toBe(false)
      expect(root.querySelector('.ginko-clip-button')).toBeNull()
      expect(document.activeElement).toBe(root.querySelector('.ginko-clip-region'))
    } finally {
      if (height) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', height)
    }
  })
})
