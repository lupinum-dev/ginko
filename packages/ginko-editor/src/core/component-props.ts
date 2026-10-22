// The props (attributes) of a Markdown component as the editor sees them: how a `component` node is shown,
// how one prop is read, written and checked. Headless; the Studio draws the form.
//
// The node keeps the comark props as they were parsed (`props` attribute): values are strings, and a bare
// attribute (`open`) is the key `:open` with "true". Writing keeps the key a prop already has, so an
// untouched prop stays as written, and a changed prop keeps its place in the attribute list.
import type { Field, Label } from '@lupinum/ginko'
import type { ComponentDef, ComponentRegistry, Described } from '@lupinum/ginko/internal'
import { componentPropMessage, msg, effectiveMax, fileRefOf, isSafeHref, labelOf, UNSAFE_LINK, URL_PROPS } from '@lupinum/ginko/internal'

export type ComponentProps = Record<string, unknown>

/** A prop as a form shows it: `undefined` = not set. */
export type PropValue = string | number | boolean | string[] | undefined

/** The prop fields a component form can edit (the types the registry allows, see `componentProblems`). */
export type PropField = Extract<Field, { type: 'text' | 'longtext' | 'number' | 'boolean' | 'choice' | 'choices' | 'image' | 'ref' }>

export type ComponentMode = 'live' | 'card'

/**
 * What a registry entry may say in its `editor` field beyond the core's own type (`icon`, `group`, `example`).
 * `hidden`: not offered in the slash menu (a short form that stays valid in existing texts). `keywords`: more
 * words the slash menu finds the entry by. `aliasOf`: this tag is a short form of `tag` with `prop` = `value`;
 * the settings of a short form offer that prop and turn the node into `tag` when it is changed.
 */
export interface EditorMeta {
  hidden?: boolean
  keywords?: readonly string[]
  aliasOf?: { tag: string; prop: string; value: string }
}

export const editorMeta = (def: Pick<ComponentDef, 'editor'> | undefined): EditorMeta => (def?.editor ?? {}) as EditorMeta

/** The long form a short-form tag stands for, or undefined when `tag` is not one. */
export function aliasOf(registry: ComponentRegistry | undefined, tag: string): (EditorMeta['aliasOf'] & { field: PropField }) | undefined {
  const alias = registry && Object.hasOwn(registry, tag) ? editorMeta(registry[tag]).aliasOf : undefined
  const field = alias && registry && Object.hasOwn(registry, alias.tag) ? registry[alias.tag]!.props[alias.prop] as PropField | undefined : undefined
  return alias && field?.type === 'choice' ? { ...alias, field } : undefined
}

/**
 * How a `component` node is shown: `live` = the real Vue component with the editable content in its default
 * slot; `card` = a frame with the registry label, a one-line summary of the props, and the content below.
 * Live needs a Vue implementation in the Studio (`liveTags`), a block component, no named slots, no `children`
 * restriction (the component reads its children, which the editor wraps), and no `parents` (it looks right
 * only inside its parent).
 */
export function componentMode(tag: string, registry: ComponentRegistry | undefined, liveTags: ReadonlySet<string> | readonly string[]): ComponentMode {
  const def = registry && Object.hasOwn(registry, tag) ? registry[tag] : undefined
  if (!def || def.kind !== 'block') return 'card'
  const live = Array.isArray(liveTags) ? liveTags.includes(tag) : (liveTags as ReadonlySet<string>).has(tag)
  if (!live) return 'card'
  if (def.slots && Object.keys(def.slots).length) return 'card'
  if (def.children?.length || def.parents?.length) return 'card'
  return 'live'
}

/** The prop fields of a component in registry order. Types a form cannot show are left out. */
export function propFields(def: Pick<ComponentDef, 'props'>): Array<[key: string, field: PropField]> {
  return Object.entries(def.props ?? {}).filter((entry): entry is [string, PropField] => ['text', 'longtext', 'number', 'boolean', 'choice', 'choices', 'image', 'ref'].includes(entry[1].type))
}

