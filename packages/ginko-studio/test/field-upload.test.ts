// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, test } from 'vitest'
import { GINKO_ASSETS, type GinkoAssets } from '@lupinum/ginko-editor'
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
