<script setup lang="ts">
import { computed } from 'vue'
import CodeIcon from './CodeIcon.vue'
import SiteIcon from './SiteIcon.vue'
import { isExternal, isOn, useLink } from './interactive-utils'

// A card; with `href` the whole card is clickable. The <a> sits on the title and stretches over the card (CSS
// `::after`), so links in the content stay valid HTML (no <a> inside <a>) and work without JavaScript. `icon` shows
// in a small tile above the title; an external link shows an arrow in the corner.
const props = defineProps<{
  title?: string; description?: string; footer?: string; href?: string; image?: string; icon?: string; horizontal?: boolean | string
  /** Colour of the icon tile: a status colour or the primary colour; without it the tile stays neutral. */
  iconColor?: 'primary' | 'info' | 'success' | 'warning' | 'error'
  appearance?: 'quiet' | 'tint'
}>()
const horizontal = computed(() => isOn(props.horizontal))
const external = computed(() => !!props.href && isExternal(props.href))
const link = useLink()
</script>

<template>
  <div
    class="ginko-card"
    :data-link="href ? (external ? 'external' : 'internal') : undefined"
    :data-horizontal="horizontal || undefined"
    :data-icon-color="icon && iconColor ? iconColor : undefined"
    :data-appearance="appearance"
  >
    <img v-if="image" class="ginko-card-image" :src="image" alt="" loading="lazy">
    <div class="ginko-card-main">
      <span v-if="icon" class="ginko-card-icon"><SiteIcon :name="icon" /></span>
      <p v-if="title" class="ginko-card-title">
        <a v-if="href" class="ginko-card-link" :href="href" :rel="link.rel(href)" @click="link.onClick($event, href)">{{ title }}</a>
        <template v-else>{{ title }}</template>
      </p>
      <a v-else-if="href" class="ginko-card-link" :href="href" :rel="link.rel(href)" :aria-label="description || href" @click="link.onClick($event, href)" />
      <p v-if="description" class="ginko-card-description">{{ description }}</p>
      <div v-if="$slots.default" class="ginko-card-body"><slot /></div>
      <p v-if="footer" class="ginko-card-footer">{{ footer }}</p>
    </div>
    <CodeIcon v-if="external" name="arrow-up-right" class="ginko-card-arrow" />
  </div>
</template>
