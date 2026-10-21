// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, test } from 'vitest'
import { GINKO_ASSETS, type GinkoAssets } from '@lupinum/ginko-editor'
import type { Json } from '@lupinum/ginko'
import GinkoField from '../app/components/fields/GinkoField.vue'
import GinkoFieldImage from '../app/components/fields/GinkoFieldImage.vue'

type Upload = GinkoAssets['upload']

function mounted(upload: Upload) {
  const assets: GinkoAssets = { state: () => ref(undefined), details: () => ref(undefined), upload }
  return mount(GinkoFieldImage, {
    props: { id: 't', field: { type: 'image', label: 'Foto' } as never, modelValue: undefined, invalid: false, locale: 'de' },
    global: { provide: { [GINKO_ASSETS as symbol]: assets } },
  })
}

async function choosePhoto(wrapper: ReturnType<typeof mounted>) {
  const input = wrapper.get('input[type="file"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })], configurable: true })
  await wrapper.get('input[type="file"]').trigger('change')
}

describe('upload flow of image and file fields', () => {
  test('an aborted upload never sets the value, even if the adapter resolves anyway', async () => {
    let finish!: (id: string) => void
    const wrapper = mounted(() => new Promise<string>((resolve) => { finish = resolve }))
    await choosePhoto(wrapper)
    await wrapper.get('.status button').trigger('click')
    finish('late')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('.error').exists()).toBe(false)
  })

  test('a failed upload shows the error and offers a retry that uploads again', async () => {
    let calls = 0
    const wrapper = mounted(async () => {
      calls++
      if (calls === 1) throw new Error('Zu groß.')
      return 'id-2'
    })
    await choosePhoto(wrapper)
    await flushPromises()
    expect(wrapper.get('.error').text()).toContain('Zu groß.')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Erneut versuchen')!
    await retry.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[{ file: 'id-2', alt: { de: '' } }]])
  })
})

// Wrong behaviour caught: the English view offered a new photo, the library and Entfernen. A photo chosen there dropped
// the German description on save, and Entfernen removed the photo in every language, while the form said that only
// texts differ by language.
describe('a photo field in another language', () => {
  const assets: GinkoAssets = { state: () => ref(undefined), details: () => ref(undefined), upload: async () => 'id' }
  const photo = { file: 'f1', alt: { de: 'Kürbissuppe im Teller' } }
  test.each<{ locale: string; value: Json | undefined; buttons: string[]; alt: boolean; note: boolean }>([
    { locale: 'de', value: photo, buttons: ['Entfernen', 'Anderes Foto', 'Aus der Bibliothek wählen'], alt: true, note: false },
    { locale: 'en', value: photo, buttons: [], alt: true, note: false },
    { locale: 'en', value: undefined, buttons: [], alt: false, note: true },
  ])('$locale, photo $value.file: buttons $buttons, description $alt', ({ locale, value, buttons, alt, note }) => {
    const wrapper = mount(GinkoField, {
      props: { field: { type: 'image', label: 'Foto', optional: true } as never, modelValue: value, path: 'image', locale, locales: ['de', 'en'], issues: [] },
      global: { provide: { [GINKO_ASSETS as symbol]: assets } },
    })
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(buttons)
    expect([wrapper.find('#f-image-alt').exists(), wrapper.text().includes('Noch kein Foto, also nichts zu übersetzen.')]).toEqual([alt, note])
  })
})
