<script setup lang="ts">
import { computed } from 'vue'
import SiteIcon from './SiteIcon.vue'
import { isOn } from './interactive-utils'

// A bare `active` marks the item; `active="false"` is off.
const props = defineProps<{ date?: string; meta?: string; title?: string; icon?: string; active?: boolean | string }>()
const isActive = computed(() => isOn(props.active))
</script>

<template>
  <div class="ginko-timeline-item" role="listitem" :data-active="isActive || undefined">
    <span class="ginko-timeline-marker" :data-icon="icon ? '' : undefined" aria-hidden="true"><SiteIcon v-if="icon" :name="icon" /></span>
    <div v-if="title || date || meta" class="ginko-timeline-head">
      <p v-if="title" class="ginko-timeline-title">{{ title }}</p>
      <span v-if="date" class="ginko-timeline-date">{{ date }}</span>
      <span v-if="meta" class="ginko-timeline-label">{{ meta }}</span>
    </div>
    <div class="ginko-timeline-body"><slot /></div>
  </div>
</template>
