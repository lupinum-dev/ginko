<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue'
import { EMBED_PROVIDERS_KEY, matchEmbed, mergeProviders } from './embed-utils'
import { useText } from './text'

// Click to load: a known provider (see embed-utils.ts) gets a neutral surface and a button. Nothing from the provider
// is requested (no iframe, no thumbnail) until the visitor clicks. An unknown https address is only a link; unsafe
// addresses (javascript:, data:) are only text.
const props = defineProps<{ src: string; title: string; poster?: string }>()
const t = useText()
const providers = inject(EMBED_PROVIDERS_KEY, null) ?? mergeProviders()

const source = computed(() => matchEmbed(props.src, providers))
const loaded = ref(false)
const frame = ref<HTMLIFrameElement>()
const size = computed(() => {
  const s = source.value
  if (s?.kind !== 'embed') return undefined
  return s.height ? { height: `${s.height}px` } : { aspectRatio: s.ratio }
})

async function load() {
  loaded.value = true
  await nextTick()
  frame.value?.focus()
}
</script>

<template>
  <div class="ginko-embed" :data-kind="source ? source.kind : 'invalid'">
    <template v-if="source?.kind === 'embed'">
      <iframe
        v-if="loaded"
        ref="frame"
        class="ginko-embed-frame"
        :style="size"
        :src="source.url"
        :title="title"
        :allow="source.allow || undefined"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        allowfullscreen
      />
      <template v-else>
        <button type="button" class="ginko-embed-surface" :style="size" @click="load">
          <img v-if="poster" class="ginko-embed-poster" :src="poster" alt="" loading="lazy" decoding="async">
          <span class="ginko-embed-action">
            <svg class="ginko-embed-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
            <span>{{ t('embed.load') }}: {{ title }}</span>
          </span>
        </button>
        <p class="ginko-embed-consent">{{ t('embed.consent', { provider: source.name }) }}</p>
      </template>
    </template>
    <a v-else-if="source?.kind === 'link'" class="ginko-embed-link" :href="source.url" rel="noopener">{{ title }}</a>
    <p v-else class="ginko-embed-link">{{ title }}</p>
  </div>
</template>
