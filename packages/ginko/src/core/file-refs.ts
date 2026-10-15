// Files of the Files library inside Markdown texts: `$file.<uploadId>` is the one way a text names one, as an image
// source (`![Hund]($file.k57…)`), a component image prop (`::figure{src="$file.k57…"}`) or a link. The text keeps the
// reference; the served bundle gets the file's current URL, size and variants. Pure: works on texts, data and bundles.
import type { Bundle } from './bundle.ts'
import type { ComponentRegistry } from './components.ts'
import { effectiveAlt } from './fields.ts'
import { mapTrees } from './links.ts'
import type { FileInfo } from './resolve.ts'
import type { Field, Fields, Json, Schema } from './types.ts'

/**
 * A reference to a library file in a Markdown text; group 1 is the upload ID. Only where a text can name a file: a
 * link or image destination (`]($file.x)`, `[ref]: $file.x`, also inside `<…>`), a component attribute value
 * (`{src="$file.x"}`) and a prop in the YAML block of a component (`src: $file.x`), which the editor writes for a
 * component with more than three props. The same words elsewhere are text: `mv "$file" "$file.bak"` in a shell
 * example names no file. A prose line that looks like a YAML prop (`Hinweis: $file.x`) matches too; the server keeps
 * only IDs that have the form of an upload ID. The match is the reference alone, so a replace keeps what stands before it.
 */
