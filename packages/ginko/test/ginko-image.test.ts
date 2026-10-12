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
