// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { EditorContent } from '@tiptap/vue-3'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { computed, markRaw, ref } from 'vue'
import { components } from '@lupinum/ginko-components/registry'
import { createGinkoEditor, GINKO_ASSETS, useFileImages, type GinkoAssets } from '@lupinum/ginko-editor'
import ComponentSettings from '../app/components/editor/ComponentSettings.vue'
import { EDITOR_COMPONENTS, EDITOR_FILES } from '../app/components/editor/context.ts'
import ImageDialog from '../app/components/editor/ImageDialog.vue'
import MarkdownEditor from '../app/components/editor/MarkdownEditor.vue'
import GinkoFieldImage from '../app/components/fields/GinkoFieldImage.vue'
import FileInfoPanel from '../app/components/files/FileInfoPanel.vue'
import FileRemoveDialog from '../app/components/files/FileRemoveDialog.vue'
import FilesBrowser from '../app/components/files/FilesBrowser.vue'
import { previewFileIds } from '../app/utils/content'

// Only the Convex side of the library is replaced: three files, and what `files.info` would answer.
const library = vi.hoisted(() => ({ altSuggestion: null as Record<string, string> | null, alt: {} as Record<string, string> }))
vi.mock('../app/composables/useFilesLibrary', async () => {
  const { computed, ref } = await import('vue')
  const file = { id: 'f1', name: 'team.jpg', mime: 'image/jpeg', kind: 'image', size: 2048, width: 800, height: 600, url: 'https://files.test/team.jpg', folder: null, kept: true, focus: null, sha256: null, trashedAt: null, createdAt: 1, used: false }
  return {
    useFilesLibrary: () => ({
      slug: ref('restaurant'), canManage: ref(true), folders: ref([]), missingAlt: ref(null),
      list: () => ({ files: ref([file]), pending: ref(false), error: ref(null), hasMore: ref(false), moreError: ref(null), more: async () => {} }),
      info: (id: () => string | null) => computed(() => (id() === 'f1' ? { ...file, uploader: 'u', uploadedBy: { email: 'u@example.test' }, previous: [], altSuggestion: library.altSuggestion, alt: library.alt, usedIn: [] } : undefined)),
      errorText: (error: unknown) => String(error),
    }),
  }
})

const assets: GinkoAssets = { state: () => ref(undefined), details: () => ref(undefined), upload: async () => 'unused' }
const text = () => document.body.textContent ?? ''
const button = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

beforeAll(async () => {
  // reka-ui positions popups with these; happy-dom has neither.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  Element.prototype.scrollIntoView ??= () => {}
  // The picker is a lazy chunk: its first open transforms it, which took ~3 s in a full run and broke the
  // 1 s default of vi.waitFor. Load it here, so the test's open step only waits for the dialog to render.
  await import('../app/components/files/LibraryPicker.vue')
})
beforeEach(() => { document.body.innerHTML = ''; library.alt = {}; library.altSuggestion = null })

describe('the files list', () => {
  test('a list that could not be read says why instead of loading forever', async () => {
    const failed = {
      slug: ref('restaurant'), canManage: ref(true), folders: ref([]), missingAlt: ref(null), errorText: String,
      list: () => ({ files: ref([]), pending: ref(false), error: ref('Du hast keinen Zugriff auf diese Seite.'), hasMore: ref(false), moreError: ref(null), more: async () => {} }),
    }
    mount(FilesBrowser, { props: { lib: failed as never, mode: 'page', locales: ['de'] }, attachTo: document.body })
    await flushPromises()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe('Du hast keinen Zugriff auf diese Seite.')
    expect(text()).not.toContain('Wird geladen')
  })

  // Wrong behaviour caught: a search while a folder was open looked only in that folder, and nothing said where it looked.
  test('a search looks in every folder and says so; an open folder shows its name above the files', async () => {
    let asked!: () => Record<string, unknown>
    const lib = {
      slug: ref('restaurant'), canManage: ref(true), folders: ref([{ id: 'd1', name: 'Ausflüge', parent: null }]), missingAlt: ref(null), errorText: String,
      list: (args: () => Record<string, unknown>) => { asked = args; return { files: ref([]), pending: ref(false), error: ref(null), hasMore: ref(false), moreError: ref(null), more: async () => {} } },
    }
    const wrapper = mount(FilesBrowser, { props: { lib: lib as never, mode: 'page', locales: ['de'] }, attachTo: document.body })
    await wrapper.findAll('nav button').find((b) => b.text() === 'Ausflüge')!.trigger('click')
    expect(asked()).toMatchObject({ view: 'all', folder: 'd1' })
    expect(wrapper.get('[data-scope]').text()).toBe('Ausflüge')
    vi.useFakeTimers()
    try {
      await wrapper.get('input[type="search"]').setValue('wald')
      await vi.advanceTimersByTimeAsync(300)
    } finally {
      vi.useRealTimers()
    }
    expect(asked()).toEqual({ view: 'all', search: 'wald' })
    expect(wrapper.get('[data-scope]').text()).toBe('Suche in allen Dateien')
    wrapper.unmount()
  })
})

