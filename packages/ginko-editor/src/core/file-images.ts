// Pictures of the Files library in a Markdown text: the image node keeps its source as stored (`$file.k57…`), so the
// text stays byte for byte; only what the editor draws is the file's URL. The host knows the files (`FileImages`).
import { fileRefOf } from '@lupinum/ginko/internal'
import type { NodeViewRenderer } from '@tiptap/core'
import { effectScope, shallowRef, watchEffect } from 'vue'
import type { FileImages } from '../assets.ts'

/**
 * What a picture with `src` shows: any other address as it is; for `$file.<id>` the file's URL, undefined while it
 * loads (or without `images`), null when the library has no ready file with this ID.
 */
export function shownSrc(images: FileImages | undefined, src: string): string | null | undefined {
  if (fileRefOf(src) === undefined) return src
  const file = images?.file(src)
  return file === null ? null : file?.url
}

/** The node view of `image`: the picture with its shown address, or a small note when its library file is gone. */
export function fileImageView(images: FileImages): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement('span')
    dom.className = 'ginko-image'
    const img = document.createElement('img')
    const missing = document.createElement('span')
    missing.className = 'ginko-image-missing'
    const current = shallowRef(node)
    const scope = effectScope(true)
    scope.run(() => watchEffect(() => {
      const { src, alt, title } = current.value.attrs as { src: string | null; alt: string | null; title: string | null }
      const shown = shownSrc(images, src ?? '')
      if (shown === null) {
        missing.textContent = images.missingText()
        dom.replaceChildren(missing)
        return
      }
      // While the file loads there is nothing to draw yet (an image without address would show as broken).
      if (shown === undefined) { dom.replaceChildren(); return }
      img.setAttribute('src', shown)
      img.setAttribute('alt', alt ?? '')
      if (title) img.setAttribute('title', title)
      else img.removeAttribute('title')
      dom.replaceChildren(img)
    }))
    images.want(String(node.attrs.src ?? ''))
    return {
      dom,
      update(next) {
        if (next.type !== node.type) return false
        images.want(String(next.attrs.src ?? ''))
        current.value = next
        return true
      },
      destroy() { scope.stop() },
    }
  }
}
