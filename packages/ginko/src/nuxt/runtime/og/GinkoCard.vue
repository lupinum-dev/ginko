<script setup lang="ts">
// The social share card, rendered by nuxt-og-image (Takumi or Satori) at 1200×630. The brand colour fills the card;
// a page image fades into it from the right. Inline styles and flexbox only: both renderers support them. The module
// copies this file to `components/OgImage/GinkoCard.<renderer>.vue` in the build directory (the renderer is part of
// the file name).
const { title = '', description = '', siteName = '', section = '', image = '', logo = '', color = '#1f2937' } = defineProps<{
  title?: string
  description?: string
  siteName?: string
  /** Small label above the title (docs: the section). */
  section?: string
  /** The page's image: a path on the site or an absolute URL. */
  image?: string
  /** The site's logo (`seo.organization.logo`): a path on the site or an absolute URL. */
  logo?: string
  /** The brand colour, `#rrggbb` or `#rgb` (`seo.color`, checked by checkSite). */
  color?: string
}>()

const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(color)
const rgb = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : /^#[\da-f]{6}$/i.test(color) ? color : '#1f2937'
// The text colour with the higher WCAG contrast against the brand colour: dark on light, white on dark.
const channel = (hex: string) => {
  const c = Number.parseInt(hex, 16) / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => 0.2126 * channel(hex.slice(1, 3)) + 0.7152 * channel(hex.slice(3, 5)) + 0.0722 * channel(hex.slice(5, 7))
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
const ink = contrast(rgb, '#111827') > contrast(rgb, '#ffffff') ? '#111827' : '#ffffff'
// Next to a photo the text column is narrower, so the title gets smaller sooner.
const titleSize = image ? (title.length > 22 ? 60 : 72) : (title.length > 42 ? 64 : 80)
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
</script>

<template>
  <div :style="{ width: '100%', height: '100%', display: 'flex', position: 'relative', backgroundColor: rgb, color: ink }">
    <img v-if="image" :src="image" :style="{ position: 'absolute', right: '0px', top: '0px', width: '760px', height: '630px', objectFit: 'cover' }">
    <div v-if="image" :style="{ position: 'absolute', right: '0px', top: '0px', width: '760px', height: '630px', backgroundImage: `linear-gradient(90deg, ${rgb} 0%, ${rgb}cc 30%, ${rgb}00 75%)` }" />
    <img v-else-if="logo" :src="logo" :style="{ position: 'absolute', right: '-110px', bottom: '-150px', width: '620px', height: '620px', objectFit: 'contain', opacity: 0.14 }">
    <div :style="{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: image ? '700px' : '1060px', padding: '64px 0 56px 72px' }">
      <div :style="{ display: 'flex', alignItems: 'center' }">
        <div v-if="logo" :style="{ display: 'flex', width: '64px', height: '64px', padding: '10px', marginRight: '16px', borderRadius: '16px', backgroundColor: '#ffffff' }">
          <img :src="logo" :style="{ width: '44px', height: '44px', objectFit: 'contain' }">
        </div>
        <div :style="{ fontSize: '30px', fontWeight: 700 }">{{ siteName }}</div>
      </div>
      <div :style="{ display: 'flex', flexDirection: 'column' }">
        <div v-if="section" :style="{ display: 'flex', marginBottom: '22px' }">
          <div :style="{ fontSize: '24px', fontWeight: 700, padding: '10px 18px', borderRadius: '999px', backgroundColor: ink, color: rgb }">{{ clip(section, 40) }}</div>
        </div>
        <div :style="{ fontSize: `${titleSize}px`, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }">{{ clip(title, 90) }}</div>
        <div v-if="description" :style="{ fontSize: '30px', lineHeight: 1.35, marginTop: '22px', opacity: 0.85 }">{{ clip(description, image ? 110 : 150) }}</div>
      </div>
    </div>
  </div>
</template>
