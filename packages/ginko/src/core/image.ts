/**
 * Reads an image's type, width and height from its first bytes, without decoding the image.
 *
 * Pure: only Uint8Array and TextDecoder, so it runs in browsers and in Convex.
 * Width and height are the stored pixel sizes. EXIF orientation is ignored, so a JPEG
 * rotated by its EXIF tag reports its stored (unrotated) size.
 */

export type ImageType = 'png' | 'gif' | 'jpeg' | 'webp' | 'avif' | 'svg'

export type ImageInfo = {
  type: ImageType
  width: number
  height: number
}

/** Returns undefined when the bytes are not a recognised image, or when the header is truncated. */
export function imageInfo(bytes: Uint8Array): ImageInfo | undefined {
  return pngInfo(bytes) ?? gifInfo(bytes) ?? jpegInfo(bytes) ?? webpInfo(bytes) ?? avifInfo(bytes) ?? svgInfo(bytes)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngInfo(bytes: Uint8Array): ImageInfo | undefined {
  // The first chunk must be IHDR, which holds width and height as big-endian uint32 values.
  if (!matches(bytes, 0, PNG_SIGNATURE) || !matches(bytes, 12, ascii('IHDR'))) return undefined
  return sized('png', readUint(bytes, 16, 4, false), readUint(bytes, 20, 4, false))
}

function gifInfo(bytes: Uint8Array): ImageInfo | undefined {
  if (!matches(bytes, 0, ascii('GIF87a')) && !matches(bytes, 0, ascii('GIF89a'))) return undefined
  return sized('gif', readUint(bytes, 6, 2, true), readUint(bytes, 8, 2, true))
}

// Start-of-frame markers. C4 (DHT), C8 (JPG) and CC (DAC) are not frame headers.
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegInfo(bytes: Uint8Array): ImageInfo | undefined {
  if (!matches(bytes, 0, [0xff, 0xd8, 0xff])) return undefined
  // Walk the segments before the frame header. Each segment is a 0xFF marker plus a big-endian length
  // that counts its own two bytes. Any app segment (for example APP0 or APP1) can come first.
  let pos = 2
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) return undefined
    let marker = pos + 1
    while (bytes[marker] === 0xff) marker++ // skip fill bytes
    const code = bytes[marker]
    // EOI or SOS before a frame header means the file has no size we can read.
    if (code === undefined || code === 0xd9 || code === 0xda) return undefined
    // Standalone markers (TEM and RSTn) have no length field.
    if (code === 0x01 || (code >= 0xd0 && code <= 0xd7)) {
      pos = marker + 1
      continue
    }
    const length = readUint(bytes, marker + 1, 2, false)
    if (length === undefined || length < 2) return undefined
    if (JPEG_SOF_MARKERS.has(code)) {
      // Frame header layout after the marker: length (2), precision (1), height (2), width (2).
      return sized('jpeg', readUint(bytes, marker + 6, 2, false), readUint(bytes, marker + 4, 2, false))
    }
    pos = marker + 1 + length
  }
  return undefined
}

