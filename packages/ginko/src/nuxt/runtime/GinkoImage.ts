// Renders an image field (`{ url, alt, width, height }`) with its real size, so the page does not shift
// while the image loads. Registered by the Ginko module in every site. With variants, it also writes a srcset so phones download small files.
// A field with a frame (`f.image(…, { aspect })`) is cropped to it around the photo's focus point, as the Studio previews it.
import { defineComponent, h, type PropType } from 'vue'
import { focusPosition, frameStyle, imageFrames, ORIGINAL_FRAME, type ImageFrame, type ImageValue } from '../../internal.ts'

/** `srcset` from the variants, then the original at its real width (only when the width is known). */
const srcsetOf = (image: ImageValue) => [
  ...(image.variants ?? []).map((v) => `${v.url} ${v.width}w`),
  ...(image.width > 0 ? [`${image.url} ${image.width}w`] : []),
].join(', ')

// Dev only: one warning per unknown frame name until the dev server restarts.
const warned = new Set<string>()

/** The frame `name` picks: the field's only frame when none is named, nothing for `original` or an unknown name. */
function frameOf(image: ImageValue, name: string | undefined): ImageFrame | undefined {
  if (name === ORIGINAL_FRAME) return undefined
  const frames = imageFrames(image.aspect)
  const frame = name === undefined ? (frames.length === 1 ? frames[0] : undefined) : frames.find((f) => f.name === name)
  if (import.meta.dev && frames.length && !frame) {
    const named = frames.map((f) => f.name).filter(Boolean)
    const key = `${image.url} ${name}`
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(name === undefined || !named.length
        ? `[ginko] <GinkoImage> shows ${image.url} uncropped: name its frame with frame="${named.join('" or frame="')}".`
        : `[ginko] <GinkoImage> has no frame “${name}” for ${image.url}; the field has ${named.join(', ')}. It is shown uncropped.`)
    }
  }
  return frame
}

export const GinkoImage = defineComponent({
  name: 'GinkoImage',
  props: {
    image: { type: Object as PropType<ImageValue | undefined>, default: undefined },
    /**
     * Which of the field's named frames to crop to (`aspect: { card: '3:2', … }` → `frame="card"`). A field with one
     * ratio needs none. `original` shows the whole photo (a lightbox, say).
     */
    frame: { type: String, default: undefined },
    /** The `sizes` attribute. Defaults to `100vw` when the image has variants; otherwise set only when given. */
    sizes: { type: String, default: undefined },
    /** Above the fold: load at once with high priority (the page's main image). Others load lazily. */
    eager: { type: Boolean, default: false },
  },
  setup(props) {
    return () => {
      const image = props.image
      if (!image) return null
      const frame = frameOf(image, props.frame)
      // In a frame, width and height have its shape (the browser keeps that space free, with or without a CSS reset);
      // the photo fills it, cut around its focus point.
      const height = frame && image.width ? Math.round(image.width / frame.ratio) : image.height
      const position = image.focus ? focusPosition(image.focus) : undefined
      const style = frame ? frameStyle(frame.aspect, 'cover', position) : position ? { objectPosition: position } : undefined
      return h('img', {
        src: image.url,
        alt: image.alt,
        width: image.width || undefined,
        height: height || undefined,
        ...(style ? { style } : {}),
        ...(image.variants?.length ? { srcset: srcsetOf(image), sizes: props.sizes ?? '100vw' } : props.sizes ? { sizes: props.sizes } : {}),
        loading: props.eager ? 'eager' : 'lazy',
        decoding: 'async',
        fetchpriority: props.eager ? 'high' : undefined,
      })
    }
  },
})
