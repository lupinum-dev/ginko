<script setup lang="ts">
// The default social share card, rendered by nuxt-og-image (Takumi or Satori). Inline styles only: both
// renderers support them, and the card needs no Tailwind. The module copies this file to
// `components/OgImage/GinkoCard.<renderer>.vue` in the build directory (the renderer is part of the file name).
const { title = 'Title', description = '', siteName = '', section = '', color = '#1f6feb' } = defineProps<{
  title?: string
  description?: string
  siteName?: string
  /** Small label above the title (docs: the section). */
  section?: string
  color?: string
}>()
</script>

<template>
  <div :style="{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px', backgroundColor: '#ffffff', color: '#111827', borderLeft: `24px solid ${color}` }">
    <div :style="{ display: 'flex', flexDirection: 'column' }">
      <div v-if="section" :style="{ fontSize: '28px', fontWeight: 700, color, marginBottom: '16px' }">{{ section }}</div>
      <div :style="{ fontSize: title.length > 60 ? '56px' : '72px', fontWeight: 700, lineHeight: 1.1 }">{{ title }}</div>
      <div v-if="description" :style="{ fontSize: '32px', color: '#4b5563', marginTop: '24px', lineHeight: 1.3 }">{{ description.length > 160 ? `${description.slice(0, 157)}...` : description }}</div>
    </div>
    <div :style="{ fontSize: '30px', fontWeight: 700, color }">{{ siteName }}</div>
  </div>
</template>
