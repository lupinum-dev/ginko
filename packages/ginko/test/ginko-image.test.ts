import { renderToString } from 'vue/server-renderer'
import { createSSRApp, h } from 'vue'
import { describe, expect, test } from 'vitest'
import { GinkoImage } from '../src/nuxt/runtime/GinkoImage.ts'

const image = { url: '/a.jpg', alt: 'A', width: 10, height: 20 }
const render = (value: Parameters<typeof h>[1]) => renderToString(createSSRApp({ render: () => h(GinkoImage, value) }))

describe('GinkoImage srcset and sizes', () => {
  const variants = [{ width: 480, url: '/a-480.webp' }, { width: 960, url: '/a-960.webp' }]
  const full = { ...image, width: 1600 }
  test.each([
    ['variants and the original; sizes defaults to 100vw', { image: { ...full, variants } }, '<img src="/a.jpg" alt="A" width="1600" height="20" srcset="/a-480.webp 480w, /a-960.webp 960w, /a.jpg 1600w" sizes="100vw" loading="lazy" decoding="async">'],
    ['the sizes prop wins over the default', { image: { ...full, variants }, sizes: '(max-width: 600px) 100vw, 50vw' }, '<img src="/a.jpg" alt="A" width="1600" height="20" srcset="/a-480.webp 480w, /a-960.webp 960w, /a.jpg 1600w" sizes="(max-width: 600px) 100vw, 50vw" loading="lazy" decoding="async">'],
    ['no variants: no srcset attribute', { image: full }, '<img src="/a.jpg" alt="A" width="1600" height="20" loading="lazy" decoding="async">'],
  ])('%s', async (_name, value, expected) => {
    expect(await render(value)).toBe(expected)
  })
})

describe('GinkoImage focus point', () => {
  test('writes object-position from the focus point', async () => {
    expect(await render({ image: { ...image, focus: { x: 0.3, y: 0.7 } } })).toContain('style="object-position:30% 70%;"')
  })
  test('adds no style without a focus point', async () => {
    expect(await render({ image })).not.toContain('style=')
  })
})

describe('GinkoImage frames', () => {
  const photo = { url: '/a.jpg', alt: 'A', width: 1600, height: 1200, focus: { x: 0.25, y: 0.6 } }
  const cropped = (aspect: string, height: number) => `<img src="/a.jpg" alt="A" width="1600" height="${height}" style="aspect-ratio:${aspect};object-fit:cover;object-position:25% 60%;" loading="lazy" decoding="async">`
  const uncropped = '<img src="/a.jpg" alt="A" width="1600" height="1200" style="object-position:25% 60%;" loading="lazy" decoding="async">'
  test.each([
    ['the field’s only ratio, with no frame named', { image: { ...photo, aspect: '3:4' } }, cropped('3 / 4', 2133)],
    ['a named frame', { image: { ...photo, aspect: { card: '3:2', header: '21:9' } }, frame: 'header' }, cropped('21 / 9', 686)],
    ['original shows the whole photo', { image: { ...photo, aspect: '3:4' }, frame: 'original' }, uncropped],
    ['an unknown frame name shows the whole photo', { image: { ...photo, aspect: { card: '3:2' } }, frame: 'hero' }, uncropped],
    ['several frames and none named show the whole photo', { image: { ...photo, aspect: { card: '3:2', header: '21:9' } } }, uncropped],
  ])('%s', async (_name, value, expected) => {
    expect(await render(value)).toBe(expected)
  })

  test('a frame without a focus point crops around the middle', async () => {
    expect(await render({ image: { ...image, width: 1000, height: 1000, aspect: '2:1' } })).toContain('style="aspect-ratio:2 / 1;object-fit:cover;object-position:50% 50%;"')
  })
})
