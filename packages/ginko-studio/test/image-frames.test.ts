// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, test } from 'vitest'
import { GINKO_ASSETS, type GinkoAssets, type UploadDetails } from '@lupinum/ginko-editor'
import GinkoFieldImage from '../app/components/fields/GinkoFieldImage.vue'

// Wrong behaviour caught: the Studio preview and the site disagree on a frame (another ratio, or the focus point not
// applied), a set point that the frames do not follow, staff offered a point the server refuses, a finger scrolling the
// page over the photo that moves the point, and a gallery tile that crops a photo badly without a word.
const photo: UploadDetails = { url: '/foto.jpg', name: 'foto.jpg', size: 1, width: 1600, height: 1200, focus: { x: 0.2, y: 0.3 } }

function mounted(allowed: boolean, aspect: unknown = { card: '3:2', header: '21:9', portrait: '3:4' }, tile = false, fail = false) {
  const field = aspect === null ? { type: 'image', label: 'Foto' } : { type: 'image', label: 'Foto', aspect }
  const saved: unknown[] = []
  const details = ref<Record<string, UploadDetails>>({ f1: photo })
  const assets: GinkoAssets = {
    state: () => ref({ status: 'ready' }),
    details: () => details,
    upload: async () => 'id',
    focus: { allowed: ref(allowed), set: async (file, focus) => { if (fail) throw new Error('offline'); saved.push([file, focus]) } },
  }
  const wrapper = mount(GinkoFieldImage, {
    props: { id: 't', field: field as never, modelValue: { file: 'f1', alt: { de: 'Honig' } }, invalid: false, locale: 'de', tile },
    global: { provide: { [GINKO_ASSETS as symbol]: assets } },
  })
  return { wrapper, saved, details }
}
const tiles = (wrapper: ReturnType<typeof mounted>['wrapper']) => wrapper.findAll('[data-testid="frame"]').map((tile) => ({
  aspect: (tile.get('div').element as HTMLElement).style.aspectRatio,
  position: (tile.get('img').element as HTMLElement).style.objectPosition,
  text: tile.text(),
}))

describe('image field with frames', () => {
  test('shows every frame in its shape around the saved focus point, and warns about a turned photo', () => {
    const { wrapper } = mounted(true)
    expect(tiles(wrapper)).toEqual([
      { aspect: '3 / 2', position: '20% 30%', text: 'Querformat 3:2' },
      { aspect: '21 / 9', position: '20% 30%', text: 'Panorama 21:9' },
      { aspect: '3 / 4', position: '20% 30%', text: 'Hochformat 3:4Das Foto liegt quer: Links und rechts fällt viel weg.' },
    ])
  })

  test('a click on the photo moves every frame at once and saves the point for the library photo', async () => {
    const { wrapper, saved } = mounted(true)
    const area = wrapper.get('[data-testid="focus-area"]')
    area.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 }) as DOMRect
    await area.trigger('pointerdown', { button: 0, clientX: 150, clientY: 30, pointerId: 1 })
    expect(tiles(wrapper).map((t) => t.position)).toEqual(['75% 20%', '75% 20%', '75% 20%'])
    await area.trigger('pointerup', { pointerId: 1 })
    await flushPromises()
    expect(saved).toEqual([['f1', { x: 0.75, y: 0.2 }]])
  })

  test('after a save that changed nothing, a point set elsewhere (Files, another admin) still shows', async () => {
    const { wrapper, details } = mounted(true)
    const area = wrapper.get('[data-testid="focus-area"]')
    area.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 }) as DOMRect
    await area.trigger('pointerdown', { button: 0, clientX: 40, clientY: 45, pointerId: 1 })
    await area.trigger('pointerup', { pointerId: 1 })
    await flushPromises()
    details.value = { f1: { ...photo, focus: { x: 0.9, y: 0.1 } } }
    await flushPromises()
    expect(tiles(wrapper)[0]!.position).toBe('90% 10%')
  })

  test('a failed save says so and shows the saved point again', async () => {
    const { wrapper } = mounted(true, undefined, false, true)
    const area = wrapper.get('[data-testid="focus-area"]')
    area.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 }) as DOMRect
    await area.trigger('pointerdown', { button: 0, clientX: 150, clientY: 30, pointerId: 1 })
    await area.trigger('pointerup', { pointerId: 1 })
    await flushPromises()
    expect([wrapper.get('[role="alert"]').text(), tiles(wrapper)[0]!.position]).toEqual(['Der Fokuspunkt wurde nicht gespeichert. Bitte versuche es noch einmal.', '20% 30%'])
  })

  test('staff see the frames but cannot move the point', async () => {
    const { wrapper, saved } = mounted(false)
    const area = wrapper.get('[data-testid="focus-area"]')
    area.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 }) as DOMRect
    await area.trigger('pointerdown', { button: 0, clientX: 150, clientY: 30, pointerId: 1 })
    await area.trigger('pointerup', { pointerId: 1 })
    expect([saved, tiles(wrapper)[0]!.position, area.attributes('tabindex')]).toEqual([[], '20% 30%', undefined])
    expect(wrapper.text()).toContain('legen Inhaber und Admins fest')
  })

  test('on touch a tap sets the point, a scroll that starts on the photo does not', async () => {
    const { wrapper, saved } = mounted(true)
    const area = wrapper.get('[data-testid="focus-area"]')
    area.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 150 }) as DOMRect
    await area.trigger('pointerdown', { button: 0, pointerType: 'touch', clientX: 50, clientY: 100, pointerId: 2 })
    await area.trigger('pointercancel', { pointerType: 'touch', pointerId: 2 })
    await area.trigger('pointerdown', { button: 0, pointerType: 'touch', clientX: 50, clientY: 100, pointerId: 3 })
    await area.trigger('pointerup', { pointerType: 'touch', clientX: 50, clientY: 40, pointerId: 3 })
    await flushPromises()
    expect([saved, tiles(wrapper)[0]!.position]).toEqual([[], '20% 30%'])
    await area.trigger('pointerdown', { button: 0, pointerType: 'touch', clientX: 50, clientY: 100, pointerId: 4 })
    await area.trigger('pointerup', { pointerType: 'touch', clientX: 52, clientY: 101, pointerId: 4 })
    await flushPromises()
    expect(saved).toEqual([['f1', { x: 0.25, y: 0.667 }]])
  })

  test('a gallery tile in a frame that cuts the photo badly says so, and offers its Ausschnitt to the owner', () => {
    const owner = mounted(true, '3:4', true).wrapper
    expect(owner.text()).toContain('Wird stark beschnitten')
    expect(owner.find('[aria-label="Ausschnitt"]').exists()).toBe(true)
    const fits = mounted(false, '4:3', true).wrapper
    expect([fits.text().includes('beschnitten'), fits.find('[aria-label="Ausschnitt"]').exists()]).toEqual([false, false])
  })

  test('a field without frames keeps its plain card', () => {
    const { wrapper } = mounted(true, null)
    expect([wrapper.findAll('[data-testid="frame"]').length, wrapper.find('[data-testid="focus-area"]').exists()]).toEqual([0, false])
  })
})
