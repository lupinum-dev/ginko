<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { embedUrl, parseVideoUrl } from './video-utils'
import { useText } from './text'

// Click to load: YouTube and Vimeo get a poster and a play button. Nothing from the provider is requested (no
// iframe, no thumbnail) until the visitor clicks. A direct .mp4/.webm file is a native <video>; any other address
// is only a link.
const props = defineProps<{ src: string; title: string; poster?: string; start?: number | string }>()
const t = useText()

const source = computed(() => parseVideoUrl(props.src, props.start === undefined ? undefined : Number(props.start)))
const provider = computed(() => (source.value?.kind === 'vimeo' ? 'Vimeo' : 'YouTube'))
const playing = ref(false)
const frame = ref<HTMLIFrameElement>()

async function play() {
  playing.value = true
  await nextTick()
  frame.value?.focus()
}
</script>

<template>
  <div class="ginko-video" :data-kind="source ? (source.kind === 'file' || source.kind === 'link' ? source.kind : 'embed') : 'invalid'">
    <template v-if="source?.kind === 'youtube' || source?.kind === 'vimeo'">
      <iframe
        v-if="playing"
        ref="frame"
        class="ginko-video-frame"
        :src="embedUrl(source)"
        :title="title"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
      <template v-else>
        <button type="button" class="ginko-video-poster" :aria-label="`${t('media.play')}: ${title}`" @click="play">
          <img v-if="poster" class="ginko-video-poster-image" :src="poster" alt="" loading="lazy" decoding="async">
          <svg class="ginko-video-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
        </button>
        <p class="ginko-video-consent">{{ t('media.consent', { provider }) }}</p>      </template>
    </template>
    <video v-else-if="source?.kind === 'file'" class="ginko-video-file" controls preload="none" :poster="poster" :aria-label="title" :src="source.url" />
    <a v-else-if="source?.kind === 'link'" class="ginko-video-link" :href="source.url" rel="noreferrer noopener">{{ title }}</a>
    <p v-else class="ginko-video-link">{{ title }}</p>
  </div>
</template>
