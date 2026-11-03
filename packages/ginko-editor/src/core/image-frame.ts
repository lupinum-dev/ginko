// The frame of a picture in a text (`![…](…){aspect="4:3" fit="contain"}`): the shapes the image menu offers, and the
// attributes on the image node (its `props`, written back to the text as they are). The site renders them with the
// same CSS as `<GinkoImage>` (markdown-view.ts in @lupinum/ginko).
import { isAspectRatio, type AspectRatio, type FrameFill } from '@lupinum/ginko/internal'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

/**
 * The shapes a picture in a text can take, each with the value the `figure` block of @lupinum/ginko-components has
 * for it: "Bildunterschrift" turns a framed picture into a figure of the same shape.
 */
export const TEXT_IMAGE_FRAMES: readonly { aspect: AspectRatio; figure: string }[] = [
  { aspect: '1:1', figure: 'square' }, { aspect: '4:3', figure: 'landscape' }, { aspect: '3:4', figure: 'portrait' },
  { aspect: '16:9', figure: 'video' }, { aspect: '2:1', figure: 'wide' },
]

export interface TextImageFrame {
  /** Undefined: the picture as it is. */
  aspect: AspectRatio | undefined
  fit: FrameFill
}

/** The frame of an image node; a frame the parser would refuse counts as none. */
export function imageFrameOf(node: PmNode): TextImageFrame {
  const props = (node.attrs.props ?? {}) as Record<string, unknown>
  const aspect = isAspectRatio(props.aspect) ? props.aspect : undefined
  return { aspect, fit: aspect && props.fit === 'contain' ? 'contain' : 'cover' }
}

/**
 * Sets the frame of the picture at `pos` and keeps it selected (the image menu stays open). `fit` is written only for
 * `contain`: cover is the default, and a frame that goes takes its fit with it. False when there is no picture at `pos`.
 */
export function setImageFrame(editor: Editor, pos: number, frame: TextImageFrame): boolean {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'image') return false
  const { aspect: _aspect, fit: _fit, ...rest } = (node.attrs.props ?? {}) as Record<string, unknown>
  const props = { ...rest, ...(frame.aspect ? { aspect: frame.aspect, ...(frame.fit === 'contain' ? { fit: 'contain' } : {}) } : {}) }
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, props })
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  editor.view.dispatch(tr)
  return true
}
