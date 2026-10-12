<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { isOn } from './interactive-utils'
import { useText } from './text'

// An image with a caption. A click opens it larger in a native <dialog> (Escape closes it, focus returns to the
// image). Without JavaScript the image is simply shown.
const props = withDefaults(defineProps<{
  src: string; alt: string; caption?: string; width?: number | string; height?: number | string
  bleed?: boolean | string; aspect?: string; fit?: string; placement?: string; frame?: string; focus?: string
  zoom?: boolean | string
}>(), { zoom: 'true' })
const t = useText()

const zoomOn = () => isOn(props.zoom)
const trigger = ref<HTMLButtonElement>()
const dialog = ref<HTMLDialogElement>()

function open() { dialog.value?.showModal() }
function close() { dialog.value?.close() }
// The native dialog restores focus itself in most browsers; doing it here makes it certain.
async function onClose() { await nextTick(); trigger.value?.focus() }
// A click on the backdrop lands on the <dialog> itself, not on its content.
function onBackdrop(event: MouseEvent) { if (event.target === dialog.value) close() }
</script>

<template>
  <figure
    class="ginko-figure"
    :data-bleed="isOn(bleed) || undefined"
    :data-aspect="aspect || undefined"
    :data-fit="fit || undefined"
    :data-placement="placement || undefined"
    :data-frame="frame || undefined"
    :data-focus="focus || undefined"
  >
    <div class="ginko-figure-visual">
      <button v-if="zoomOn()" ref="trigger" type="button" class="ginko-figure-trigger" :aria-label="`${t('media.zoom')}: ${alt}`" @click="open">
        <img :src="src" :alt="alt" :width="width" :height="height" loading="lazy" decoding="async">
      </button>
      <img v-else :src="src" :alt="alt" :width="width" :height="height" loading="lazy" decoding="async">
    </div>
    <figcaption v-if="caption" class="ginko-figure-caption">{{ caption }}</figcaption>
    <dialog v-if="zoomOn()" ref="dialog" class="ginko-figure-dialog" :aria-label="alt" @close="onClose" @click="onBackdrop">
      <img :src="src" :alt="alt" loading="lazy" decoding="async">
      <p v-if="caption" class="ginko-figure-dialog-caption">{{ caption }}</p>
      <button type="button" class="ginko-figure-close" :aria-label="t('media.close')" @click="close">&times;</button>
    </dialog>
  </figure>
</template>
