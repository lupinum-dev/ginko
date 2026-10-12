<script setup lang="ts">
// A file and folder list from a Markdown list: a nested list makes a folder, a name ending in `/` an empty one.
// Text after ` # ` is a note shown at the end of the row (`- app.config.ts # site identity`).
// `active` is the path (e.g. `app/app.vue`) of the entry to mark.
import { Fragment, h, useSlots, type VNode } from 'vue'
import CodeIcon from './CodeIcon.vue'
import { isVNode, kids, textOf } from './vnode-utils'

interface Entry { name: string; note?: string; path: string; folder: boolean; children: Entry[] }

const props = defineProps<{ active?: string }>()
const slots = useSlots()

const isList = (v: unknown): v is VNode => isVNode(v) && v.type === 'ul'

function parse(list: VNode, parent = ''): Entry[] {
  return kids(list).filter(isVNode).flatMap((item) => {
    const parts = kids(item)
    const nested = parts.find(isList)
    const [text = '', ...note] = parts.filter((p) => p !== nested).map(textOf).join('').split(' # ')
    const raw = text.trim()
    const name = raw.replace(/\/$/, '')
    if (!name) return []
    const path = parent ? `${parent}/${name}` : name
    return [{ name, note: note.join(' # ').trim() || undefined, path, folder: !!nested || raw.endsWith('/'), children: nested ? parse(nested, path) : [] }]
  })
}

function render() {
  const entries = (slots.default?.() ?? []).flatMap((n) => (isVNode(n) && n.type === Fragment ? kids(n) : [n])).filter(isList).flatMap((l) => parse(l))
  const list = (items: Entry[]): VNode => h('ul', { class: 'ginko-files-list' }, items.map((e) => h('li', { key: e.path }, [
    h('div', { class: 'ginko-files-row', 'data-active': e.path === props.active || undefined, 'aria-current': e.path === props.active ? 'true' : undefined }, [
      h(CodeIcon, { name: e.folder ? 'folder-open' : 'file', file: e.folder ? undefined : e.name }),
      h('span', { class: 'ginko-files-name' }, e.name),
      e.note ? h('span', { class: 'ginko-files-note' }, e.note) : null,
    ]),
    e.children.length ? list(e.children) : null,
  ])))
  return entries.length ? h('div', { class: 'ginko-files' }, [list(entries)]) : null
}
</script>

<template>
  <component :is="render" />
</template>
