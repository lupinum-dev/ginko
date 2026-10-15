// @vitest-environment happy-dom
// Component blocks in the Markdown editor: which ones are drawn live, the settings popover, and the required props after an insert.
import { components } from '@lupinum/ginko-components/registry'
import { f } from '@lupinum/ginko'
import { defineComponents, type ComponentRegistry } from '@lupinum/ginko/internal'
import { componentMode } from '@lupinum/ginko-editor'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { EditorContent } from '@tiptap/vue-3'
import { afterEach, describe, expect, test } from 'vitest'
import { EDITOR_COMPONENTS } from '../app/components/editor/context.ts'
import { LIVE_TAGS } from '../app/components/editor/liveComponents.ts'
import MarkdownEditor from '../app/components/editor/MarkdownEditor.vue'
import type { SlashState } from '../app/components/editor/extensions.ts'
import SlashMenu from '../app/components/editor/SlashMenu.vue'

const field = { type: 'markdown', label: 'Text', profile: 'page' } as const
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const until = async (check: () => boolean, ms = 3000) => {
  for (let i = 0; i < ms / 20 && !check(); i++) { await wait(20); await flushPromises() }
  expect(check()).toBe(true)
}

// A component whose example leaves a required prop (the address) empty.
const testRegistry: ComponentRegistry = {
  ...components,
  ...defineComponents({
    'link-box': {
      kind: 'block',
      label: 'Linkbox',
      describe: 'Ein Kasten mit einem Link.',
      props: { href: f.text('Adresse', { format: 'url', max: 200 }), title: f.text('Titel', { optional: true, max: 40 }) },
      editor: { example: '::link-box\nSchau hier.\n::' },
    },
  }),
}

const open: Array<{ unmount(): void }> = []
async function mounted(modelValue: string, registry: ComponentRegistry = components) {
  const wrapper = mount(MarkdownEditor, {
    props: { id: 't', field, modelValue, invalid: false },
    global: { provide: { [EDITOR_COMPONENTS as symbol]: () => registry } },
    attachTo: document.body,
  })
  open.push(wrapper)
  await until(() => wrapper.find('[role="textbox"], textarea').exists())
  return wrapper
}
const editorOf = (wrapper: Awaited<ReturnType<typeof mounted>>) => wrapper.findComponent(EditorContent).props('editor') as Editor
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const propsOf = (editor: Editor, index = 0) => {
  const found: Array<Record<string, unknown>> = []
  editor.state.doc.descendants((node) => { if (node.type.name === 'component') found.push(node.attrs.props) })
  return found[index]
}

// Unmount first: clearing the body under a mounted editor lets a pending Vue update patch a node that is gone.
afterEach(async () => {
  await flushPromises()
  open.splice(0).forEach((w) => w.unmount())
  await flushPromises()
  document.body.innerHTML = ''
})

describe('live or card', () => {
  // Every tag of the real registry, with the mode the rule gives it. Live needs a Vue component in LIVE_TAGS and no named slots, children or parents.
  const expected: Record<string, 'live' | 'card'> = {
    callout: 'live', note: 'live', info: 'live', warning: 'live', error: 'live', success: 'live', idea: 'live',
    aside: 'live', excerpt: 'live', dropcap: 'live', flow: 'live', center: 'live', collapse: 'live', card: 'live', 'read-more': 'live',
    kbd: 'card', badge: 'card', // inline
    layout: 'card', column: 'card', timeline: 'card', 'timeline-item': 'card', // children / parents
    tabs: 'card', tab: 'card', accordion: 'card', 'accordion-item': 'card', steps: 'card', cards: 'card', 'inline-toc': 'card',
    'code-group': 'card', 'code-tree': 'card', files: 'card',
    figure: 'card', video: 'card', embed: 'card', // images of the site and iframes are not loaded in the editor
    quiz: 'card', 'quiz-question': 'card', api: 'card', 'api-param': 'card',
  }
  test.each(Object.keys(components).map((tag) => [tag, expected[tag]] as const))('%s is %s', (tag, mode) => {
    expect(mode).toBeDefined()
    expect(componentMode(tag, components, LIVE_TAGS)).toBe(mode)
  })

  test('a live component is the real one with the text as its content; a card shows the props in one line', async () => {
    const wrapper = await mounted('::callout{type="warning" title="Achtung"}\nText\n::\n\n:::tabs\n::tab{title="npm"}\nInhalt\n::\n:::\n')
    const live = wrapper.get('[data-component="callout"]')
    expect(live.attributes('data-mode')).toBe('live')
    expect(live.find('.ginko-callout[data-type="warning"] .ginko-callout-title').text()).toBe('Achtung')
    expect(live.find('.ginko-callout-content [data-node-view-content]').text()).toBe('Text')
    const card = wrapper.get('[data-component="tab"]')
    expect(card.attributes('data-mode')).toBe('card')
    expect(card.text()).toContain('Reiter')
    expect(card.text()).toContain('Name: npm')
    expect(wrapper.get('[data-component="callout"] button').attributes('aria-label')).toBe('Einstellungen: Hinweisbox')
  })

  // Bug caught: the parser took any `class`, so a stored `::callout{class="fixed inset-0 z-50"}` opened rich and the live
  // callout took the Studio's own utilities (the dialog overlay's): the attacker's text over the whole Studio.
  test('a stored class never reaches the Studio page: the text opens as source, with the problem', async () => {
    const wrapper = await mounted('::callout{class="fixed inset-0 z-50"}\n## Ihre Sitzung ist abgelaufen\n::\n')
    await until(() => wrapper.find('ul[aria-label="Probleme im Text"]').exists())
    expect(wrapper.get('ul[aria-label="Probleme im Text"]').text()).toContain('„class“')
    expect(document.querySelector('.ginko-callout')).toBeNull()
  })
})