export const FILE_REF = /(?<=\]\(\s*<?|^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*<?|=["']?|^[ \t]*[A-Za-z_][\w:-]*:[ \t]*["']?)\$file\.([A-Za-z0-9_-]+)/gm

/** A whole attribute or destination value that is a file reference. */
const WHOLE_REF = /^\$file\.([A-Za-z0-9_-]+)$/

/** `![alt]($file.<id>)`: group 1 is the image's own description, group 2 the upload ID. */
const MARKDOWN_IMAGE_REF = /!\[([^\]]*)\]\(\s*<?\$file\.([A-Za-z0-9_-]+)/g

/** The upload ID when the whole `value` is a file reference (`$file.<id>`), else undefined. */
export const fileRefOf = (value: string): string | undefined => WHOLE_REF.exec(value)?.[1]

/** A code fence line: up to 3 spaces, then 3 or more backticks or tildes (group 1). */
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/
/** A component's YAML props block (```yaml [props]) is no code: its `src: $file.x` is a reference. */
const PROPS_FENCE = /^yaml\s+\[props\]/
/** Inline code: a run of backticks up to the same run, within one paragraph. */
const INLINE_CODE = /(?<!`)(`+)(?!`)(?:[^\n]|\n(?![ \t]*\n))*?(?<!`)\1(?!`)/g

const blank = (code: string) => code.replace(/[^\n]/g, ' ')

/**
 * The text with its code blanked out, the length kept so positions stay: fenced code blocks and inline code. A
 * `$file.<id>` there is text (the tree shows it as code), not a file the text uses.
 */
function withoutCode(text: string): string {
  let fence: string | undefined
  const lines = text.split('\n').map((line) => {
    const match = FENCE.exec(line)
    if (fence === undefined) {
      if (!match || PROPS_FENCE.test(match[2]!.trim())) return line
      fence = match[1]!
      return blank(line)
    }
    if (match && match[1]![0] === fence[0] && match[1]!.length >= fence.length && !match[2]!.trim()) fence = undefined
    return blank(line)
  })
  return lines.join('\n').replace(INLINE_CODE, blank)
}

/** The upload IDs a text references; code is text. */
export function fileRefsIn(text: string): Set<string> {
  return new Set([...withoutCode(text).matchAll(FILE_REF)].map((m) => m[1]!))
}

/** The upload IDs of the Markdown images in a text (`![alt]($file.<id>)`) that have no description of their own. */
export function fileImagesWithoutAlt(text: string): Set<string> {
  return new Set([...withoutCode(text).matchAll(MARKDOWN_IMAGE_REF)].filter((m) => m[1]!.trim() === '').map((m) => m[2]!))
}

/** The text with every reference whose ID is in `map` pointing at its new ID. Unknown IDs, and words in code, stay as they are. */
export function rewriteFileRefs(text: string, map: ReadonlyMap<string, string>): string {
  let out = ''
  let last = 0
  for (const match of withoutCode(text).matchAll(FILE_REF)) {
    const to = map.get(match[1]!)
    if (to === undefined) continue
    out += `${text.slice(last, match.index)}$file.${to}`
    last = match.index + match[0].length
  }
  return out + text.slice(last)
}

/**
 * The data with every upload ID found in `map` replaced by its new ID: in image and file fields (`{ file }`) and in the
 * `$file.<id>` references of Markdown texts, also in list rows. Unknown IDs stay as they are. One walk for the import of
 * a backup (platform) and for `local:files-export` (public paths to file IDs).
 */
export function remapFileIds(fields: Fields, data: Record<string, Json>, map: ReadonlyMap<string, string>): Record<string, Json> {
  const walk = (field: Field, value: Json): Json => {
    if (value === null) return value
    if (field.type === 'image' || field.type === 'file') {
      const to = isRecord(value) && typeof value.file === 'string' ? map.get(value.file) : undefined
      return to ? { ...(value as Record<string, Json>), file: to } : value
    }
    if (field.type === 'markdown') {
      if (typeof value === 'string') return rewriteFileRefs(value, map)
      return isRecord(value) ? Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? rewriteFileRefs(text, map) : text])) : value
    }
    if (field.type === 'list' && Array.isArray(value)) {
      return value.map((row) => {
        if (!isRecord(row)) return row
        const out: Record<string, Json> = { ...row }
        for (const [key, inner] of Object.entries(field.of)) if (out[key] !== undefined) out[key] = walk(inner, out[key]!)
        return out
      })
    }
    return value
  }
  const out = { ...data }
  for (const [name, field] of Object.entries(fields)) if (out[name] !== undefined) out[name] = walk(field, out[name]!)
  return out
}

/** The data with `fn` applied to every Markdown text: each language, list rows included. Other values stay as they are. */
export function mapMarkdownTexts(fields: Fields, data: Record<string, Json>, fn: (text: string) => string): Record<string, Json> {
  const walk = (field: Field, value: Json): Json => {
    if (field.type === 'markdown') {
      if (typeof value === 'string') return fn(value)
      if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? fn(text) : text]))
    }
    if (field.type === 'list' && Array.isArray(value)) return value.map((row) => (isRecord(row) ? mapMarkdownTexts(field.of, row, fn) : row))
    return value
  }
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [name, Object.hasOwn(fields, name) ? walk(fields[name]!, value) : value]))
}

type Node = [string, Record<string, Json>, ...Json[]]
const isNode = (n: unknown): n is Node => Array.isArray(n) && typeof n[0] === 'string' && isRecord(n[1])

/** The image props a component declares (`f.image`), by tag. */
export function imagePropsOf(components: ComponentRegistry | undefined): Record<string, string[]> {
  return Object.fromEntries(Object.entries(components ?? {}).map(([tag, def]) => [tag, Object.entries(def.props ?? {}).filter(([, field]) => field.type === 'image').map(([name]) => name)]))
}

/** One place in a tree that names a library file: an `img` source, a declared component image prop or a link. */
export interface FileRefUse { id: string; kind: 'img' | 'prop' | 'link'; node: Node; prop: string }

/** Every `$file.<id>` that a tree uses as a whole `img` source, component image prop or link `href`. */
export function fileRefUses(nodes: readonly Json[], components: ComponentRegistry | undefined): FileRefUse[] {
  const imageProps = imagePropsOf(components)
  const out: FileRefUse[] = []
  const visit = (list: readonly Json[]) => {
    for (const node of list) {
      if (!isNode(node)) continue
      const [tag, props] = node
      const check = (prop: string, kind: FileRefUse['kind']) => {
        const id = typeof props[prop] === 'string' ? fileRefOf(props[prop]) : undefined
        if (id) out.push({ id, kind, node, prop })
      }
      if (tag === 'img') check('src', 'img')
      else if (tag === 'a') check('href', 'link')
      else if (Object.hasOwn(imageProps, tag)) for (const prop of imageProps[tag]!) check(prop, 'prop')
      visit(node.slice(2))
    }
  }
  visit(nodes)
  return out
}

/**
 * The bundle with every `$file.<id>` of its Markdown trees resolved through `files` (the bundle's ready uploads):
 * - `img`: the file's URL, its pixel size, a `srcset` of its variants and the original, and the library description
 *   of the bundle's language when the image has none of its own (`effectiveAlt`).
 * - a component image prop: the URL; for `src` also the file's `width` and `height` when the author set neither (and
 *   the component declares both), and an empty `alt` (when it declares one) from the library.
 * - a link: the file's URL.
 * An unknown or not yet ready file loses its URL and gets `data-broken: true`, like a route link that cannot be resolved.
 */
export function resolveFileRefs(bundle: Bundle, schema: Pick<Schema, 'components'>, files: (id: string) => FileInfo | undefined): Bundle {
  const components = schema.components
  const resolveNodes = (nodes: Json[]): Json[] => {
    // Most texts reference no file: they stay as they are, uncopied (every bundle request runs this).
    if (!fileRefUses(nodes, components).length) return nodes
    // Trees are JSON: a copy keeps the stored tree as it is.
    const copy = JSON.parse(JSON.stringify(nodes)) as Json[]
    for (const use of fileRefUses(copy, components)) {
      const props = use.node[1]
      const file = files(use.id)
      if (!file) {
        if (use.kind !== 'link') delete props[use.prop]
        props['data-broken'] = true
        continue
      }
      props[use.prop] = file.url
      if (use.kind === 'link') continue
      const declared = use.kind === 'prop' ? components?.[use.node[0]]?.props ?? {} : undefined
      const library = effectiveAlt(undefined, file.alt, bundle.locale)
      if (use.kind === 'img') {
        if (file.width && file.height) Object.assign(props, { width: file.width, height: file.height })
        if (file.width && file.variants?.length) {
          props.srcset = [...file.variants.map((v) => `${v.url} ${v.width}w`), `${file.url} ${file.width}w`].join(', ')
          props.sizes = '100vw'
        }
        if (!String(props.alt ?? '').trim() && library) props.alt = library
      } else if (use.prop === 'src' && declared) {
        // Only both together: one size of the author's with one of the file's would distort the picture.
        if ('width' in declared && 'height' in declared && file.width && file.height && props.width === undefined && props.height === undefined) {
          Object.assign(props, { width: file.width, height: file.height })
        }
        if ('alt' in declared && !String(props.alt ?? '').trim() && library) props.alt = library
      }
    }
    return copy
  }
  return mapTrees(bundle, (tree) => ({
    ...tree,
    nodes: resolveNodes(tree.nodes),
    ...(tree.summary ? { summary: resolveNodes(tree.summary) } : {}),
  }))
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