describe('upload into the library', () => {
  // Wrong behaviour caught: in a batch, each failure overwrote the one before and named no file, so the person did not
  // learn which files were missing. The alert wraps a real list, so a screen reader announces its items.
  test('names every file of a batch that failed, also when a later one succeeds', async () => {
    const reasons: Record<string, string> = { 'IMG_0001.HEIC': 'HEIC geht nicht.', 'riesig.png': 'Zu viele Pixel.' }
    const lib = {
      slug: ref('restaurant'), canManage: ref(true), folders: ref([]), missingAlt: ref(null), errorText: (e: unknown) => (e as Error).message,
      list: () => ({ files: ref([]), pending: ref(false), error: ref(null), hasMore: ref(false), moreError: ref(null), more: async () => {} }),
      upload: async (file: File) => { if (reasons[file.name]) throw new Error(reasons[file.name]); return 'u1' },
      info: () => ref(undefined),
    }
    mount(FilesBrowser, { props: { lib: lib as never, mode: 'page', locales: ['de'] }, attachTo: document.body })
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: ['IMG_0001.HEIC', 'riesig.png', 'ok.jpg'].map((name) => new File(['x'], name)) })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect([...document.body.querySelectorAll('[role="alert"] ul li')].map((li) => li.textContent)).toEqual(['„IMG_0001.HEIC“: HEIC geht nicht.', '„riesig.png“: Zu viele Pixel.'])
  })
})

