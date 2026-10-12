<script setup lang="ts">
import { computed } from 'vue'
import { CALLOUT_ICON_NAMES, TYPE_ICON, type IconName } from './icons'
import SiteIcon from './SiteIcon.vue'
import SvgIcon from './SvgIcon.vue'

const props = defineProps<{ type?: string; title?: string; icon?: string }>()

const type = computed(() => (props.type && props.type in TYPE_ICON ? props.type : 'info'))
// `icon` is a built-in name (see CALLOUT_ICON_NAMES) or an Iconify name with a colon (`lucide:flag`, drawn by
// SiteIcon). Anything else falls back to the symbol of the type.
const iconify = computed(() => (props.icon?.includes(':') ? props.icon : undefined))
const builtIn = computed<IconName>(() => {
  const name = CALLOUT_ICON_NAMES.find((n) => n === props.icon)
  return name ?? TYPE_ICON[type.value as keyof typeof TYPE_ICON]
})
</script>

<template>
  <div class="ginko-callout" role="note" :data-type="type">
    <span class="ginko-callout-bar" aria-hidden="true" />
    <SiteIcon v-if="iconify" :name="iconify" class="ginko-callout-icon" />
    <SvgIcon v-else class="ginko-callout-icon" :name="builtIn" />
    <div class="ginko-callout-body">
      <div v-if="title" class="ginko-callout-title">{{ title }}</div>
      <div class="ginko-callout-content"><slot /></div>
    </div>
  </div>
</template>
