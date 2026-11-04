// Frames of an image field (`f.image(…, { aspect })`): the shapes the site crops a photo to. The Studio previews the
// photo in each, `<GinkoImage>` crops to one; both read this module, so the preview and the site cannot drift apart.
import type { AspectRatio, ImageField } from './types.ts'

export interface ImageFrame {
  /** The frame's name in `aspect: { card: '3:2' }`; undefined for a single ratio (`aspect: '3:2'`). */
  name: string | undefined
  aspect: AspectRatio
  /** Width divided by height: 1.5 for `3:2`. */
  ratio: number
}

/** `frame="original"` on `<GinkoImage>`: the whole photo, uncropped. No frame may take this name. */
export const ORIGINAL_FRAME = 'original'
/** The narrowest and the widest frame (1:10 and 10:1). */
const RATIO_LIMIT = 10
const RATIO = /^(\d{1,4}(?:\.\d{1,3})?):(\d{1,4}(?:\.\d{1,3})?)$/
const FRAME_NAME = /^[a-z][a-zA-Z0-9]{0,30}$/
const MAX_FRAMES = 8

/** Width divided by height of `3:2`, `1.91:1`; undefined for anything else, zero sides and shapes past 1:10 or 10:1. */
export function aspectRatio(aspect: unknown): number | undefined {
  const match = typeof aspect === 'string' ? RATIO.exec(aspect) : null
  if (!match) return undefined
  const [w, h] = [Number(match[1]), Number(match[2])]
  if (!(w > 0 && h > 0)) return undefined
  const ratio = w / h
  return ratio >= 1 / RATIO_LIMIT && ratio <= RATIO_LIMIT ? ratio : undefined
}

/** A valid frame shape (`aspectRatio` knows it). */
export const isAspectRatio = (value: unknown): value is AspectRatio => aspectRatio(value) !== undefined

/** The frames of an image field in config order; none without `aspect` (the site shows the photo as it is). */
export function imageFrames(aspect: ImageField['aspect'] | undefined): ImageFrame[] {
  if (aspect === undefined) return []
  const entries: [string | undefined, unknown][] = typeof aspect === 'string' ? [[undefined, aspect]] : Object.entries(aspect)
  return entries.flatMap(([name, value]) => {
    return isAspectRatio(value) ? [{ name, aspect: value, ratio: aspectRatio(value)! }] : []
  })
}

/**
 * What `checkSchema` says about an `aspect` option at `path`; empty when it is valid. `reserved`: names no key may
 * take (`constructor`, …), as for pages, bricks and fields.
 */
export function aspectProblems(path: string, aspect: unknown, reserved: ReadonlySet<string> = new Set()): string[] {
  const ratioProblem = (at: string, value: unknown) => aspectRatio(value) === undefined
    ? [`${at}: “${String(value)}” is no frame; write width:height, such as '3:2' or '1.91:1' (between 1:10 and 10:1).`]
    : []
  if (typeof aspect === 'string') return ratioProblem(`${path}.aspect`, aspect)
  if (typeof aspect !== 'object' || aspect === null || Array.isArray(aspect)) return [`${path}.aspect: write one ratio, such as '3:2', or named frames, such as { card: '3:2', header: '21:9' }.`]
  const entries = Object.entries(aspect)
  if (entries.length === 0 || entries.length > MAX_FRAMES) return [`${path}.aspect: 1 to ${MAX_FRAMES} frames.`]
  return entries.flatMap(([name, value]) => [
    ...(!FRAME_NAME.test(name) || name === ORIGINAL_FRAME || reserved.has(name) ? [`${path}.aspect: “${name}” is no frame name; use letters and digits, starting with a lowercase letter (not “${ORIGINAL_FRAME}”).`] : []),
    ...ratioProblem(`${path}.aspect.${name}`, value),
  ])
}

/** How a photo fills its frame: `cover` cuts it to the frame around its focus point, `contain` shows all of it inside. */
export type FrameFill = 'cover' | 'contain'
export const FRAME_FILLS: readonly FrameFill[] = ['cover', 'contain']

/** `object-position` of a focus point (0..1 from the top left, clamped to the photo), one decimal: `25% 60%`. */
export const focusPosition = (focus: { x: number; y: number }) => `${percent(focus.x)} ${percent(focus.y)}`
const percent = (share: number) => `${Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10}%`

/**
 * The CSS that puts a photo in the frame `aspect`, as `<GinkoImage>`, a picture in a text and the Studio show it: the
 * frame's shape, and for `cover` the photo cut around `position` (an `object-position`; the middle without one).
 */
export function frameStyle(aspect: AspectRatio, fill: FrameFill = 'cover', position?: string): Record<string, string> {
  return { aspectRatio: aspect.replace(':', ' / '), objectFit: fill, ...(fill === 'cover' ? { objectPosition: position ?? '50% 50%' } : {}) }
}

/**
 * The longest side, in pixels, that the cropped part of a photo should have: enough for a sharp picture across a
 * laptop screen or on a phone's sharp display, and the width of a share image (1200 × 630).
 */
export const FRAME_MIN_PIXELS = 1200

export interface FrameFit {
  /** The part of the photo the frame shows, in pixels (`object-fit: cover`). */
  width: number
  height: number
  /** Share of the photo's area the frame shows, 0..1. */
  kept: number
  /** The photo is upright and the frame lies, or the other way round: much of the photo is cut off. */
  turned: boolean
  /** The shown part is smaller than FRAME_MIN_PIXELS on its long side: it looks blurred when shown large. */
  small: boolean
}

/** How a photo of `width` × `height` pixels fits `ratio`; undefined while its size is unknown. */
export function frameFit(width: number, height: number, ratio: number): FrameFit | undefined {
  if (!(width > 0 && height > 0)) return undefined
  const photo = width / height
  const [w, h] = photo > ratio ? [height * ratio, height] : [width, width / ratio]
  // A square frame or photo fits either way: only an upright photo in a lying frame (or reverse) is turned.
  const turned = (photo < 1 && ratio > 1) || (photo > 1 && ratio < 1)
  return { width: Math.round(w), height: Math.round(h), kept: (w * h) / (width * height), turned, small: Math.max(w, h) < FRAME_MIN_PIXELS }
}