function webpInfo(bytes: Uint8Array): ImageInfo | undefined {
  if (!matches(bytes, 0, ascii('RIFF')) || !matches(bytes, 8, ascii('WEBP'))) return undefined
  // The first chunk after the RIFF header decides the layout. Each variant stores its size at a different offset.
  if (matches(bytes, 12, ascii('VP8 '))) {
    // Lossy: frame tag (3 bytes), start code 9d 01 2a, then width and height as 14-bit little-endian values.
    if (!matches(bytes, 23, [0x9d, 0x01, 0x2a])) return undefined
    const packed = readUint(bytes, 26, 4, true)
    if (packed === undefined) return undefined
    return sized('webp', packed & 0x3fff, (packed >>> 16) & 0x3fff)
  }
  if (matches(bytes, 12, ascii('VP8L'))) {
    // Lossless: signature byte 0x2f, then width-1 and height-1 as 14-bit fields in one little-endian uint32.
    if (bytes[20] !== 0x2f) return undefined
    const packed = readUint(bytes, 21, 4, true)
    if (packed === undefined) return undefined
    return sized('webp', (packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1)
  }
  if (matches(bytes, 12, ascii('VP8X'))) {
    // Extended: flags and reserved bytes (4), then canvas width-1 and height-1 as 24-bit little-endian values.
    return sized('webp', plusOne(readUint(bytes, 24, 3, true)), plusOne(readUint(bytes, 27, 3, true)))
  }
  return undefined
}

// AVIF is ISO BMFF: a size-prefixed `ftyp` box names the brands, and an `ispe` box (inside `meta`) holds the size.
const AVIF_BRANDS = [ascii('avif'), ascii('avis')]

function avifInfo(bytes: Uint8Array): ImageInfo | undefined {
  if (!matches(bytes, 4, ascii('ftyp'))) return undefined
  // Major brand at offset 8, then compatible brands from offset 16 to the end of the ftyp box.
  const ftypEnd = Math.min(readUint(bytes, 0, 4, false) ?? 0, bytes.length)
  const brandOffsets = [8]
  for (let offset = 16; offset + 4 <= ftypEnd; offset += 4) brandOffsets.push(offset)
  const isAvif = brandOffsets.some((offset) => AVIF_BRANDS.some((brand) => matches(bytes, offset, brand)))
  if (!isAvif) return undefined
  // `ispe` is a FullBox of size 20: size (4), type (4), version and flags (4), width (4), height (4).
  // The first `ispe` box is the coded size, before any irot or clap transform.
  const ispe = ascii('ispe')
  for (let type = 4; type + 16 <= bytes.length; type++) {
    if (matches(bytes, type, ispe) && readUint(bytes, type - 4, 4, false) === 20) {
      return sized('avif', readUint(bytes, type + 8, 4, false), readUint(bytes, type + 12, 4, false))
    }
  }
  return undefined
}

// Only the start of the file is decoded. An <svg> tag later than this is not found.
const SVG_SCAN_BYTES = 64 * 1024

function svgInfo(bytes: Uint8Array): ImageInfo | undefined {
  let rest = new TextDecoder().decode(bytes.subarray(0, SVG_SCAN_BYTES)).replace(/^\uFEFF/, '')
  // Skip whitespace, XML declarations, comments and DOCTYPE before the root element.
  for (;;) {
    rest = rest.trimStart()
    const skipped = /^(<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/.exec(rest)
    if (!skipped) break
    rest = rest.slice(skipped[0].length)
  }
  const tag = /^<svg\b[^>]*>/.exec(rest)?.[0]
  if (tag === undefined) return undefined
  const attribute = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)?.[1]
  // Only absolute lengths (plain numbers or px) give a size. Percentages and other units fall back to viewBox.
  const absolute = (value: string | undefined) => {
    const match = value === undefined ? null : /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/.exec(value)
    return match ? Math.round(Number(match[1])) : undefined
  }
  const width = absolute(attribute('width'))
  const height = absolute(attribute('height'))
  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    return { type: 'svg', width, height }
  }
  const box = (attribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  const [, , boxWidth = 0, boxHeight = 0] = box
  if (box.length === 4 && boxWidth > 0 && boxHeight > 0) {
    return { type: 'svg', width: Math.round(boxWidth), height: Math.round(boxHeight) }
  }
  return undefined
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0))
}

function matches(bytes: Uint8Array, offset: number, pattern: readonly number[]): boolean {
  if (offset < 0 || offset + pattern.length > bytes.length) return false
  return pattern.every((byte, i) => bytes[offset + i] === byte)
}

/** Reads an unsigned integer. Returns undefined when the bytes end before `size` bytes. */
function readUint(bytes: Uint8Array, offset: number, size: number, littleEndian: boolean): number | undefined {
  if (offset < 0 || offset + size > bytes.length) return undefined
  let value = 0
  for (let i = 0; i < size; i++) {
    const index = littleEndian ? offset + size - 1 - i : offset + i
    value = value * 256 + (bytes[index] ?? 0)
  }
  return value
}

function plusOne(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value + 1
}

/** Builds the result, or returns undefined when a dimension is missing or zero. */
function sized(type: ImageType, width: number | undefined, height: number | undefined): ImageInfo | undefined {
  if (width === undefined || height === undefined || width === 0 || height === 0) return undefined
  return { type, width, height }
}