describe('settings popover', () => {
  test('a change of a choice prop is written to the block and saved; an untouched block stays as written', async () => {
    const source = '- a\n- b\n\n::callout{type="info" title="A"}\nText\n::\n\n**fett**   text\n'
    const wrapper = await mounted(source)
    await wrapper.get('[data-component="callout"] button').trigger('click')
    await until(() => dialog() !== null)
    expect(dialog()!.getAttribute('aria-labelledby')).toBeTruthy()
    // The Select takes pointer events; its options sit in a portal.
    const trigger = dialog()!.querySelector<HTMLElement>('[data-prop="type"] [role="combobox"]')!
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    await until(() => document.body.querySelector('[role="option"]') !== null)
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === 'Warnung')!
    option.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
    option.click()
    await until(() => propsOf(editorOf(wrapper))?.type === 'warning')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toEqual([['- a\n- b\n\n::callout{type="warning" title="A"}\nText\n::\n\n**fett**   text\n']])
    // The component drawn follows the prop.
    expect(wrapper.get('.ginko-callout').attributes('data-type')).toBe('warning')
  })

  test('a number outside the limits shows the core message and is not applied', async () => {
    const wrapper = await mounted('::dropcap{lines="3"}\nEs war einmal.\n::\n')
    await wrapper.get('[data-component="dropcap"] button').trigger('click')
    await until(() => dialog() !== null)
    const input = dialog()!.querySelector<HTMLInputElement>('[data-prop="lines"] input')!
    input.focus()
    input.value = '9'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.blur()
    await until(() => dialog()!.querySelector('[data-prop="lines"] [role="alert"]') !== null)
    expect(dialog()!.querySelector('[data-prop="lines"] [role="alert"]')!.textContent).toBe('Lines muss zwischen 2 und 4 liegen.')
    expect(propsOf(editorOf(wrapper))).toEqual({ lines: '3' })
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  test('the Art field of a short form turns it into a callout and keeps title and content', async () => {
    const wrapper = await mounted('::note{title="A"}\nText\n::\n')
    await wrapper.get('[data-component="note"] button').trigger('click')
    await until(() => dialog() !== null)
    const trigger = dialog()!.querySelector<HTMLElement>('[data-prop="type"] [role="combobox"]')!
    expect(trigger.textContent).toContain('Notiz')
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    await until(() => document.body.querySelector('[role="option"]') !== null)
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === 'Warnung')!
    option.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
    option.click()
    await until(() => editorOf(wrapper).getJSON().content?.[0]?.attrs?.tag === 'callout')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toBe('::callout{title="A" type="warning"}\nText\n::\n')
  })

  test('a title that is too long is not applied and not cut: the field keeps the text and the message', async () => {
    const wrapper = await mounted('::callout{type="info" title="A"}\nText\n::\n')
    await wrapper.get('[data-component="callout"] button').trigger('click')
    await until(() => dialog() !== null)
    const input = dialog()!.querySelector<HTMLInputElement>('[data-prop="title"] input')!
    const long = 'x'.repeat(121)
    input.value = long
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => dialog()!.querySelector('[data-prop="title"] [role="alert"]') !== null)
    expect(input.value).toBe(long)
    expect(input.hasAttribute('maxlength')).toBe(false)
    expect(propsOf(editorOf(wrapper))).toEqual({ type: 'info', title: 'A' })
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  test('"Entfernen" deletes the block', async () => {
    const wrapper = await mounted('Davor\n\n::callout{type="info"}\nText\n::\n\nDanach\n')
    await wrapper.get('[data-component="callout"] button').trigger('click')
    await until(() => dialog() !== null)
    const remove = [...dialog()!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Entfernen')!
    remove.click()
    await until(() => propsOf(editorOf(wrapper)) === undefined)
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toBe('Davor\n\nDanach\n')
  })
})

describe('required props after an insert', () => {
  async function insert(wrapper: Awaited<ReturnType<typeof mounted>>, id: string) {
    const editor = editorOf(wrapper)
    editor.commands.focus('end')
    editor.commands.insertContent({ type: 'paragraph', content: [{ type: 'text', text: '/' }] })
    const state = wrapper.findComponent(SlashMenu).props('state') as SlashState
    await until(() => state.open && state.items.some((i) => i.id === id))
    state.choose(state.items.find((i) => i.id === id)!)
    await until(() => { let n = 0; editor.state.doc.descendants((node) => { if (node.type.name === 'component') n++ }); return n > 0 })
    await wait(100)
    await flushPromises()
  }

  test('a component whose example lacks a required prop opens its settings with the required props first', async () => {
    const wrapper = await mounted('', testRegistry)
    await insert(wrapper, 'component:link-box')
    await until(() => dialog() !== null)
    const text = dialog()!.textContent!
    expect(text).toContain('Pflichtangaben')
    expect(dialog()!.querySelector('[data-prop="href"]')).not.toBeNull()
    expect(text).toContain('Weitere Einstellungen')
    // The optional prop waits behind the collapsible.
    expect(dialog()!.querySelector('[data-prop="title"]')).toBeNull()
  })

  test('a component whose example fills every required prop opens nothing', async () => {
    const wrapper = await mounted('', testRegistry)
    await insert(wrapper, 'component:read-more')
    await wait(200)
    expect(dialog()).toBeNull()
    expect(propsOf(editorOf(wrapper))).toMatchObject({ href: '/' })
  })
})

describe('containers', () => {
  // A site's own container without editor examples: a gallery takes photos only.
  const withGallery: ComponentRegistry = {
    ...components,
    ...defineComponents({
      gallery: { kind: 'block', label: 'Galerie', describe: 'Bilder nebeneinander.', props: {}, children: ['photo'] },
      photo: { kind: 'block', label: 'Abbildung', describe: 'Ein Bild.', props: { src: f.image('Bild'), caption: f.text('Bildunterschrift', { optional: true, max: 200 }) } },
    }),
  }
  const childrenOf = (editor: Editor, tag: string) => {
    let found: Array<{ tag: string; props: unknown; content: unknown }> = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'component' && node.attrs.tag === tag) found = (node.toJSON().content ?? []).map((c: { attrs: { tag: string; props: unknown }; content?: unknown }) => ({ tag: c.attrs.tag, props: c.attrs.props, content: c.content }))
    })
    return found
  }

  // Wrong behaviour caught: a gallery could not grow in the editor; its content has no empty line to type "/" in.
  test.each([
    ['gallery', ':::gallery\n::photo{src="/a.png"}\n::\n:::\n', 'Abbildung hinzufügen', 'photo', 'src', undefined],
    ['tabs', ':::tabs\n::tab{title="npm"}\nInhalt\n::\n:::\n', 'Reiter hinzufügen', 'tab', 'title', [{ type: 'paragraph', attrs: { props: {}, bare: true, placeholder: 'Inhalt des ersten Reiters.' } }]],
  ])('%s: the add button appends one child at the end and asks for its required props', async (tag, source, button, child, prop, content) => {
    const wrapper = await mounted(source, withGallery)
    const add = wrapper.get(`[data-component="${tag}"]`).findAll('button').find((b) => b.text() === button)!
    await add.trigger('click')
    await until(() => childrenOf(editorOf(wrapper), tag).length === 2)
    const added = childrenOf(editorOf(wrapper), tag)[1]!
    expect(added).toEqual({ tag: child, props: {}, content })
    await until(() => dialog() !== null)
    expect(dialog()!.querySelector(`section [data-prop="${prop}"]`)).not.toBeNull()
  })
})
