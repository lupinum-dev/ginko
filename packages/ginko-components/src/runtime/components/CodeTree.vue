<script setup lang="ts">
// A file tree next to one code block at a time. Each child block needs a filename (the path, e.g. `app/app.vue`).
// Paths that cannot form a tree are reported on the console and the blocks are shown one under the other.
import { cloneVNode, h, ref, useSlots, type VNode } from 'vue'
import CodeIcon from './CodeIcon.vue'
import { ancestorsOf, buildTree, codeTreeProblem, type TreeNode } from './code-tree.utils'
import { isOn } from './interactive-utils'
import { elements } from './vnode-utils'

const props = defineProps<{ defaultValue?: string; expandAll?: boolean | string }>()
const slots = useSlots()
const selected = ref(props.defaultValue ?? '')
// null until the reader opens or closes a folder; then it is theirs, no longer derived from the selection.
const opened = ref<Set<string> | null>(null)

const pathOf = (node: VNode) => String(((node.props ?? {}) as Record<string, unknown>).filename ?? '').trim()

function toggle(path: string, current: Set<string>) {
  const next = new Set(current)
  if (!next.delete(path)) next.add(path)
  opened.value = next
}

function rows(nodes: TreeNode[], open: Set<string>, active: string): VNode[] {
  return nodes.map((node) => {
    if (node.children) {
      const isOpen = open.has(node.path)
      return h('li', { key: node.path }, [
        h('button', { type: 'button', class: 'ginko-code-tree-row', 'aria-expanded': isOpen, onClick: () => toggle(node.path, open) }, [
          h(CodeIcon, { name: 'chevron', class: 'ginko-code-tree-chevron', 'data-open': isOpen || undefined }),
          h(CodeIcon, { name: isOpen ? 'folder-open' : 'folder' }),
          h('span', { class: 'ginko-code-tree-name' }, node.label),
        ]),
        isOpen ? h('ul', { class: 'ginko-code-tree-branch' }, rows(node.children, open, active)) : null,
      ])
    }
    const current = node.path === active
    return h('li', { key: node.path }, [
      h('button', { type: 'button', class: 'ginko-code-tree-row', 'aria-current': current ? 'true' : undefined, onClick: () => { selected.value = node.path } }, [
        h('span', { class: 'ginko-code-tree-spacer' }),
        h(CodeIcon, { name: 'file', file: node.label }),
        h('span', { class: 'ginko-code-tree-name' }, node.label),
      ]),
    ])
  })
}

function render() {
  const blocks = elements(slots.default?.())
  const paths = blocks.map(pathOf)
  const problem = codeTreeProblem(paths, props.defaultValue)
  if (problem) {
    console.warn(`[ginko-components] code-tree: ${problem}`)
    return h('div', { class: 'ginko-code-tree-fallback' }, blocks)
  }
  const active = paths.includes(selected.value) ? selected.value : paths[0]!
  const open = opened.value ?? new Set(isOn(props.expandAll) ? paths.flatMap(ancestorsOf) : ancestorsOf(active))
  return h('div', { class: 'ginko-code-tree' }, [
    h('ul', { class: 'ginko-code-tree-list' }, rows(buildTree(paths), open, active)),
    h('div', { class: 'ginko-code-tree-pane' }, blocks.map((node, i) => h('div', {
      key: paths[i], class: 'ginko-code-tree-panel', hidden: paths[i] !== active,
    }, [cloneVNode(node, { bare: true })]))),
  ])
}
</script>

<template>
  <component :is="render" />
</template>
