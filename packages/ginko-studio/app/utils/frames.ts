// A frame in the Studio's words: its shape for its name ("Hochformat" and its ratio, `fields.image.frames.<shape>`) and
// what is wrong with a photo in it (`fields.image.frames.<warning>`). The image field, a gallery tile and the shapes of a
// picture in a text use it, so one shape has one name and one warning everywhere.
import { aspectRatio, frameFit, type ImageFrame } from '@lupinum/ginko/internal'

export type FrameShape = 'square' | 'portrait' | 'landscape' | 'wide'

export function frameShape(aspect: string): FrameShape {
  const ratio = aspectRatio(aspect) ?? 1
  return Math.abs(ratio - 1) < 0.02 ? 'square' : ratio < 1 ? 'portrait' : ratio >= 2 ? 'wide' : 'landscape'
}

export type FrameWarning =
  | { key: 'turnedLying' | 'turnedUpright' }
  | { key: 'small'; width: number; height: number }

/**
 * What the frame does badly to a photo of `width` × `height`: cuts away much of a photo of the other orientation, or
 * shows so few pixels that it may look blurred. Null while the size is unknown or when the photo fits.
 */
export function frameWarning(width: number | null | undefined, height: number | null | undefined, frame: ImageFrame): FrameWarning | null {
  const fit = width && height ? frameFit(width, height, frame.ratio) : undefined
  if (!fit) return null
  if (fit.turned) return { key: frame.ratio < 1 ? 'turnedLying' : 'turnedUpright' }
  return fit.small ? { key: 'small', width: fit.width, height: fit.height } : null
}
