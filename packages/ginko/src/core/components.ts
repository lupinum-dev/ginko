// The component registry: Markdown components (`::callout{type="warning"}`,
// `:badge[neu]`) defined once as data. The platform, files, the editor and agent tools read the same
// registry; `parseMarkdown` checks a `page` text against it. Pure data and checks, no Vue.
import type { Node } from 'comark'
import { effectiveMax } from './fields.ts'
import { isSafeHref } from './href.ts'
import { bare, msg, commaList, orList, type Described } from './messages.ts'
import type { MarkdownProfile } from './markdown.ts'
import type { Field, Fields, Label } from './types.ts'

/**
 * Provide/inject key of the app-wide tag → component map that `<GinkoMarkdown>` merges under its `components`
 * prop. A string, not a Symbol, so two copies of a package still agree on it.
 */
export const GINKO_COMPONENTS_KEY = 'ginko:components'

/** Provide/inject key of the current tree's table of contents (`inline-toc` reads it). A string for the same reason. */
export const GINKO_TOC_KEY = 'ginko:toc'

export interface ComponentSlot { label: Label; profile?: MarkdownProfile }

export interface ComponentDef<P extends Fields = Fields> {
  kind: 'block' | 'inline'
  label: Label
  /** One sentence for editors and agents; per language like `label` (agents read English, else the first). */
  describe: Label
  /** Attributes of the tag. Required unless `optional: true`. */
  props: P
  slots?: Record<string, ComponentSlot>
  /** Component tags allowed directly inside (e.g. tabs → ['tab']). Omitted: any. */
  children?: readonly string[]
  /** This component may only appear directly inside one of these. */
  parents?: readonly string[]
  /** Slash menu: `group` is the heading the entry is listed under, per language like `label`. */
  editor?: { icon?: string; group?: Label; example?: string }
}

/** Tag → definition. The tag is kebab-case. */
export type ComponentRegistry = Record<string, ComponentDef>

/**
 * Defines the Markdown components a site allows in `page` texts (`SiteInput.components`): tag (kebab-case) →
 * `{ kind, label, describe, props, slots?, children?, parents?, editor? }`, with props built by `f.*`. Returns the
 * registry unchanged and keeps its literal types; the schema check validates it on release.
 */
export function defineComponents<const R extends ComponentRegistry>(registry: R): R {
  return registry
}

/**
 * Tags that run code, load content or submit data. A text never contains them, with or without a registry
 * (comark syntax can name any tag: `::script`), except a tag in COMPONENT_ONLY_TAGS that the registry declares
 * (see isBlockedTag).
 */
export const BLOCKED_TAGS: ReadonlySet<string> = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base',
  'form', 'button', 'textarea', 'select', 'option', 'template', 'noscript', 'svg', 'portal', 'slot',
])

/**
 * Blocked tags a registry may still declare. The component then replaces the element, so the tag passes only where
 * the registry declares it and stays blocked everywhere else. `embed` is the provider embed of
 * `@lupinum/ginko-components`. The renderer (markdown-view.ts) drops such a tag when no component is mapped to it.
 */
const COMPONENT_ONLY_TAGS: ReadonlySet<string> = new Set(['embed'])

/** Whether a text may not contain `tag`: a blocked tag, unless the registry declares it (COMPONENT_ONLY_TAGS). */
export function isBlockedTag(tag: string, registry?: ComponentRegistry): boolean {
  return BLOCKED_TAGS.has(tag) && !(COMPONENT_ONLY_TAGS.has(tag) && registry !== undefined && Object.hasOwn(registry, tag))
}

/** The tags Markdown itself produces (all profiles). A component must not take one of these names. */
export const PLAIN_TAGS: ReadonlySet<string> = new Set([
  'strong', 'em', 'del', 'code', 'a', 'br', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr',
  'sup', 'section', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'pre', 'input', 'math', 'mermaid',
])

const TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** A non-empty text, or texts per language (`{ de: '…', en: '…' }`). */
const isLabel = (value: unknown): boolean => (typeof value === 'string' && value !== '')
  || (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0 && Object.values(value).every((v) => typeof v === 'string' && v !== ''))
