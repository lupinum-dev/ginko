'use node'
// Image processing for uploads (SPEC 4.3 point 2). Pure: bytes in, WebP bytes out, no Convex.
// Rotation follows the EXIF orientation; no metadata is written, so GPS and camera data are gone.
// "use node" keeps sharp (native) out of the default runtime bundle; this file exports no Convex functions.
import sharp, { type OutputInfo } from 'sharp'

export const MAX_EDGE = 2400
/** Widths (px) of the smaller copies for a srcset; only those narrower than the image are made. */
export const VARIANT_WIDTHS = [480, 960, 1600] as const

/** The input is not an image that sharp can read; `key` is the message for the person. Retrying the same bytes cannot help. */
export class UnreadableImageError extends Error {
  key: 'errors.uploadNotAnImage' | 'errors.uploadTooManyPixels'
  constructor(message: string) {
    super(message)
    // sharp refuses an image over its pixel limit (about 268 megapixels) before it decodes it: a readable but too large picture.
    this.key = /pixel limit/i.test(message) ? 'errors.uploadTooManyPixels' : 'errors.uploadNotAnImage'
  }
}

export type ImageVariant = { width: number; bytes: Uint8Array<ArrayBuffer> }

/** WebP copies of an already processed image (rotated, no metadata), one per VARIANT_WIDTHS entry narrower than `width`. */
export async function makeVariants(bytes: Uint8Array, width: number): Promise<ImageVariant[]> {
  return Promise.all(VARIANT_WIDTHS.filter((w) => w < width).map(async (w) => {
    const out = await sharp(bytes).resize({ width: w }).webp().toBuffer()
    return { width: w, bytes: new Uint8Array(out) }
  }))
}

export async function processImage(bytes: Uint8Array): Promise<{ bytes: Uint8Array<ArrayBuffer>; width: number; height: number; variants: ImageVariant[] }> {
  let out: { data: Buffer; info: OutputInfo }
  let variants: ImageVariant[]
  try {
    out = await sharp(bytes)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer({ resolveWithObject: true })
    variants = await makeVariants(out.data, out.info.width)
  } catch (error) {
    throw new UnreadableImageError(error instanceof Error ? error.message : String(error))
  }
  return { bytes: new Uint8Array(out.data), width: out.info.width, height: out.info.height, variants }
}
