// A frame's shape in words, for its name in the Studio: "Hochformat" and its ratio (`fields.image.frames.<shape>`). The
// image field's frames and the shapes of a picture in a text use it, so one shape has one name everywhere.
import { aspectRatio } from '@lupinum/ginko/internal'

export type FrameShape = 'square' | 'portrait' | 'landscape' | 'wide'

export function frameShape(aspect: string): FrameShape {
  const ratio = aspectRatio(aspect) ?? 1
  return Math.abs(ratio - 1) < 0.02 ? 'square' : ratio < 1 ? 'portrait' : ratio >= 2 ? 'wide' : 'landscape'
}