const PROP = /^[a-z][a-zA-Z0-9]*$/
const PROP_TYPES = new Set<Field['type']>(['text', 'longtext', 'number', 'boolean', 'choice', 'choices', 'image', 'ref'])

/** Structural problems of a registry, as English sentences. Empty when usable. */
export function componentProblems(registry: ComponentRegistry): string[] {
  const problems: string[] = []
  const tags = Object.keys(registry)
  for (const tag of tags) {
    const def = registry[tag]!
    const at = `Component “${tag}”`
    if (!TAG.test(tag)) problems.push(`${at}: The name must be lower case and separated by hyphens (for example “code-group”).`)
    if (isBlockedTag(tag, registry)) problems.push(`${at}: The name is blocked.`)
    else if (PLAIN_TAGS.has(tag)) problems.push(`${at}: The name belongs to Markdown (${tag}) and cannot be overridden.`)
    if (def.kind !== 'block' && def.kind !== 'inline') problems.push(`${at}: kind must be “block” or “inline”.`)
    if (!isLabel(def.label)) problems.push(`${at}: label is missing.`)
    if (!isLabel(def.describe)) problems.push(`${at}: describe is missing.`)
    if (def.editor?.group !== undefined && !isLabel(def.editor.group)) problems.push(`${at}: editor.group must be a text or a text per language.`)
    for (const [name, prop] of Object.entries(def.props ?? {})) {
      if (!PROP.test(name) || /^on/i.test(name)) problems.push(`${at}: Invalid property name “${name}”.`)
      if (!PROP_TYPES.has(prop?.type)) problems.push(`${at}: Property “${name}” cannot have the type “${String(prop?.type)}” (allowed: ${[...PROP_TYPES].join(', ')}).`)
    }
    for (const key of ['children', 'parents'] as const) {
      for (const other of def[key] ?? []) if (!Object.hasOwn(registry, other) && !PLAIN_TAGS.has(other)) problems.push(`${at}: ${key} names “${other}”, which does not exist.`)
    }
  }
  return problems
}

type Fail = (problem: Described) => void

/**
 * The slot nodes (comark's `template` with `name`) a text may keep: direct children of a registered component.
 * The profile check lets exactly these through its blocked-tag rule (isBlockedTag) (identity of the node); `checkComponentTree`
 * then reports an undeclared slot name. A `template` anywhere else, or when there is no registry, stays refused.
 */
export function componentSlotNodes(nodes: readonly Node[], registry: ComponentRegistry): Set<Node> {
  const found = new Set<Node>()
  const visit = (node: Node) => {
    if (typeof node === 'string' || node[0] === null) return
    const [tag, , ...children] = node
    if (Object.hasOwn(registry, tag)) {
      for (const child of children) if (typeof child !== 'string' && child[0] === 'template') found.add(child)
    }
    children.forEach(visit)
  }
  nodes.forEach(visit)
  return found
}

/**
 * Checks the parsed tree of a `page` text against the registry. `fail` receives one sentence per problem.
 * comark does not tell `::x` from `:x[…]` at the top of a text, so a block component is only refused
 * inside a paragraph (where it can only have been written inline); an inline one is accepted anywhere.
 */
export function checkComponentTree(nodes: readonly Node[], registry: ComponentRegistry, fail: Fail): void {
  const visit = (node: Node, parent: string | undefined) => {
    if (typeof node === 'string' || node[0] === null) return
    const [tag, props, ...children] = node
    if (tag === 'template') {
      // A slot node: its place is checked at the component it belongs to (`checkComponent`); anywhere else `profileCheck` refuses it.
      for (const child of children) visit(child, tag)
      return
    }
    if (!PLAIN_TAGS.has(tag) && !isBlockedTag(tag, registry)) {
      if (!Object.hasOwn(registry, tag)) fail(msg('component.unknown', { tag }))
      else checkComponent(tag, registry[tag]!, props as Record<string, unknown>, children as Node[], parent, fail)
    }
    for (const child of children) visit(child, tag)
  }
  for (const node of nodes) visit(node, undefined)
}

