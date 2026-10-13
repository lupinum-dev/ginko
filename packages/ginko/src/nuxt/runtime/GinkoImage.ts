// Renders an image field (`{ url, alt, width, height }`) with its real size, so the page does not shift
// while the image loads. Registered by the Ginko module in every site. With variants, it also writes a srcset so phones download small files.
import { defineComponent, h, type PropType } from 'vue'
import type { ImageValue } from '../../internal.ts'

/** `object-position` for a focus point, so a cropped image keeps that point in view. */
const positionOf = (focus: { x: number; y: number }) => `${Math.round(focus.x * 1000) / 10}% ${Math.round(focus.y * 1000) / 10}%`

/** `srcset` from the variants, then the original at its real width (only when the width is known). */
const srcsetOf = (image: ImageValue) => [
  ...(image.variants ?? []).map((v) => `${v.url} ${v.width}w`),
  ...(image.width > 0 ? [`${image.url} ${image.width}w`] : []),
].join(', ')

export const GinkoImage = defineComponent({
  name: 'GinkoImage',
  props: {
    image: { type: Object as PropType<ImageValue | undefined>, default: undefined },
    /** The `sizes` attribute. Defaults to `100vw` when the image has variants; otherwise set only when given. */
    sizes: { type: String, default: undefined },
    /** Above the fold: load at once with high priority (the page's main image). Others load lazily. */
    eager: { type: Boolean, default: false },
  },
  setup(props) {
    return () => {
      const image = props.image
      if (!image) return null
      return h('img', {
        src: image.url,
        alt: image.alt,
        width: image.width || undefined,
        height: image.height || undefined,
        ...(image.focus ? { style: { objectPosition: positionOf(image.focus) } } : {}),
        ...(image.variants?.length ? { srcset: srcsetOf(image), sizes: props.sizes ?? '100vw' } : props.sizes ? { sizes: props.sizes } : {}),
        loading: props.eager ? 'eager' : 'lazy',
        decoding: 'async',
        fetchpriority: props.eager ? 'high' : undefined,
      })
    }
  },
})
