// @vitest-environment node
// processImage runs sharp, a native module, so this file uses the Node environment.
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processImage, UnreadableImageError } from '../convex/image'

describe('processImage', () => {
  it('removes the GPS data of a photo', async () => {
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#2f7d4a' } })
      .withExif({
        IFD0: { Copyright: 'Matthias' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '52/1 31/1 2/1', GPSLongitudeRef: 'E', GPSLongitude: '13/1 24/1 1/1' },
      })
      .jpeg()
      .toBuffer()
    expect((await sharp(photo).metadata()).exif).toBeDefined()

    const out = await processImage(new Uint8Array(photo))
    expect((await sharp(out.bytes).metadata()).exif).toBeUndefined()
  })

  it('scales the longest edge down to 2400 px and writes WebP', async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#2f7d4a' } }).png().toBuffer()

    const out = await processImage(new Uint8Array(big))
    expect({ width: out.width, height: out.height }).toEqual({ width: 2400, height: 1800 })
    expect(await sharp(out.bytes).metadata()).toMatchObject({ format: 'webp', width: 2400, height: 1800 })
  })

  it.each([
    [2000, [480, 960, 1600]],
    [600, [480]],
    [480, []],
  ])('makes WebP variants only narrower than the image (%i px wide -> %j)', async (width, expected) => {
    const png = await sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: '#2f7d4a' } }).png().toBuffer()

    const out = await processImage(new Uint8Array(png))
    expect(out.variants.map((v) => v.width)).toEqual(expected)
    for (const variant of out.variants) expect(await sharp(variant.bytes).metadata()).toMatchObject({ format: 'webp', width: variant.width })
  })

  // Wrong behaviour caught: a valid 20000 × 20000 px PNG was called "not a readable image"; the cause is sharp's pixel limit.
  it('names too many pixels as the reason when an image is over the pixel limit', async () => {
    // A PNG header of 20000 × 20000 px with a tiny image data block; sharp refuses it before decoding.
    const huge = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAATiAAAE4gCAAAAADGGxnlAAAAKklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAC4ME4hAAE+tdW1AAAAAElFTkSuQmCC', 'base64'))
    await expect(processImage(huge)).rejects.toMatchObject({ key: 'errors.uploadTooManyPixels' })
  })

  it('reports bytes it cannot decode as unreadable', async () => {
    await expect(processImage(new TextEncoder().encode('kein Bild'))).rejects.toBeInstanceOf(UnreadableImageError)
  })
})
