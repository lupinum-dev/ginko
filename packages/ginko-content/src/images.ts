import { createHash } from 'node:crypto'
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import type { Json } from '@lupinum/ginko'
import { imageInfo } from '@lupinum/ginko/internal'

/** Where content-addressed images are served from; the Nuxt module copies the registered files to this folder. */
export const IMAGE_URL_PREFIX = '/_ginko/img/'

/** Widths of the WebP copies; a copy is made only for a width strictly below the image's own. */
export const VARIANT_WIDTHS = [480, 960, 1600] as const

const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

export const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex').slice(0, 16)

/** The WebP copies a raster image of `width` px gets (file name and width, ascending). The build writes them and the markup points at them. SVG, GIF and unknown types get none. */
export function variantFiles(path: string, hash: string, width: number): { width: number; name: string }[] {
  if (!RASTER.has(extname(path).toLowerCase())) return []
  return VARIANT_WIDTHS.filter((w) => w < width).map((w) => ({ width: w, name: `${hash}-${w}.webp` }))
}

export interface ImageCx {
  contentDir: string
  publicDir: string
  /** Markdown file path relative to `contentDir`. */
  file: string
  /** URL → absolute path of every content image registered so far. */
  images: Map<string, string>
  /** Original relative `src` → served URL, for {@link renameInText}. */
  renames: Map<string, string>
  /** Component tag → its image props (`f.image` fields); those props hold image paths. */
  imageProps: Record<string, readonly string[]>
  /** Component tags that declare `width` and `height`; their image `src` gets the pixel size. */
  sized: ReadonlySet<string>
  fail: (message: string) => void
}

/** The first `bytes` bytes of a file: enough for an image header, without reading a large PDF whole. */
export function head(path: string, bytes: number): Uint8Array {
  const fd = openSync(path, 'r')
  try {
    const buffer = new Uint8Array(bytes)
    return buffer.subarray(0, readSync(fd, buffer, 0, bytes, 0))
  } finally { closeSync(fd) }
}

const isElement = (node: Json): node is [string, Record<string, Json>, ...Json[]] =>
  Array.isArray(node) && typeof node[0] === 'string' && typeof node[1] === 'object' && node[1] !== null && !Array.isArray(node[1])

function isFile(path: string): boolean {
  try { return statSync(path).isFile() } catch { return false }
}

/**
 * Gives every `img` node of a Markdown tree its pixel size (CONTENT.md "Bilder"), and every image prop of a
 * component node the same treatment. A relative `src` is resolved against the file's folder, must stay inside
 * `content/`, and is registered under a content-addressed URL; `/…` sources are looked up in `public/`; remote
 * and `data:` sources stay as they are.
 */
export function rewriteImages(nodes: Json[] | undefined, cx: ImageCx): void {
  for (const node of nodes ?? []) {
    if (!isElement(node)) continue
    const tag = node[0]
    if (tag === 'img') {
      if (typeof node[1].src === 'string') rewriteImage(node[1], cx, 'src', 'set')
    } else if (Object.hasOwn(cx.imageProps, tag)) {
      for (const prop of cx.imageProps[tag]!) {
        if (typeof node[1][prop] !== 'string') continue
        rewriteImage(node[1], cx, prop, prop === 'src' && cx.sized.has(tag) ? 'keep' : 'none')
      }
    }
    rewriteImages(node.slice(2) as Json[], cx)
  }
}

/** `set` overwrites the size (plain `img`); `keep` only fills a size the author left out; `none` leaves it alone. */
type SizeMode = 'set' | 'keep' | 'none'

function setSize(props: Record<string, Json>, info: { width: number; height: number }, mode: SizeMode): void {
  if (mode === 'none') return
  if (mode === 'set' || props.width === undefined) props.width = info.width
  if (mode === 'set' || props.height === undefined) props.height = info.height
}

function rewriteImage(props: Record<string, Json>, cx: ImageCx, prop: string, mode: SizeMode): void {
  const src = props[prop] as string
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return
  const clean = src.split(/[?#]/)[0]!
  if (src.startsWith('/')) {
    const root = resolve(cx.publicDir)
    const abs = resolve(root, clean.replace(/^\/+/, ''))
    const info = abs.startsWith(root + sep) && isFile(abs) ? imageInfo(head(abs, 64 * 1024)) : undefined
    if (info) setSize(props, info, mode)
    return
  }
  const root = resolve(cx.contentDir)
  const abs = resolve(root, dirname(cx.file), decodeURI(clean))
  if (!abs.startsWith(root + sep)) return cx.fail(`Bild „${src}“ liegt außerhalb von content/.`)
  if (!isFile(abs)) return cx.fail(`Bild „${src}“ fehlt (gesucht: ${join('content', abs.slice(root.length + 1))}).`)
  const bytes = readFileSync(abs)
  const info = imageInfo(bytes)
  if (!info) return cx.fail(`Bild „${src}“ ist kein erkanntes Bildformat.`)
  const hash = hashOf(bytes)
  const url = `${IMAGE_URL_PREFIX}${hash}${extname(abs).toLowerCase()}`
  cx.images.set(url, abs)
  cx.renames.set(src, url)
  props[prop] = url
  setSize(props, info, mode)
  // Plain Markdown images only: the WebP copies (variants.ts) and the original, as GinkoImage does for image values.
  const copies = mode === 'set' ? variantFiles(abs, hash, info.width) : []
  if (copies.length) {
    props.srcset = [...copies.map((c) => `${IMAGE_URL_PREFIX}${c.name} ${c.width}w`), `${url} ${info.width}w`].join(', ')
    props.sizes = '100vw'
  }
}

/**
 * The same renames in the Markdown text the entry stores: validate() checks the text, and a relative
 * `src` is not a safe URL there. Touched are the destination of `![alt](src)` and a `name="src"` attribute
 * value of a component directive, such as `::figure{src="./a.svg"}`.
 */
export function renameInText(text: string, renames: Map<string, string>): string {
  let out = text
  for (const [from, to] of renames) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(!\\[[^\\]]*\\]\\(<?)${escaped}(?=[>)\\s])`, 'g'), (_m, head: string) => head + to)
    out = out.replace(new RegExp(`([\\w-]+=)"${escaped}"`, 'g'), (_m, head: string) => `${head}"${to}"`)
  }
  return out
}
