// A frame's name as the Studio shows it: its shape in words, then its ratio ("Hochformat 3:4"). The image field's frames
// and the shapes of a picture in a text use it, so one shape has one name everywhere.
import { aspectRatio } from '@lupinum/ginko/internal'

type Translate = (key: string) => string

export function frameLabel(aspect: string, t: Translate): string {
  const ratio = aspectRatio(aspect) ?? 1
  const shape = Math.abs(ratio - 1) < 0.02 ? 'square' : ratio < 1 ? 'portrait' : ratio >= 2 ? 'wide' : 'landscape'
  return `${t(`fields.image.frames.${shape}`)} ${aspect}`
}
