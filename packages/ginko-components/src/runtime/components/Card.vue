<script setup lang="ts">
import { computed } from 'vue'
import CodeIcon from './CodeIcon.vue'
import SiteIcon from './SiteIcon.vue'
import { isExternal, isOn, useLink } from './interactive-utils'

// A card; with `href` the whole card is one link (an <a>, so it also works without JavaScript). `icon` shows in a
// small tile above the title; an external link shows an arrow in the corner.
const props = defineProps<{
  title?: string; description?: string; footer?: string; href?: string; image?: string; icon?: string; horizontal?: boolean | string
  /** Colour of the icon tile: a status colour or the primary colour; without it the tile stays neutral. */
  iconColor?: 'primary' | 'info' | 'success' | 'warning' | 'error'
}>()
const horizontal = computed(() => isOn(props.horizontal))
const external = computed(() => !!props.href && isExternal(props.href))
const link = useLink()
</script>

<template>
  <component
    :is="href ? 'a' : 'div'"
    class="ginko-card"
    :href="href || undefined"
    :rel="href ? link.rel(href) : undefined"
    :data-link="href ? (external ? 'external' : 'internal') : undefined"
    :data-horizontal="horizontal || undefined"
    :data-icon-color="icon && iconColor ? iconColor : undefined"
    @click="href && link.onClick($event, href)"
  >
    <img v-if="image" class="ginko-card-image" :src="image" alt="" loading="lazy">
    <div class="ginko-card-main">
      <span v-if="icon" class="ginko-card-icon"><SiteIcon :name="icon" /></span>
      <p v-if="title" class="ginko-card-title">{{ title }}</p>
      <p v-if="description" class="ginko-card-description">{{ description }}</p>
      <div v-if="$slots.default" class="ginko-card-body"><slot /></div>
      <p v-if="footer" class="ginko-card-footer">{{ footer }}</p>
    </div>
    <CodeIcon v-if="external" name="arrow-up-right" class="ginko-card-arrow" />
  </component>
</template>
