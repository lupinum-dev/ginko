// What happens when something is pasted or dropped into the editor, as one TipTap extension:
// - HTML from Word, Google Docs and web pages is cleaned for the field's profile (./paste-html.ts);
// - plain text that is Markdown is parsed as Markdown;
// - a bare address becomes a link (over selected text: the link's text stays; on an empty line: the UI may offer a link card);
// - image files are handed to the UI, which uploads them (./uploads.ts shows the "wird hochgeladen" place meanwhile).
import type { ComponentRegistry, MarkdownProfile } from '@lupinum/ginko/internal'
import { isSafeHref, parseMarkdown } from '@lupinum/ginko/internal'
import { Extension } from '@tiptap/core'
import { Fragment, Slice, type Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { toEditorDoc } from './convert.ts'
import { cleanPastedHtml } from './paste-html.ts'

export interface PasteOptions {
  profile: MarkdownProfile
  components?: ComponentRegistry
  /**
   * Image files that were pasted or dropped, with the position they belong at (the caret for a paste, the drop point).
   * Return true to say the UI takes them. Without it, image files are ignored.
   */
  onImageFiles?: (files: File[], pos: number) => boolean
  /** A bare address was pasted on an empty line and is now a link: the UI may offer to make it a card. `pos` = start of its paragraph. */
  onUrlPasted?: (info: { url: string; pos: number }) => void
}

const URL_ONLY = /^https?:\/\/[^\s]+$/i

/** Plain text that is meant as Markdown: a line starting a heading, list, quote or code block, or inline syntax. */
export function looksLikeMarkdown(text: string): boolean {
  if (/^( {0,3}#{1,6} \S|\s*[-*+] \S|\s*\d{1,9}[.)] \S|\s*> ?\S|```|~~~|\s*[-*_]{3,}\s*$|\|.+\|\s*$)/m.test(text)) return true
  return /\*\*[^*\n]+\*\*|(?<![\w*])_[^_\n]+_(?![\w*])|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|~~[^~\n]+~~/.test(text)
}

const textOfHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? ''

/** The image files of a clipboard or drop, when the move is about the picture (no text came with it). */
export function imageFilesOf(data: DataTransfer | null | undefined, allowText = false): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
  if (!files.length) return []
  if (!allowText && data.getData('text/plain').trim()) return []
  return files
}

/** The slice for pasted Markdown, or undefined when the text is no Markdown the profile can take. */
async function sliceOfMarkdown(text: string, view: EditorView, options: PasteOptions): Promise<Slice | undefined> {
  const { profile, components } = options
  const parsed = await parseMarkdown(text, { profile, components })
  if (parsed.problems.length) return undefined
  const { schema } = view.state
  try {
    const doc = toEditorDoc(parsed.value.nodes, { components })
    const nodes: PmNode[] = (doc.content ?? []).map((json) => schema.nodeFromJSON(json))
    nodes.forEach((node) => node.check())
    if (!nodes.length) return undefined
    // One paragraph joins the text around the caret; several blocks are blocks.
    const only = nodes.length === 1 && nodes[0]!.type.name === 'paragraph' ? nodes[0]! : undefined
    if (only) return new Slice(only.content, 0, 0)
    if (profile === 'inline') return undefined
    return new Slice(Fragment.fromArray(nodes), 0, 0)
  } catch {
    return undefined
  }
}

function insertPlain(view: EditorView, text: string) {
  view.dispatch(view.state.tr.insertText(text).scrollIntoView().setMeta('uiEvent', 'paste'))
}

/** True when the selection is inside an empty paragraph that sits directly in the document or in a component. */
function onEmptyLine(state: EditorState): boolean {
  const { $from, empty } = state.selection
  return empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0
}

/** Makes `url` a link: over a selection the selected text becomes the link, otherwise the address is inserted as linked text. */
function linkUrl(view: EditorView, url: string): boolean {
  const { state } = view
  const link = state.schema.marks.link
  if (!link || !isSafeHref(url) || !state.selection.$from.parent.inlineContent) return false
  const mark = link.create({ href: url })
  const { from, to, empty } = state.selection
  const tr = empty
    ? state.tr.insertText(url, from).addMark(from, from + url.length, mark)
    : state.tr.addMark(from, to, mark)
  if (empty) tr.removeStoredMark(link)
  view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'paste'))
  return true
}

const key = new PluginKey('ginkoPaste')

export function pasteExtension(options: PasteOptions) {
  const { profile } = options
  return Extension.create({
    name: 'ginkoPaste',
    addProseMirrorPlugins() {
      return [new Plugin({
        key,
        props: {
          // Word, Docs and web pages: only what the profile has stays.
          transformPastedHTML: (html) => cleanPastedHtml(html, { profile }),
          handlePaste: (view, event) => {
            const data = event.clipboardData
            if (!data) return false
            const files = imageFilesOf(data)
            if (files.length && options.onImageFiles) {
              if (options.onImageFiles(files, view.state.selection.to)) return true
            }
            const html = data.getData('text/html')
            const text = data.getData('text/plain')
            const trimmed = text.trim()
            // A code block keeps pasted text exactly as it is.
            if (view.state.selection.$from.parent.type.spec.code) return false
            if (URL_ONLY.test(trimmed) && (!html || textOfHtml(html) === trimmed || html.includes('<a '))) {
              const onEmpty = onEmptyLine(view.state)
              const start = view.state.selection.$from.before()
              if (!linkUrl(view, trimmed)) return false
              if (onEmpty) options.onUrlPasted?.({ url: trimmed, pos: start })
              return true
            }
            if (!html && trimmed && looksLikeMarkdown(text)) {
              void sliceOfMarkdown(text, view, options).then((slice) => {
                if (view.isDestroyed) return
                if (slice) view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView().setMeta('uiEvent', 'paste'))
                else insertPlain(view, text)
              })
              return true
            }
            return false
          },
          handleDrop: (view, event) => {
            const files = imageFilesOf(event.dataTransfer, true)
            if (!files.length || !options.onImageFiles) return false
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
            const pos = at?.pos ?? view.state.selection.to
            // The caret goes to the drop point, so the picture is inserted where it was dropped.
            const selection = TextSelection.near(view.state.doc.resolve(pos))
            view.dispatch(view.state.tr.setSelection(selection))
            return options.onImageFiles(files, selection.to)
          },
        },
      })]
    },
  })
}
