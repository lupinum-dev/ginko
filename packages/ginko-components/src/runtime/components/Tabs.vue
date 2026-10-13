<script setup lang="ts">
import { useSlots } from 'vue'
import SiteIcon from './SiteIcon.vue'
import { isOn, useTabs } from './interactive-utils'
import { elements, Rendered } from './vnode-utils'

// ::tabs with ::tab{title} children (WAI-ARIA tabs pattern): tablist/tab/tabpanel, arrow keys, Home/End,
// roving tabindex. The first tab is selected on the server; panels of the other tabs stay in the DOM with `hidden`.
// `layout="line"` underlines the selected tab instead of a chip and drops the panel frame; `padded="false"` removes the
// panel's inner space, for a code block that should fill it.
const props = withDefaults(defineProps<{ layout?: 'separate' | 'line'; padded?: boolean | string; appearance?: 'quiet' | 'tint' }>(), { padded: true })
const slots = useSlots()
const { active, tabId, panelId, select, onKeydown } = useTabs(() => tabs().length)

function tabs() {
  return elements(slots.default?.()).map((node, i) => {
    const { title, icon } = (node.props ?? {}) as Record<string, unknown>
    return { node, label: typeof title === 'string' && title.trim() ? title : String(i + 1), icon: typeof icon === 'string' && icon ? icon : undefined }
  })
}
</script>

<template>
  <div class="ginko-tabs" :data-layout="props.layout === 'line' ? 'line' : undefined" :data-unpadded="isOn(props.padded) ? undefined : ''" :data-appearance="props.appearance">
    <div class="ginko-tabs-list" role="tablist">
      <button
        v-for="(tab, i) in tabs()"
        :id="tabId(i)"
        :key="i"
        type="button"
        role="tab"
        class="ginko-tabs-tab"
        :aria-selected="i === active"
        :aria-controls="panelId(i)"
        :tabindex="i === active ? 0 : -1"
        @click="select(i, false)"
        @keydown="onKeydown($event, i)"
      ><SiteIcon v-if="tab.icon" :name="tab.icon" />{{ tab.label }}</button>
    </div>
    <div
      v-for="(tab, i) in tabs()"
      :id="panelId(i)"
      :key="i"
      role="tabpanel"
      tabindex="0"
      class="ginko-tabs-panel"
      :aria-labelledby="tabId(i)"
      :hidden="i !== active"
    >
      <Rendered :node="tab.node" />
    </div>
  </div>
</template>