/** The raw value: the key or its bound form `:key`. */
export function rawProp(props: ComponentProps | undefined, key: string): unknown {
  if (!props) return undefined
  return Object.hasOwn(props, key) ? props[key] : props[`:${key}`]
}

const isOn = (raw: unknown) => raw === true || raw === 'true' || raw === ''

/** The value of a prop for the form. */
export function readProp(field: PropField, props: ComponentProps | undefined, key: string): PropValue {
  const raw = rawProp(props, key)
  switch (field.type) {
    case 'boolean': return raw === undefined ? (field.default === true ? true : false) : isOn(raw)
    case 'number': {
      if (raw === undefined || raw === '') return undefined
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    case 'choices': return typeof raw === 'string' ? raw.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    default: return typeof raw === 'string' ? raw : undefined
  }
}

/** The text a prop is written as, or undefined when the prop is removed. */
function rawOf(field: PropField, value: PropValue): string | undefined {
  if (value === undefined) return undefined
  if (field.type === 'boolean') return value === true ? 'true' : 'false'
  if (Array.isArray(value)) return value.length ? value.join(',') : undefined
  const text = String(value)
  return text === '' ? '' : text
}

/**
 * `props` with one prop set, as a new object. `undefined` (or an empty list) removes it. A boolean that equals
 * the registry default is removed too, so `Geöffnet` off leaves no `open="false"` behind; a boolean that is on
 * is written bare. An empty text stays as an empty string, so the check can report it (a required text must not be empty).
 */
export function writeProp(field: PropField, props: ComponentProps | undefined, key: string, value: PropValue): ComponentProps {
  const out: ComponentProps = { ...(props ?? {}) }
  const name = Object.hasOwn(out, key) ? key : Object.hasOwn(out, `:${key}`) ? `:${key}` : undefined
  let raw = rawOf(field, value)
  if (field.type === 'boolean') {
    const on = value === true
    const asDefault = on === (field.default === true)
    // A default needs no attribute; the other state is written (bare when on, `="false"` when off).
    if (asDefault) { if (name) delete out[name]; return out }
    if (name) out[name] = on ? 'true' : 'false'
    else if (on) out[`:${key}`] = 'true'
    else out[key] = 'false'
    return out
  }
  if (raw === undefined) { if (name) delete out[name]; return out }
  if (name) out[name] = raw
  else out[key] = raw
  return out
}

/** The prop's label as one text; a registry has no site, so a per-language label shows its first text. */
const text = (field: PropField) => labelOf(field.label, '', '')

/** Prop names the profile check of `parseMarkdown` requires to be a safe address, whatever the field says. */
/**
 * Why `value` does not fit prop `key` of component `tag`, as a German sentence that starts with the label of the
 * prop ("Titel ist zu lang (höchstens 120 Zeichen)."), or undefined. The messages are the core's (`componentPropProblem`),
 * plus the profile check's rule for addresses. A required prop without value is reported.
 */
export function propProblem(registry: ComponentRegistry, tag: string, key: string, value: PropValue): string | undefined {
  return propProblemMessage(registry, tag, key, value)?.message
}

/** `propProblem` with catalog key and parameters (`coreMessage(locale, key, params)` gives the sentence in a language). */
export function propProblemMessage(registry: ComponentRegistry, tag: string, key: string, value: PropValue): Described | undefined {
  const field = registry[tag]?.props[key] as PropField | undefined
  if (!field) return undefined
  const raw = rawOf(field, value)
  const label = text(field)
  if (raw === undefined) return field.optional ? undefined : msg('editor.prop.missing', { label })
  if (raw !== '' && (URL_PROPS.has(key) || (field.type === 'text' && field.format === 'url')) && !isSafeHref(raw)) return msg('markdown.unsafeLink')
  if (!field.optional && (field.type === 'text' || field.type === 'longtext') && raw.trim() === '') return msg('editor.prop.empty', { label })
  const problem = componentPropMessage(field, raw)
  return problem === undefined ? undefined : msg('editor.prop.invalid', { label, problem: { key: problem.key, ...(problem.params ? { params: problem.params } : {}) } })
}

/** The keys of required props that have no valid value in `props`. */
export function missingRequired(registry: ComponentRegistry, tag: string, props: ComponentProps | undefined): string[] {
  const def = registry[tag]
  if (!def) return []
  return propFields(def)
    .filter(([key, field]) => !field.optional && propProblem(registry, tag, key, readProp(field, props, key)) !== undefined)
    .map(([key]) => key)
}

/** What a block card shows instead of its props: what it is about, a few choices in words, and its pictures. */
export interface BlockSummary {
  /** The caption, title, description or name, else the first picture's file name; cut at 80 characters. */
  title?: string
  /** Choices set to something else than their default, as their option labels ("Quadrat"); at most three. */
  facts: string[]
  /** The pictures of the image props in registry order: the stored address, the library file and the line under it. */
  pictures: Array<{ key: string; src: string; file?: string; note?: string }>
}

/** Props that say what a block is about, in the order a card prefers them as its title. */
const TITLE_KEYS = ['caption', 'title', 'alt', 'name', 'label']
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/**
 * The card summary of a block (`::figure{src="$file.k57" caption="Der Gastgarten" width="2756" aspect="square"}`
 * → title "Der Gastgarten", facts ["Quadrat"], one picture). Numbers, addresses and on/off switches are settings
 * for the look (pixel sizes, spacing, "wider than the text"): they stay in the settings, never on the card.
 * `label` gives a registry label in the editor's language; `fileName` the name of a library file (undefined while it loads).
 */
export function blockSummary(
  props: ComponentProps | undefined,
  def: Pick<ComponentDef, 'props'> | undefined,
  { label, fileName }: { label: (label: Label) => string; fileName?: (id: string) => string | undefined },
): BlockSummary {
  const fields = def ? propFields(def) : []
  const textOf = (key: string) => { const raw = rawProp(props, key); return typeof raw === 'string' ? raw.trim() : '' }
  const texts = fields.filter(([, field]) => (field.type === 'text' && field.format !== 'url') || field.type === 'longtext').map(([key]) => key)
  const titleKey = [...TITLE_KEYS.filter((key) => texts.includes(key) || (!def && textOf(key))), ...texts].find((key) => textOf(key))
  const pictures = fields.filter(([key, field]) => field.type === 'image' && textOf(key)).map(([key]) => {
    const src = textOf(key)
    const file = fileRefOf(src)
    return { key, src, ...(file ? { file } : {}) }
  })
  const nameOf = (picture: { src: string; file?: string }) => (picture.file ? fileName?.(picture.file) : picture.src.split(/[?#]/)[0]!.split('/').pop()) || undefined
  const title = titleKey ? textOf(titleKey) : pictures[0] && nameOf(pictures[0])
  // One picture: the line under it is the caption or description the title does not show yet, else its file name.
  const one = pictures.length === 1 ? ['caption', 'alt'].map(textOf).find((text) => text && text !== title) ?? (titleKey ? nameOf(pictures[0]!) : undefined) : undefined
  const facts = fields.flatMap(([key, field]) => {
    if (field.type === 'choice') {
      const value = textOf(key)
      const option = field.options.find((o) => o.value === value)
      return value && value !== field.default && option ? [label(option.label)] : []
    }
    if (field.type === 'choices') {
      const chosen = readProp(field, props, key)
      return Array.isArray(chosen) && chosen.length ? [chosen.map((value) => label(field.options.find((o) => o.value === value)?.label ?? value)).join(', ')] : []
    }
    return []
  }).slice(0, 3)
  return {
    ...(title ? { title: cut(title, 80) } : {}),
    facts,
    pictures: pictures.map((picture) => {
      const note = pictures.length === 1 ? one : nameOf(picture)
      return { ...picture, ...(note && note !== title ? { note: cut(note, 120) } : {}) }
    }),
  }
}

/** Longest value the text input of a prop takes. */
export const propMax = (field: PropField): number | undefined => {
  const max = field.type === 'text' || field.type === 'longtext' ? effectiveMax(field) : undefined
  return max !== undefined && Number.isFinite(max) ? max : undefined
}
