<script setup lang="ts">
// One level of the side navigation. A node with children gets a toggle button; the branch of the current page
// starts open, and a reader's own choice holds until the page changes.
import type { DocNode } from '../lib/docsNav'

const props = defineProps<{ nodes: DocNode[] }>()
const { t } = useI18n()
const route = useRoute()
const choice = reactive(new Map<string, boolean>())
watch(() => route.path, () => choice.clear())

const holdsCurrent = (node: DocNode): boolean => node.path === route.path || node.children.some(holdsCurrent)
const isOpen = (node: DocNode) => choice.get(node.path) ?? holdsCurrent(node)
const toggle = (node: DocNode) => choice.set(node.path, !isOpen(node))
</script>

<template>
  <ul class="docs-nav-list">
    <li v-for="node in props.nodes" :key="node.path">
      <div class="docs-nav-item">
        <NuxtLink :to="node.path" :aria-current="node.path === route.path ? 'page' : undefined">
          <DocsIcon v-if="node.icon" :name="node.icon" class="docs-icon" />
          <span class="docs-nav-title">{{ node.title }}</span>
          <span v-if="node.badge" class="docs-badge">{{ node.badge }}</span>
        </NuxtLink>
        <button
          v-if="node.children.length" type="button" class="docs-nav-toggle"
          :aria-expanded="isOpen(node)" :aria-label="t('docs.toggle', { title: node.title })" @click="toggle(node)"
        >
          <DocsIcon name="lucide:chevron-right" class="docs-icon" />
        </button>
      </div>
      <div v-if="node.children.length" v-show="isOpen(node)" class="docs-nav-children">
        <DocsNavTree :nodes="node.children" />
      </div>
    </li>
  </ul>
</template>
