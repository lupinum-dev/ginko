// @vitest-environment happy-dom
// The Markdown field: what the person sees in the editor, and what it hands to the form.
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { EditorContent } from '@tiptap/vue-3'
import { describe, expect, test } from 'vitest'
import { FLUSHERS } from '@lupinum/ginko-editor'
import MarkdownEditor from '../app/components/editor/MarkdownEditor.vue'

const field = { type: 'markdown', label: 'Text', profile: 'basic' } as const

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function mounted(modelValue: string | undefined, extra: Record<string, unknown> = {}, provide: Record<symbol, unknown> = {}) {
  const wrapper = mount(MarkdownEditor, { props: { id: 't', field: { ...field, ...extra } as never, modelValue, invalid: false }, attachTo: document.body, global: { provide } })
  // The core parses asynchronously before the editor exists.
  for (let i = 0; i < 100 && !wrapper.find('[role="textbox"], textarea').exists(); i++) { await wait(20); await flushPromises() }
  return wrapper
}

const editorOf = (wrapper: Awaited<ReturnType<typeof mounted>>) => wrapper.findComponent(EditorContent).props('editor') as Editor

/** Appends text at the end of the document, as typing would. */
function type(editor: Editor, value: string) {
  editor.commands.focus('end')
  editor.commands.insertContent(value)
}

describe('MarkdownEditor', () => {
  test('focus and blur without an edit keep the stored text as written', async () => {
    const wrapper = await mounted('- a\n- b\n\n**fett** text\n')
    const box = wrapper.get('[role="textbox"]')
    expect(box.attributes('contenteditable')).toBe('true')
    editorOf(wrapper).commands.focus()
    await box.trigger('blur')
    await wrapper.get('[role="toolbar"]').trigger('focusout')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  test('the first change reaches the form at once; a save right after typing has the last character', async () => {
    const wrapper = await mounted('Eins\n')
    const editor = editorOf(wrapper)
    type(editor, 'a')
    await wait(60)
    expect(wrapper.emitted('update:modelValue')).toEqual([['Eins' + 'a\n']])
    type(editor, 'b')
    await wrapper.get('[role="toolbar"]').trigger('focusout')
    await wait(60)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['Einsab\n'])
  })

  // Wrong behaviour caught: a keyboard save (no blur) inside the pause saved the text without the last keystrokes.
  test('the form takes pending typing before it saves, without a blur', async () => {
    const flushers = new Set<() => Promise<void>>()
    const wrapper = await mounted('Eins\n', {}, { [FLUSHERS as symbol]: flushers })
    const editor = editorOf(wrapper)
    type(editor, 'a')
    type(editor, 'b')
    await Promise.all([...flushers].map((flush) => flush()))
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['Einsab\n'])
  })

  test('a real edit is saved as Markdown, and only the edited block changes', async () => {
    const wrapper = await mounted('## Titel\n\nEins\n\nZwei\n')
    type(editorOf(wrapper), 'X')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toEqual([['## Titel\n\nEins\n\nZweiX\n']])
  })

  test('a value that comes back equal to the last saved one does not reopen the editor', async () => {
    const wrapper = await mounted('Eins\n')
    const editor = editorOf(wrapper)
    type(editor, ' zwei')
    await wait(350)
    const saved = wrapper.emitted('update:modelValue')!.at(-1)![0] as string
    await wrapper.setProps({ modelValue: saved })
    await flushPromises()
    expect(editorOf(wrapper)).toBe(editor)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  test('a different value from outside replaces the shown text without saving', async () => {
    const wrapper = await mounted('Eins\n')
    await wrapper.setProps({ modelValue: 'Ganz neu\n' })
    await flushPromises()
    await wait(50)
    expect(wrapper.get('[role="textbox"]').text()).toBe('Ganz neu')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  test('an empty field opens as an empty box, saves nothing until typed in, and saves undefined when emptied again', async () => {
    const wrapper = await mounted(undefined)
    const editor = editorOf(wrapper)
    await wrapper.get('[role="textbox"]').trigger('blur')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    type(editor, 'Hallo')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toEqual([['Hallo']])
    editor.commands.clearContent()
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([undefined])
  })

  test('a text the editor cannot show without changing it opens as source, with the reason, and saves what is typed', async () => {
    const wrapper = await mounted('Text[^1]\n\n[^1]: Fußnote\n')
    expect(wrapper.find('[role="textbox"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Dieser Text wird als Markdown bearbeitet.')
    const area = wrapper.get('textarea')
    expect(area.classes()).toContain('font-mono')
    await area.setValue('Neuer Text')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')).toEqual([['Neuer Text']])
  })

  test('the textbox is labelled by the field label and marked multiline, except in a one-line field', async () => {
    const multi = await mounted('Eins\n')
    expect(multi.get('[role="textbox"]').attributes()).toMatchObject({ id: 't', 'aria-labelledby': 't-label', 'aria-multiline': 'true', 'aria-invalid': 'false' })
    const inline = await mounted('Eins\n', { profile: 'inline' })
    expect(inline.get('[role="textbox"]').attributes('aria-multiline')).toBeUndefined()
  })

  // Wrong behaviour caught: Ctrl+F in the field opened the browser's page search, and "Alle ersetzen" did not reach the saved text.
  test('Ctrl+F opens find and replace; "Alle ersetzen" changes the text, Esc closes the bar', async () => {
    const wrapper = await mounted('Apfel und apfel\n\nBirne\n')
    await wrapper.get('[role="textbox"]').trigger('keydown', { key: 'f', ctrlKey: true })
    expect(wrapper.find('[role="search"]').exists()).toBe(true)
    await wrapper.get('input[aria-label="Suchen"]').setValue('apfel')
    expect(wrapper.get('[role="search"]').text()).toContain('1 von 2')
    await wrapper.get('input[aria-label="Ersetzen durch"]').setValue('Kiwi')
    const all = wrapper.findAll('[role="search"] button').find((b) => b.text() === 'Alle ersetzen')!
    await all.trigger('click')
    await wait(350)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['Kiwi und Kiwi\n\nBirne\n'])
    await wrapper.get('input[aria-label="Suchen"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="search"]').exists()).toBe(false)
  })
})
