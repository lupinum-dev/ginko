<script setup lang="ts">
import CodeIcon from './CodeIcon.vue'
import SiteIcon from './SiteIcon.vue'
import { isExternal, useLink } from './interactive-utils'

// A prominent link to another page: optional icon, the label, a short teaser from the text inside, an arrow.
// Without `label` the link shows its address. Several in a row join into one list.
defineProps<{ href: string; label?: string; icon?: string }>()
const link = useLink()
</script>

<template>
  <a class="ginko-read-more" :href="href" :rel="link.rel(href)" :data-link="isExternal(href) ? 'external' : 'internal'" @click="link.onClick($event, href)">
    <span v-if="icon" class="ginko-read-more-icon"><SiteIcon :name="icon" /></span>
    <span class="ginko-read-more-copy">
      <span class="ginko-read-more-label">{{ label || href }}</span>
      <span v-if="$slots.default" class="ginko-read-more-body"><slot /></span>
    </span>
    <CodeIcon :name="isExternal(href) ? 'arrow-up-right' : 'arrow-right'" class="ginko-read-more-arrow" />
  </a>
</template>