function checkComponent(tag: string, def: ComponentDef, props: Record<string, unknown>, children: Node[], parent: string | undefined, fail: Fail) {
  const seen = new Set<string>()
  for (const [name, raw] of Object.entries(props)) {
    // `:name` is comark's bound form of the same attribute.
    const key = name.replace(/^:/, '')
    seen.add(key)
    if (!Object.hasOwn(def.props, key)) fail(msg('component.propUnknown', { tag, prop: key }))
    else {
      const problem = componentPropMessage(def.props[key]!, raw)
      if (problem) fail(msg('component.propInvalid', { tag, prop: key, problem: bare(problem) }))
    }
  }
  for (const [key, field] of Object.entries(def.props)) {
    if (!field.optional && !seen.has(key)) fail(msg('component.propMissing', { tag, prop: key }))
    else if (!field.optional && isEmptyText(field, props[key] ?? props[`:${key}`])) fail(msg('component.propEmpty', { tag, prop: key }))
  }
  if (def.kind === 'block' && parent === 'p') fail(msg('component.blockInParagraph', { tag }))
  if (def.parents && (parent === undefined || !def.parents.includes(parent))) fail(msg('component.parentOnly', { tag, parents: orList(def.parents) }))
  for (const child of children) {
    if (typeof child === 'string' || child[0] !== 'template') continue
    const name = String((child[1] as Record<string, unknown>).name ?? '')
    if (!def.slots || !Object.hasOwn(def.slots, name)) {
      fail(def.slots ? msg('component.slotUnknown', { tag, slot: name, allowed: commaList(Object.keys(def.slots)) }) : msg('component.noSlots', { tag, slot: name }))
    }
  }
  if (def.children) {
    for (const child of children) {
      if (typeof child === 'string' || child[0] === null || child[0] === 'template') continue
      if (!def.children.includes(child[0])) fail(msg('component.childNotAllowed', { tag, children: orList(def.children), child: child[0] }))
    }
  }
}

function isEmptyText(field: Field, raw: unknown): boolean {
  return (field.type === 'text' || field.type === 'longtext') && typeof raw === 'string' && raw.trim() === ''
}

/**
 * Why an attribute value does not fit its field, or undefined. Attribute values arrive as strings; they are converted here.
 * Exported for editors that check one prop as it is typed (same messages as `parseMarkdown`).
 */
export function componentPropProblem(field: Field, raw: unknown): string | undefined {
  return componentPropMessage(field, raw)?.message
}

/** `componentPropProblem` with its catalog key (`component.prop.*`) and parameters. */
export function componentPropMessage(field: Field, raw: unknown): Described | undefined {
  if (field.type === 'boolean') {
    return raw === true || raw === false || raw === 'true' || raw === 'false' || raw === '' ? undefined : msg('component.prop.notBoolean')
  }
  if (field.type === 'number') {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
    if (!Number.isFinite(n)) return msg('component.prop.notNumber')
    if (n < field.min || n > field.max) return msg('component.prop.outOfRange', { min: field.min, max: field.max })
    if (Math.abs(Math.round((n - field.min) / field.step) * field.step - (n - field.min)) > 1e-9) return msg('component.prop.badStep', { step: field.step })
    return undefined
  }
  if (typeof raw !== 'string') return msg('component.prop.notText')
  switch (field.type) {
    case 'text': case 'longtext':
      return raw.length > effectiveMax(field) ? msg('component.prop.tooLong', { max: effectiveMax(field) }) : undefined
    case 'choice':
      return field.options.some((o) => o.value === raw) ? undefined : msg('component.prop.badChoice', { allowed: field.options.map((o) => o.value).join(', ') })
    case 'choices': {
      const values = raw.split(',').map((v) => v.trim()).filter((v) => v !== '')
      if (values.some((v) => !field.options.some((o) => o.value === v))) return msg('component.prop.badChoices', { allowed: field.options.map((o) => o.value).join(', ') })
      if (new Set(values).size !== values.length) return msg('component.prop.duplicateValues')
      return values.length > effectiveMax(field) ? msg('component.prop.tooManyChosen', { max: effectiveMax(field) }) : undefined
    }
    case 'image':
      return raw !== '' && isSafeHref(raw) ? undefined : msg('component.prop.badImage')
    case 'ref':
      return raw !== '' ? undefined : msg('component.prop.notId')
    default:
      return msg('component.prop.badType')
  }
}
