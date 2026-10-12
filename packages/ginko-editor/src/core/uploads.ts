// The place of a picture that is still being uploaded. It is not part of the document (so a save never holds a
// half-made image): a widget at a position that follows the text around it. `finishUpload` swaps it for the image,
// `cancelUpload` removes it.
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** The default (German) text of the placeholder; `startUpload` takes the text in the UI language. */
export const UPLOADING_TEXT = 'wird hochgeladen …'

const key = new PluginKey<DecorationSet>('ginkoUploads')

interface Meta { add?: { id: string; pos: number; text: string }; remove?: string }

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
            if (meta?.add) return next.add(tr.doc, [Decoration.widget(meta.add.pos, () => placeholder(meta.add!.text), { id: meta.add.id, side: 1, key: meta.add.id })])
            if (meta?.remove) return next.remove(next.find(undefined, undefined, (spec) => spec.id === meta.remove))
            return next
          },
        },
        props: { decorations: (state) => key.getState(state) },
      })]
    },
  })
}

const where = (editor: Editor, id: string) => key.getState(editor.state)?.find(undefined, undefined, (spec) => spec.id === id)[0]?.from

/** Shows the place at `pos`, called `id`, with `text` (default German) in it. Returns false when the editor has no such place (a profile without images). */
export function startUpload(editor: Editor, id: string, pos: number, text: string = UPLOADING_TEXT): boolean {
  if (!key.getState(editor.state) || !editor.schema.nodes.image) return false
  editor.view.dispatch(editor.state.tr.setMeta(key, { add: { id, pos, text } } satisfies Meta))
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
 * Swaps the place `id` for the image. Returns the position of the image, or undefined when the place is gone
 * (the text around it was deleted) and nothing was inserted.
 */
export function finishUpload(editor: Editor, id: string, image: { src: string; alt: string }): number | undefined {
  if (editor.isDestroyed) return undefined
  const at = where(editor, id)
  if (at === undefined) return undefined
  const type = editor.schema.nodes.image
  if (!type) { cancelUpload(editor, id); return undefined }
  const tr = editor.state.tr.setMeta(key, { remove: id } satisfies Meta)
  tr.insert(at, type.create({ src: image.src, alt: image.alt }))
  editor.view.dispatch(tr)
  return at
}
