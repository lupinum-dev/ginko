// The props (attributes) of a Markdown component as the editor sees them: how a `component` node is shown,
// how one prop is read, written and checked. Headless; the Studio draws the form.
//
// The node keeps the comark props as they were parsed (`props` attribute): values are strings, and a bare
// attribute (`open`) is the key `:open` with "true". Writing keeps the key a prop already has, so an
// untouched prop stays as written, and a changed prop keeps its place in the attribute list.
import type { Field } from '@lupinum/ginko'
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
export function propFields(def: ComponentDef): Array<[key: string, field: PropField]> {
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

/** `type: warning · title: Achtung`: the props that are set, for the card header. Long values are cut; a bare attribute is just its name. */
export function propsSummary(props: ComponentProps | undefined, def?: Pick<ComponentDef, 'props'>, fileName?: (id: string) => string | undefined): string {
  return Object.entries(props ?? {})
    .filter(([name]) => name !== 'class' && name !== 'id')
    .map(([name, raw]) => {
      const text = typeof raw === 'string' ? raw : String(raw ?? '')
      const key = name.replace(/^:/, '')
      // Editors read the registry's words: the label for the key, the option label for a choice value.
      const field = def && Object.hasOwn(def.props, key) ? (def.props[key] as PropField) : undefined
      const label = field ? labelOf(field.label, '', '') : key
      if (name.startsWith(':') && text === 'true') return label
      // A picture from the Files library shows its file name, not its ID (`$file.k57…`); "…" while the name loads.
      const file = field?.type === 'image' ? fileRefOf(text) : undefined
      const shown = file !== undefined ? (fileName?.(file) ?? '…')
        : field?.type === 'choice' ? (labelOf(field.options.find((o) => o.value === text)?.label ?? text, '', '')) : text
      return `${label}: ${shown.length > 40 ? `${shown.slice(0, 39)}…` : shown}`
    })
    .join(' · ')
}

/** Longest value the text input of a prop takes. */
export const propMax = (field: PropField): number | undefined => {
  const max = field.type === 'text' || field.type === 'longtext' ? effectiveMax(field) : undefined
  return max !== undefined && Number.isFinite(max) ? max : undefined
}