describe('remove rule of the library', () => {
  const stubs = { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
  const base = { open: true, slug: 'restaurant' }

  test('a used file cannot be removed: it says where it is used and has no remove button', async () => {
    mount(FileRemoveDialog, {
      props: { ...base, items: [{ id: 'f1', name: 'menu.pdf', used: true, usedIn: [{ entry: 'e1', brick: 'pages', title: 'Mittagsmenü', paths: ['pdf', 'sidebar.pdf'], fieldLabels: [{ de: 'Speisekarte als PDF' }, null], locale: null, missingAlt: false, deleted: false }] }] },
      global: { stubs }, attachTo: document.body,
    })
    await flushPromises()
    expect(text()).toContain('menu.pdf wird an 2 Stellen verwendet. Entferne die Datei zuerst aus diesen Einträgen.')
    expect(document.body.querySelector('a[href="/s/restaurant/all/pages/e1"]')?.textContent).toBe('Mittagsmenü')
    // Field labels, not storage paths; a field the schema lost keeps its path.
    expect(text()).toContain('Speisekarte als PDF, sidebar.pdf')
    expect(button('Entfernen')).toBeUndefined()
    expect(button('Schließen')).toBeDefined()
  })

  test('an unused file is confirmed first and removed only on the destructive button', async () => {
    const wrapper = mount(FileRemoveDialog, { props: { ...base, items: [{ id: 'f2', name: 'old.jpg', used: false, usedIn: [] }] }, global: { stubs }, attachTo: document.body })
    await flushPromises()
    expect(text()).toContain('old.jpg entfernen? Du kannst die Datei 30 Tage lang aus dem Papierkorb wiederherstellen.')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    button('Entfernen')!.click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})

describe('library picker in the image field', () => {
  function mountField() {
    return mount(GinkoFieldImage, {
      props: { id: 't', field: { type: 'image', label: 'Foto' } as never, modelValue: undefined, invalid: false, locale: 'de' },
      global: { provide: { [GINKO_ASSETS as symbol]: assets } },
      attachTo: document.body,
    })
  }
  async function openAndChoose() {
    button('Aus der Bibliothek wählen')!.click()
    await vi.waitFor(() => expect(button('Dieses Foto verwenden')).toBeDefined())
    button('team.jpg')!.click()
    await flushPromises()
  }

  // Wrong behaviour caught: the button stayed disabled without saying why.
  test('a photo without alt text says why it cannot be used yet, then the chosen file id and alt text go to the field', async () => {
    library.altSuggestion = null
    const wrapper = mountField()
    await openAndChoose()
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    const alt = document.body.querySelector('#picker-alt') as HTMLInputElement
    expect([alt.value, alt.getAttribute('aria-invalid'), document.activeElement === alt]).toEqual(['', 'true', true])
    expect(document.body.querySelector('[role="alert"]')!.textContent).toBe('Beschreibe das Bild kurz, für Menschen, die es nicht sehen.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    alt.value = 'Das Team beim Mittagessen'
    alt.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ file: 'f1', alt: { de: 'Das Team beim Mittagessen' } }]])
  })

  // Wrong behaviour caught: a library text (or a suggestion) was used unseen, wrong or not, and went live.
  // The library text is not copied into the field, so a later fix in the library still reaches this use.
  test.each([
    ['library text', { de: 'Aus der Bibliothek' }, { de: 'Vorschlag' }, 'Aus der Bibliothek', { de: '' }],
    ['suggestion', {}, { de: 'Vorhanden', en: 'Existing' }, 'Vorhanden', { de: 'Vorhanden', en: 'Existing' }],
  ])('the %s shows in the field before the photo is used', async (_name, alt, suggestion, shown, stored) => {
    library.alt = alt
    library.altSuggestion = suggestion
    const wrapper = mountField()
    await openAndChoose()
    expect((document.body.querySelector('#picker-alt') as HTMLInputElement).value).toBe(shown)
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ file: 'f1', alt: stored }]])
  })

  // Wrong behaviour caught: the field still demands its own text although the library's applies.
  test('with library text, the field\'s description is optional and shows that text as placeholder', async () => {
    const withAlt: GinkoAssets = { ...assets, details: () => ref({ f1: { url: 'https://files.test/team.jpg', name: 'team.jpg', size: 1, width: 1, height: 1, alt: { de: 'Aus der Bibliothek' } } }) }
    mount(GinkoFieldImage, {
      props: { id: 't', field: { type: 'image', label: 'Foto' } as never, modelValue: { file: 'f1', alt: { de: '' } }, invalid: false, locale: 'de' },
      global: { provide: { [GINKO_ASSETS as symbol]: withAlt } },
      attachTo: document.body,
    })
    await flushPromises()
    const input = document.body.querySelector('#t-alt') as HTMLInputElement
    expect([input.required, input.placeholder]).toEqual([false, 'Aus der Bibliothek'])
    expect(document.body.querySelector('#t-alt-hint')!.textContent).toBe('Leer lassen, dann gilt die Beschreibung aus den Dateien.')
  })

})

describe('info panel alt text', () => {
  function mountPanel(setAlt: (file: string, locale: string, text: string) => Promise<void>) {
    const file = { id: 'f1', name: 'team.jpg', mime: 'image/jpeg', kind: 'image', size: 2048, width: 800, height: 600, url: 'https://files.test/team.jpg', focus: null, createdAt: 1, uploader: 'u', uploadedBy: { email: 'u@example.test' }, previous: [], usedIn: [], altSuggestion: library.altSuggestion, alt: library.alt }
    const lib = { canManage: ref(true), info: () => ref(file), setAlt, errorText: (error: unknown) => String(error) }
    return mount(FileInfoPanel, { props: { id: 'f1', lib: lib as never, locales: ['de', 'en'], inTrash: false }, attachTo: document.body })
  }

  // Wrong behaviour caught: the description typed in the Files library is lost (not sent, or sent for the wrong language).
  test('the library text is saved on blur for its language and shows "Saved"; the suggestion is only a placeholder', async () => {
    library.altSuggestion = { de: 'Vorschlag' }
    library.alt = { de: 'Bibliothek' }
    const setAlt = vi.fn(async () => {})
    mountPanel(setAlt)
    await flushPromises()
    const de = document.body.querySelector('#file-alt-de') as HTMLInputElement
    const en = document.body.querySelector('#file-alt-en') as HTMLInputElement
    expect(de.value).toBe('Bibliothek')
    expect(en.value).toBe('')
    en.value = 'Team at lunch'
    en.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    en.dispatchEvent(new Event('blur'))
    await flushPromises()
    expect(setAlt).toHaveBeenCalledWith('f1', 'en', 'Team at lunch')
    expect(text()).toContain('Gespeichert')
  })
})

