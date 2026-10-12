// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { GINKO_ASSETS, type GinkoAssets } from '@lupinum/ginko-editor'
import GinkoFieldImage from '../app/components/fields/GinkoFieldImage.vue'
import FileInfoPanel from '../app/components/files/FileInfoPanel.vue'
import FileRemoveDialog from '../app/components/files/FileRemoveDialog.vue'

// Only the Convex side of the library is replaced: three files, and what `files.info` would answer.
const library = vi.hoisted(() => ({ altSuggestion: null as Record<string, string> | null, alt: {} as Record<string, string> }))
vi.mock('../app/composables/useFilesLibrary', async () => {
  const { computed, ref } = await import('vue')
  const file = { id: 'f1', name: 'team.jpg', mime: 'image/jpeg', kind: 'image', size: 2048, width: 800, height: 600, url: 'https://files.test/team.jpg', folder: null, kept: true, focus: null, sha256: null, trashedAt: null, createdAt: 1, used: false }
  return {
    useFilesLibrary: () => ({
      slug: ref('restaurant'), canManage: ref(true), folders: ref([]), missingAlt: ref(null),
      list: () => ({ files: ref([file]), pending: ref(false), hasMore: ref(false), more: async () => {} }),
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

  test('a photo without alt text asks for it, then the chosen file id and alt text go to the field', async () => {
    library.altSuggestion = null
    const wrapper = mountField()
    await openAndChoose()
    expect((button('Dieses Foto verwenden') as HTMLButtonElement).disabled).toBe(true)
    const alt = document.body.querySelector('#picker-alt') as HTMLInputElement
    alt.value = 'Das Team beim Mittagessen'
    alt.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ file: 'f1', alt: { de: 'Das Team beim Mittagessen' } }]])
  })

  // Wrong behaviour caught: the library text is copied into the field, so a later fix in the library no longer reaches this use.
  test('a photo with library text in the field language is chosen at once and the field keeps its own alt empty', async () => {
    library.alt = { de: 'Aus der Bibliothek' }
    library.altSuggestion = { de: 'Vorschlag' }
    const wrapper = mountField()
    await openAndChoose()
    expect(document.body.querySelector('#picker-alt')).toBeNull()
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ file: 'f1', alt: { de: '' } }]])
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

  test('a photo that already has alt text in the field language is chosen at once with it', async () => {
    library.altSuggestion = { de: 'Vorhanden', en: 'Existing' }
    const wrapper = mountField()
    await openAndChoose()
    expect(document.body.querySelector('#picker-alt')).toBeNull()
    button('Dieses Foto verwenden')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ file: 'f1', alt: { de: 'Vorhanden', en: 'Existing' } }]])
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
