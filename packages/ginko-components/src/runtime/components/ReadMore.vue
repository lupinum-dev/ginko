<script setup lang="ts">
import CodeIcon from './CodeIcon.vue'
import SiteIcon from './SiteIcon.vue'
import { isExternal, useLink } from './interactive-utils'

// A prominent link to another page: optional icon, the label, a short teaser from the text inside, an arrow.
// Without `label` the link shows its address. Several in a row join into one list. The <a> sits on the label and
// stretches over the row (CSS `::after`), so links in the teaser stay valid HTML (no <a> inside <a>).
defineProps<{ href: string; label?: string; icon?: string }>()
const link = useLink()
</script>

<template>
  <div class="ginko-read-more" :data-link="isExternal(href) ? 'external' : 'internal'">
    <span v-if="icon" class="ginko-read-more-icon"><SiteIcon :name="icon" /></span>
    <span class="ginko-read-more-copy">
      <a class="ginko-read-more-label" :href="href" :rel="link.rel(href)" @click="link.onClick($event, href)">{{ label || href }}</a>
      <span v-if="$slots.default" class="ginko-read-more-body"><slot /></span>
    </span>
    <CodeIcon :name="isExternal(href) ? 'arrow-up-right' : 'arrow-right'" class="ginko-read-more-arrow" />
  </div>
</template>
