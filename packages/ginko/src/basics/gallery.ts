// A photo gallery: one list of up to 24 images.
import { f } from '../core/fields.ts'
import { single } from '../core/site.ts'
import { both, sourceOf, type BasicsOptions } from './hours-bricks.ts'

export function gallery(opts: BasicsOptions = {}) {
  return single({
    label: opts.label ?? both('Galerie', 'Gallery'),
    ...sourceOf(opts),
    fields: {
      images: f.list(both('Bilder', 'Images'), { itemLabel: both('Bild', 'Image'), fields: { image: f.image(both('Bild', 'Image')) }, max: 24, default: [] }),
    },
    tasks: [{ id: 'edit', label: both('Fotos bearbeiten', 'Edit photos'), kind: 'edit', fields: ['images'] }],
  })
}