describe('library pictures in a Markdown text', () => {
  // Wrong behaviour caught: the preview asks only for the files of image fields, so every library picture in a text shows as broken.
  test('the preview asks for the files of texts too', () => {
    expect(previewFileIds({ body: { de: '![Hund]($file.f1)\n\n`$file.code`' }, cover: { file: 'f2' } }, [])).toEqual(['f1', 'f2'])
  })

  // Wrong behaviour caught: on a site with more than 200 used pictures the preview asks for all of them, the query is
  // refused, and the preview shows no picture at all, not even those of the open entry.
  test('the preview asks for at most 200 files, the open entry\'s and the other entries\' covers first', () => {
    const posts = Array.from({ length: 250 }, (_, i) => ({ body: { de: `![Bild]($file.t${i})` } }))
    const ids = previewFileIds({ body: { de: '![Hund]($file.own)' } }, [{ cover: { file: 'cover' } }, ...posts])
    expect([ids.length, ids[0], ids[1], ids.at(-1)]).toEqual([200, 'own', 'cover', 't197'])
  })

  async function choose(opener: string) {
    button(opener)!.click()
    await vi.waitFor(() => expect(button('Dieses Foto verwenden')).toBeDefined())
    button('team.jpg')!.click()
    await flushPromises()
  }

  // Wrong behaviour caught: the text gets the file's storage address (it breaks when the file is replaced), or the
  // library description is copied into the text, unseen and frozen in one language.
  test.each([
    ['the library description unchanged', undefined, 'Eins![]($file.f1)\n'],
    ['an edited description', 'Neu', 'Eins![Neu]($file.f1)\n'],
  ])('"Aus Dateibibliothek wählen" in the image dialog puts the file reference into the text, with %s', async (_name, typed, markdown) => {
    library.alt = { de: 'Das Team beim Mittagessen' }
    const handle = await createGinkoEditor({ text: 'Eins\n', profile: 'rich', element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    handle.editor.commands.setTextSelection(5)
    const images = useFileImages(assets, () => 'Bild nicht gefunden')
    // markRaw: mount() makes its props deeply reactive, and a transaction made through a proxy does not fit the editor.
    const dialog = mount(ImageDialog, { props: { editor: markRaw(handle.editor), open: true, images, locale: 'de' }, attachTo: document.body })
    await flushPromises()
    await choose('Aus Dateibibliothek wählen')
    const alt = document.body.querySelector('#picker-alt') as HTMLInputElement
    expect(alt.value).toBe('Das Team beim Mittagessen')
    if (typed) { alt.value = typed; alt.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises() }
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(await handle.markdown()).toBe(markdown)
    dialog.unmount()
    handle.destroy()
  })

  // Wrong behaviour caught: "Beschreibung ändern" at a picture with a library description demanded one of its own and
  // copied the library text into the text, frozen in one language.
  test.each([
    ['unchanged', undefined, 'Eins![]($file.f0)\n'],
    ['edited', 'Neu', 'Eins![Neu]($file.f0)\n'],
  ])('the description step of a library picture starts from the library text (%s)', async (_name, typed, markdown) => {
    const described: GinkoAssets = { ...assets, details: (ids) => computed(() => Object.fromEntries(ids.value.map((id) => [id, { url: `https://files.test/${id}.jpg`, name: `${id}.jpg`, size: 1, width: 1, height: 1, alt: { de: 'Hof im Winter' } }]))) }
    const handle = await createGinkoEditor({ text: 'Eins![]($file.f0)\n', profile: 'rich', element: document.createElement('div') })
    if (handle.mode !== 'rich') throw new Error('expected rich')
    const images = useFileImages(described, () => 'Bild nicht gefunden')
    images.want('$file.f0')
    await flushPromises()
    const dialog = mount(ImageDialog, { props: { editor: markRaw(handle.editor), open: false, describe: 5, images, locale: 'de' }, attachTo: document.body })
    await dialog.setProps({ open: true })
    await flushPromises()
    const alt = document.body.querySelector('[role="dialog"] input') as HTMLInputElement
    expect(alt.value).toBe('Hof im Winter')
    if (typed) { alt.value = typed; alt.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises() }
    button('Fertig')!.click()
    await flushPromises()
    expect(await handle.markdown()).toBe(markdown)
    dialog.unmount()
    handle.destroy()
  })

  // Wrong behaviour caught: a selected picture offered nothing (a swap meant delete and insert again), or a replace added
  // a second picture or kept the old description with the new photo.
  test.each([
    ['its library description', 'Eins ![]($file.f0) zwei\n', 'Beschreibung aus den Dateien: Hof im Winter'],
    ['its own description', 'Eins ![Hof]($file.f0) zwei\n', 'Beschreibung: Hof'],
  ])('a selected picture shows %s; "Bild ersetzen" puts a library photo in its place, in one step', async (_name, source, shown) => {
    library.alt = { de: 'Das Team beim Mittagessen' }
    const described: GinkoAssets = { ...assets, details: (ids) => computed(() => Object.fromEntries(ids.value.map((id) => [id, { url: `https://files.test/${id}.jpg`, name: `${id}.jpg`, size: 1, width: 1, height: 1, alt: { de: id === 'f0' ? 'Hof im Winter' : 'Das Team beim Mittagessen' } }]))) }
    const wrapper = mount(MarkdownEditor, {
      props: { id: 't', field: { type: 'markdown', label: 'Text', profile: 'rich' } as never, modelValue: source, invalid: false, contentLocale: 'de' },
      global: { provide: { [GINKO_ASSETS as symbol]: described } }, attachTo: document.body,
    })
    await vi.waitFor(() => expect(document.body.querySelector('.ginko-editor img')).not.toBeNull())
    const editor = wrapper.findComponent(EditorContent).props('editor') as Editor
    let pos = -1
    editor.state.doc.descendants((node, at) => { if (node.type.name === 'image') pos = at })
    editor.commands.setNodeSelection(pos)
    editor.commands.focus()
    await vi.waitFor(() => expect(document.body.querySelector('[role="toolbar"][aria-label="Bild"]')?.textContent).toContain(shown))
    button('Bild ersetzen')!.click()
    await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe('Bild ersetzen'))
    let steps = 0
    editor.on('transaction', ({ transaction }) => { if (transaction.docChanged) steps++ })
    await choose('Aus Dateibibliothek wählen')
    button('Dieses Foto verwenden')!.click()
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Eins ![]($file.f1) zwei\n']))
    expect(steps).toBe(1)
    wrapper.unmount()
  })

  // Wrong behaviour caught: "Bildunterschrift" showed in a rich text, which cannot hold the site's figure block, and did
  // nothing there; in a page text it turns the picture into the figure, with its description, and opens its settings.
  test.each([
    ['rich', false],
    ['page', true],
  ])('a selected picture in a %s text offers "Bildunterschrift": %s', async (profile, offered) => {
    const wrapper = mount(MarkdownEditor, {
      props: { id: 't', field: { type: 'markdown', label: 'Text', profile } as never, modelValue: 'Eins\n\n![Hof]($file.f0)\n', invalid: false, contentLocale: 'de' },
      global: { provide: { [GINKO_ASSETS as symbol]: assets, [EDITOR_COMPONENTS as symbol]: () => components } }, attachTo: document.body,
    })
    await vi.waitFor(() => expect(document.body.querySelector('.ginko-editor [role="textbox"]')).not.toBeNull())
    const editor = wrapper.findComponent(EditorContent).props('editor') as Editor
    let pos = -1
    editor.state.doc.descendants((node, at) => { if (node.type.name === 'image') pos = at })
    editor.commands.setNodeSelection(pos)
    editor.commands.focus()
    await vi.waitFor(() => expect(document.body.querySelector('[role="toolbar"][aria-label="Bild"]')?.textContent).toContain('Beschreibung: Hof'))
    expect(button('Bildunterschrift') !== undefined).toBe(offered)
    if (offered) {
      button('Bildunterschrift')!.click()
      await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Bildunterschrift'))
      await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Eins\n\n::figure{src="$file.f0" alt="Hof"}\n::\n']))
    }
    wrapper.unmount()
  })

  // Wrong behaviour caught: the figure stores an address instead of the library file, or the description typed in the picker is lost.
  test('"Bild wählen" at a figure stores the file reference and fills the empty description with the one typed in the picker', async () => {
    const wrapper = mount(ComponentSettings, {
      props: { tag: 'figure', registry: components, values: {} },
      global: { provide: { [EDITOR_FILES as symbol]: { images: useFileImages(assets, () => 'Bild nicht gefunden'), locale: () => 'de' } } },
      attachTo: document.body,
    })
    await choose('Bild wählen')
    const alt = document.body.querySelector('#picker-alt') as HTMLInputElement
    alt.value = 'Das Team beim Mittagessen'
    alt.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(wrapper.emitted('update')).toEqual([[{ src: '$file.f1', alt: 'Das Team beim Mittagessen' }]])
  })
})
