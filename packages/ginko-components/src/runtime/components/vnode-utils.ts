// Reading the vnodes a Markdown component receives in its slot (tabs, code group, quiz, api, files). Not for
// rendering decisions that plain slots can make.
import { Comment, Fragment, Text, type VNode } from 'vue'

export const isVNode = (v: unknown): v is VNode => typeof v === 'object' && v !== null && 'type' in v

/** The element vnodes of a slot, fragments opened, comments and plain text dropped. */
export function elements(nodes: VNode[] | undefined): VNode[] {
  return (nodes ?? []).flatMap((n) => (n.type === Fragment ? elements(n.children as VNode[]) : n.type === Comment || n.type === Text ? [] : [n]))
}

/** The children of a vnode (strings included), whether `children` is an array or a slot object. */
export function kids(node: VNode): unknown[] {
  const c = node.children
  if (Array.isArray(c)) return c.flatMap((k) => (isVNode(k) && k.type === Fragment ? kids(k) : [k]))
  if (c && typeof c === 'object') {
    const out = (c as { default?: () => unknown }).default?.()
    return Array.isArray(out) ? out : out ? [out] : []
  }
  return typeof c === 'string' ? [c] : []
}

export const textOf = (v: unknown): string => (typeof v === 'string' ? v : isVNode(v) ? kids(v).map(textOf).join('') : '')

/** A functional component that renders a ready-made vnode (a stable type, so the node keeps its state). */
export const Rendered = (props: { node: VNode }) => props.node
