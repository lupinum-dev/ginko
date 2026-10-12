<script setup lang="ts">
// Code blocks as tabs (WAI-ARIA tabs pattern). Labelled like a single code block (filename, "Terminal", language).
// The first tab is selected on the server; the other panels are `hidden`.
import { cloneVNode, useSlots, type VNode } from 'vue'
import CodeIcon from './CodeIcon.vue'
import { codeLabel } from './file-icons'
import { useTabs } from './interactive-utils'
import { useText } from './text'
import { elements } from './vnode-utils'

const slots = useSlots()
const t = useText()
const { active, tabId, panelId, select, onKeydown } = useTabs(() => blocks().length)

const blocks = () => elements(slots.default?.()).map((node) => cloneVNode(node, { bare: true }))
function labelOf(node: VNode, index: number) {
  const label = codeLabel((node.props ?? {}) as { language?: string; filename?: string }, t('code.terminal'))
  return { ...label, text: label.text || t('code.untitled', { number: index + 1 }) }
}
</script>

<template>
  <div class="ginko-code-group">
    <div class="ginko-code-tabs" role="tablist">
      <button
        v-for="(node, i) in blocks()" :id="tabId(i)" :key="i" type="button" role="tab" class="ginko-code-tab"
        :aria-selected="i === active" :aria-controls="panelId(i)" :tabindex="i === active ? 0 : -1"
        @click="select(i, false)" @keydown="onKeydown($event, i)"
      ><CodeIcon :name="labelOf(node, i).icon" :file="labelOf(node, i).file" />{{ labelOf(node, i).text }}</button>
    </div>
    <div v-for="(node, i) in blocks()" :id="panelId(i)" :key="i" role="tabpanel" class="ginko-code-panel" :aria-labelledby="tabId(i)" :hidden="i !== active">
      <component :is="node" />
    </div>
  </div>
</template>
