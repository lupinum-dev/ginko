<script setup lang="ts">
import { nextTick, onMounted, useSlots, type VNode } from 'vue'
import { groupLabel, groupParams } from './api.utils'
import { useTabs } from './interactive-utils'
import { useText } from './text'
import { elements, Rendered } from './vnode-utils'

// ::api with ::api-param children: method and path on top, the parameters below. Parameters with the same `group`
// share a tab (WAI-ARIA tabs, arrow keys, Home/End); one group needs no tabs. A link to a row (`#api-query-limit`)
// opens its group. The first group is shown on the server; the other panels stay in the page with `hidden`.
defineProps<{ title?: string; method?: string; path?: string }>()
const slots = useSlots()
const t = useText()
const groupOf = (node: VNode) => groupLabel((node.props as Record<string, unknown> | null)?.group, t('api.defaultGroup'))
const { id, active, tabId, panelId, select, onKeydown } = useTabs(() => view().groups.length)

/** Called in the template and handlers only: Vue warns when a slot is called in `setup`. */
function view() {
  const rows = elements(slots.default?.())
  return { rows, groups: groupParams(rows.map(groupOf)) }
}

onMounted(() => {
  const hash = decodeURIComponent(window.location.hash.slice(1))
  const row = hash ? document.getElementById(hash) : null
  const panel = row?.closest<HTMLElement>(`[data-api-panel="${id}"]`)
  if (!row || !panel) return
  active.value = Number(panel.dataset.index)
  nextTick(() => row.scrollIntoView())
})
</script>

<template>
  <div class="ginko-api">
    <template v-for="v in [view()]" :key="0">
      <div class="ginko-api-header">
        <span v-if="method || path" class="ginko-api-identity">
          <span v-if="method" class="ginko-api-method" :data-method="method">{{ method.toUpperCase() }}</span>
          <span v-if="path" class="ginko-api-path">{{ path }}</span>
        </span>
        <span v-else-if="title" class="ginko-api-identity"><span class="ginko-api-path">{{ title }}</span></span>
        <div v-if="v.groups.length > 1" class="ginko-api-tabs" role="tablist" :aria-label="t('api.groups')">
          <button
            v-for="(group, g) in v.groups"
            :id="tabId(g)"
            :key="group.label"
            type="button"
            role="tab"
            class="ginko-api-tab"
            :aria-selected="g === active"
            :aria-controls="panelId(g)"
            :tabindex="g === active ? 0 : -1"
            @click="select(g, false)"
            @keydown="onKeydown($event, g)"
          >{{ group.label }} <span class="ginko-api-count">{{ group.indexes.length }}</span></button>
        </div>
      </div>
      <div
        v-for="(group, g) in v.groups"
        :id="panelId(g)"
        :key="group.label"
        class="ginko-api-panel"
        :data-api-panel="id"
        :data-index="g"
        :role="v.groups.length > 1 ? 'tabpanel' : undefined"
        :aria-labelledby="v.groups.length > 1 ? tabId(g) : undefined"
        :hidden="g !== active"
      >
        <Rendered v-for="i in group.indexes" :key="i" :node="v.rows[i]!" />
      </div>
    </template>
  </div>
</template>
