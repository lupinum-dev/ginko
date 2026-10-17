// The place of a picture that is still being uploaded. It is not part of the document (so a save never holds a
// half-made image): a widget at a position that follows the text around it. `finishUpload` swaps it for the image,
// `cancelUpload` removes it. A picture that replaces another waits next to it: the old one goes only when the new one
// is ready, in the same step, so a failed upload leaves the text as it was.
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** The default (German) text of the placeholder; `startUpload` takes the text in the UI language. */
export const UPLOADING_TEXT = 'wird hochgeladen …'

const key = new PluginKey<DecorationSet>('ginkoUploads')

interface Meta { add?: { id: string; pos: number; text: string; replaces?: string }; remove?: string }

function placeholder(text: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'ginko-uploading'
  el.setAttribute('data-ginko-uploading', '')
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('role', 'status')
  el.textContent = text
  return el
}

export function uploadPlaceholders() {
  return Extension.create({
    name: 'ginkoUploads',
    addProseMirrorPlugins() {
      return [new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = set.map(tr.mapping, tr.doc)
            const meta = tr.getMeta(key) as Meta | undefined
            // A replacing place sits right after its picture and sticks to it (side -1).
            if (meta?.add) {
              const { id, pos, text, replaces } = meta.add
              return next.add(tr.doc, [Decoration.widget(pos, () => placeholder(text), { id, side: replaces === undefined ? 1 : -1, key: id, replaces })])
            }
            if (meta?.remove) return next.remove(next.find(undefined, undefined, (spec) => spec.id === meta.remove))
            return next
          },
        },
        props: { decorations: (state) => key.getState(state) },
      })]
    },
  })
}

const found = (editor: Editor, id: string) => key.getState(editor.state)?.find(undefined, undefined, (spec) => spec.id === id)[0]
const where = (editor: Editor, id: string) => found(editor, id)?.from

/**
 * Shows the place at `pos`, called `id`, with `text` (default German) in it. With `replace`, `pos` is a picture that the
 * upload replaces: the place shows after it, and the picture stays until `finishUpload`. Returns false when the editor
 * has no such place (a profile without images).
 */
export function startUpload(editor: Editor, id: string, pos: number, text: string = UPLOADING_TEXT, replace = false): boolean {
  if (!key.getState(editor.state) || !editor.schema.nodes.image) return false
  const old = replace ? editor.state.doc.nodeAt(pos) : undefined
  const add = old?.type.name === 'image' ? { id, pos: pos + old.nodeSize, text, replaces: String(old.attrs.src ?? '') } : { id, pos, text }
  editor.view.dispatch(editor.state.tr.setMeta(key, { add } satisfies Meta))
  return true
}

/** True while the place `id` is in the document. */
export const isUploading = (editor: Editor, id: string) => where(editor, id) !== undefined

/** Removes the place without inserting anything (upload failed or cancelled). */
export function cancelUpload(editor: Editor, id: string): void {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(key, { remove: id } satisfies Meta))
}

/**
 * Swaps the place `id` for the image; a replacing place also removes its picture, when that is still there unchanged
 * (else the image goes in at the place). Returns the position of the image, or undefined when the place is gone (the
 * text around it was deleted) and nothing was inserted.
 */
export function finishUpload(editor: Editor, id: string, image: { src: string; alt: string }): number | undefined {
  if (editor.isDestroyed) return undefined
  const place = found(editor, id)
  if (!place) return undefined
  const type = editor.schema.nodes.image
  if (!type) { cancelUpload(editor, id); return undefined }
  const at = place.from
  const replaces = (place.spec as { replaces?: string }).replaces
  const before = editor.state.doc.resolve(at).nodeBefore
  const old = replaces !== undefined && before?.type.name === 'image' && String(before.attrs.src ?? '') === replaces ? before : undefined
  const tr = editor.state.tr.setMeta(key, { remove: id } satisfies Meta)
  const from = old ? at - old.nodeSize : at
  tr.replaceWith(from, at, type.create({ src: image.src, alt: image.alt }))
  editor.view.dispatch(tr)
  return from
}
