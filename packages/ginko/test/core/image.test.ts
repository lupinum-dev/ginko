import { describe, expect, it } from 'vitest'
import { imageInfo } from '../../src/core/index.ts'

// Header bytes written as hex, so each expected size can be checked against the byte layout by hand.
const hex = (text: string) => Uint8Array.from((text.replace(/\s/g, '').match(/../g) ?? []).map((pair) => parseInt(pair, 16)))
const text = (value: string) => new TextEncoder().encode(value)

describe('imageInfo', () => {
  // Wrong behaviour caught: a format reads width and height from the wrong offset, or swaps them.
  it.each([
    ['PNG 3x2', hex('89504e470d0a1a0a 0000000d 49484452 00000003 00000002 08060000 00'), { type: 'png', width: 3, height: 2 }],
    ['GIF89a little-endian 258x3', hex('474946383961 0201 0300 00'), { type: 'gif', width: 258, height: 3 }],
    // A JPEG APP0 segment comes before the frame header. The reader must skip it by its length.
    ['JPEG with APP0 before SOF0, 32x16', hex('ffd8 ffe00004 0000 ffc0000b08 0010 0020'), { type: 'jpeg', width: 32, height: 16 }],
    ['WebP lossy 320x240', hex('52494646 00000000 57454250 56503820 00000000 000000 9d012a 4001 f000'), { type: 'webp', width: 320, height: 240 }],
    ['WebP lossless 100x50', hex('52494646 00000000 57454250 5650384c 00000000 2f 63400c00'), { type: 'webp', width: 100, height: 50 }],
    ['WebP extended canvas 1000x500', hex('52494646 00000000 57454250 56503858 0a000000 10 000000 e70300 f30100'), { type: 'webp', width: 1000, height: 500 }],
    // The first ispe box holds the coded size, so 640x360 comes from ispe, not from the ftyp brands.
    ['AVIF 640x360', hex('0000001c 66747970 61766966 00000000 61766966 6d696631 6d696166 00000014 69737065 00000000 00000280 00000168'), { type: 'avif', width: 640, height: 360 }],
    ['SVG width and height attributes', text('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"></svg>'), { type: 'svg', width: 120, height: 80 }],
    // Percentages are not absolute sizes, so the size comes from viewBox.
    ['SVG percentage width falls back to viewBox', text('<svg width="100%" height="auto" viewBox="0 0 300 150"></svg>'), { type: 'svg', width: 300, height: 150 }],
    ['SVG after XML declaration and comment', text('<?xml version="1.0"?>\n<!-- logo -->\n<svg viewBox="0 0 24 24"></svg>'), { type: 'svg', width: 24, height: 24 }],
  ])('reads %s', (_name, bytes, expected) => {
    expect(imageInfo(bytes)).toEqual(expected)
  })

  // Wrong behaviour caught: a truncated or non-image file is reported with a guessed size, so an upload gets stored with wrong dimensions.
  it.each([
    ['empty bytes', new Uint8Array()],
    ['plain text', text('hello world')],
    ['PNG cut before height', hex('89504e470d0a1a0a 0000000d 49484452 00000003')],
    ['JPEG with no frame header before SOS', hex('ffd8 ffda0008 0102 0300 00')],
    ['SVG with no root element', text('<html></html>')],
  ])('returns undefined for %s', (_name, bytes) => {
    expect(imageInfo(bytes)).toBeUndefined()
  })
})
